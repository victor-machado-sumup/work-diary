import { app, safeStorage, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { getSetting } from './settings';

// VS Code's GitHub Copilot OAuth app (public client id, device flow).
const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const CHAT_URL = 'https://api.githubcopilot.com/chat/completions';
const RESPONSES_URL = 'https://api.githubcopilot.com/responses';
const MODELS_URL = 'https://api.githubcopilot.com/models';

const HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'Editor-Version': 'vscode/1.99.3',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
};

const model = () => getSetting('WORK_DIARY_COPILOT_MODEL');

const tokenFile = () => path.join(app.getPath('userData'), 'copilot-token.bin');

async function loadOAuthToken(): Promise<string | null> {
  const fromEnv = process.env.WORK_DIARY_COPILOT_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = await fs.promises.readFile(tokenFile());
    const json = (await safeStorage.isAsyncEncryptionAvailable())
      ? await safeStorage.decryptStringAsync(raw)
      : { result: raw.toString('utf8') };
    return json.result;
  } catch {
    return null;
  }
}

async function saveOAuthToken(token: string) {
  const data = (await safeStorage.isAsyncEncryptionAvailable())
    ? await safeStorage.encryptStringAsync(token)
    : Buffer.from(token, 'utf8');
  await fs.promises.writeFile(tokenFile(), data, { mode: 0o600 });
}

export async function isConnected(): Promise<boolean> {
  return (await loadOAuthToken()) !== null;
}

export function disconnect() {
  fs.rmSync(tokenFile(), { force: true });
  cached = null;
}

/** GitHub device flow. Sends the user code to the renderer and waits for approval. */
export async function connect(sender: WebContents): Promise<void> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: 'read:user' }),
  });
  if (!res.ok) throw new Error(`GitHub device code failed (${res.status}).`);
  const device = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  };

  sender.send('copilot:deviceCode', {
    userCode: device.user_code,
    verificationUri: device.verification_uri,
  });
  void shell.openExternal(device.verification_uri);

  let interval = device.interval;
  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, (interval + 1) * 1000));
    const poll = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const body = (await poll.json()) as {
      access_token?: string;
      error?: string;
    };
    if (body.access_token) {
      await saveOAuthToken(body.access_token);
      return;
    }
    if (body.error === 'slow_down') interval += 5;
    else if (body.error && body.error !== 'authorization_pending') {
      throw new Error(`GitHub authorization failed: ${body.error}`);
    }
  }
  throw new Error('GitHub authorization timed out.');
}

let cached: { token: string; expiresAt: number } | null = null;

async function getCopilotToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const oauth = await loadOAuthToken();
  if (!oauth) throw new Error('Copilot is not connected.');
  const res = await fetch(COPILOT_TOKEN_URL, {
    headers: { Authorization: `token ${oauth}`, ...HEADERS },
  });
  if (!res.ok) {
    throw new Error(
      `Could not get a Copilot token (${res.status}). Is a Copilot subscription active for this account?`,
    );
  }
  const body = (await res.json()) as { token: string; expires_at: number };
  cached = { token: body.token, expiresAt: body.expires_at * 1000 };
  return cached.token;
}

/** Prompts are plain .md files so they can be edited without touching code. */
function readPrompt(name: string): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'prompts')
    : path.join(app.getAppPath(), 'prompts');
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

type Endpoint = 'chat-completions' | 'responses';

let endpointCache = new Map<string, Endpoint>();

/**
 * Picks the endpoint for a model from Copilot's own model list. Models that
 * offer /chat/completions, or list no endpoints at all (e.g. gpt-4.1), use chat
 * completions. Models served only on /responses (e.g. gpt-6.2-sol) use it.
 */
async function resolveEndpoint(
  modelId: string,
  token: string,
): Promise<Endpoint> {
  const known = endpointCache.get(modelId);
  if (known) return known;
  const res = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${token}`, ...HEADERS },
  });
  if (!res.ok) {
    throw new Error(`Could not list Copilot models (${res.status}).`);
  }
  const body = (await res.json()) as {
    data?: { id: string; supported_endpoints?: string[] }[];
  };
  endpointCache = new Map(
    (body.data ?? []).map((m): [string, Endpoint] => {
      const eps = m.supported_endpoints;
      const endpoint: Endpoint =
        eps && !eps.includes('/chat/completions') && eps.includes('/responses')
          ? 'responses'
          : 'chat-completions';
      return [m.id, endpoint];
    }),
  );
  const endpoint = endpointCache.get(modelId);
  if (!endpoint) {
    throw new Error(
      `Model "${modelId}" is not in your Copilot model list. Check WORK_DIARY_COPILOT_MODEL.`,
    );
  }
  return endpoint;
}

async function post(url: string, token: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Openai-Intent': 'conversation-panel',
      ...HEADERS,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      `Copilot request failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return res.json();
}

async function viaChatCompletions(
  token: string,
  system: string,
  user: string,
): Promise<string | undefined> {
  const body = (await post(CHAT_URL, token, {
    model: model(),
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content;
}

async function viaResponses(
  token: string,
  system: string,
  user: string,
): Promise<string | undefined> {
  const body = (await post(RESPONSES_URL, token, {
    model: model(),
    stream: false,
    store: false,
    instructions: system,
    input: [{ role: 'user', content: user }],
  })) as {
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  if (body.output_text) return body.output_text;
  return body.output
    ?.filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');
}

async function complete(system: string, user: string): Promise<string> {
  const token = await getCopilotToken();
  const endpoint = await resolveEndpoint(model(), token);
  const text = (
    endpoint === 'responses'
      ? await viaResponses(token, system, user)
      : await viaChatCompletions(token, system, user)
  )?.trim();
  if (!text) throw new Error('Copilot returned an empty response.');
  return text;
}

function buildSystemPrompt(): string {
  return readPrompt('main-prompt.md')
    .replace('{{example}}', () => readPrompt('example.md').trim())
    .replace('{{criteria}}', () => readPrompt('criteria.md').trim());
}

export function generateLog(activityContext: string): Promise<string> {
  return complete(
    buildSystemPrompt(),
    `Here is the activity of the day:\n\n${activityContext}`,
  );
}

export function reviseLog(
  currentText: string,
  request: string,
): Promise<string> {
  const system = `${buildSystemPrompt()}

## Revision

You will receive a log you wrote earlier (possibly edited by the user) and a
change request. Apply the request to the log and output
the full revised log only, following all the rules above.`;
  return complete(
    system,
    `Current log:\n\n${currentText}\n\nChange request:\n\n${request}`,
  );
}
