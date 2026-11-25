import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import type {
  OAuthClientInformationContext,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  OAuthTokens,
} from '@modelcontextprotocol/client';
import { app, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MCP_URL = new URL('https://mcp.notion.com/mcp');
/**
 * Fixed loopback port: the redirect URI is part of the dynamic client
 * registration, and re-registering orphans previously granted tokens.
 */
const CALLBACK_PORT = 47615;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const PROTOCOL_VERSION = '2026-07-28';

interface Stored {
  /** Dynamic client registrations, keyed by authorization server issuer. */
  clients: Record<string, OAuthClientInformationMixed>;
  tokens?: OAuthTokens;
  discovery?: OAuthDiscoveryState;
}

const storeFile = () => path.join(app.getPath('userData'), 'notion-mcp.bin');

async function load(): Promise<Stored> {
  try {
    const raw = await fs.promises.readFile(storeFile());
    const json = (await safeStorage.isAsyncEncryptionAvailable())
      ? await safeStorage.decryptStringAsync(raw)
      : { result: raw.toString('utf8') };
    return JSON.parse(json.result) as Stored;
  } catch {
    return { clients: {} };
  }
}

async function save(stored: Stored) {
  const json = JSON.stringify(stored);
  const data = (await safeStorage.isAsyncEncryptionAvailable())
    ? await safeStorage.encryptStringAsync(json)
    : Buffer.from(json, 'utf8');
  await fs.promises.writeFile(storeFile(), data, { mode: 0o600 });
}

/** OAuth provider persisting registration and tokens in the encrypted store. */
class Provider implements OAuthClientProvider {
  readonly redirectUrl = REDIRECT_URI;
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Work Diary',
    redirect_uris: [REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
  };
  lastState?: string;
  private verifier?: string;

  constructor(
    private stored: Stored,
    private onRedirect: (url: URL) => void,
  ) {}

  clientInformation(ctx?: OAuthClientInformationContext) {
    return ctx ? this.stored.clients[ctx.issuer] : undefined;
  }
  async saveClientInformation(
    info: OAuthClientInformationMixed,
    ctx?: OAuthClientInformationContext,
  ) {
    if (!ctx) return;
    this.stored.clients[ctx.issuer] = info;
    await save(this.stored);
  }
  tokens() {
    return this.stored.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    this.stored.tokens = tokens;
    await save(this.stored);
  }
  state() {
    this.lastState = crypto.randomUUID();
    return this.lastState;
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.stored.discovery = state;
  }
  discoveryState() {
    return this.stored.discovery;
  }
  redirectToAuthorization(url: URL) {
    this.onRedirect(url);
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    if (!this.verifier) throw new Error('Missing PKCE code verifier.');
    return this.verifier;
  }
}

const newClient = () =>
  new Client(
    { name: 'work-diary', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
  );

export async function isConnected(): Promise<boolean> {
  return (await load()).tokens !== undefined;
}

/** Forgets the tokens; keeps the client registration so it is reused. */
export async function disconnect(): Promise<void> {
  const stored = await load();
  delete stored.tokens;
  delete stored.discovery;
  await save(stored);
}

/** Opens the system browser for consent (loopback redirect + PKCE + DCR). */
export async function connect(): Promise<void> {
  const stored = await load();
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', () => resolve());
  });

  try {
    const callback = new Promise<URLSearchParams>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Notion sign-in timed out.')),
        5 * 60 * 1000,
      );
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', REDIRECT_URI);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<p>You can close this tab and return to Work Diary.</p>');
        clearTimeout(timeout);
        resolve(url.searchParams);
      });
    });
    // Avoid an unhandled rejection if connect() succeeds without a redirect.
    callback.catch(() => {});

    const provider = new Provider(stored, (url) => {
      void shell.openExternal(url.toString());
    });
    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      authProvider: provider,
    });
    const client = newClient();
    try {
      await client.connect(transport);
      await client.close();
      return; // Already authorized.
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) throw e;
    }

    const params = await callback;
    const error = params.get('error');
    if (error) throw new Error(`Notion sign-in failed: ${error}`);
    if (params.get('state') !== provider.lastState) {
      throw new Error('Notion sign-in state mismatch.');
    }
    await transport.finishAuth(params);

    // Reconnect on a fresh transport to verify the tokens work.
    const verify = newClient();
    await verify.connect(
      new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider }),
    );
    await verify.close();
  } finally {
    server.close();
  }
}

export interface NotionTools {
  /** Calls a Notion MCP tool and returns its JSON result. */
  call: <T>(name: string, args: Record<string, unknown>) => Promise<T>;
}

export const log = (...args: unknown[]) => console.log('[notion]', ...args);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Text of a tool result (the Notion tools reply with one JSON text block). */
function textOf(result: { content?: unknown }): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((b: { type?: string; text?: string }) =>
      b.type === 'text' ? (b.text ?? '') : '',
    )
    .join('');
}

const MAX_ATTEMPTS = 4;

/**
 * Runs `fn` with an authenticated MCP client. Tool calls are retried when
 * Notion reports a rate limit, waiting for the `retry_after_seconds` it gives.
 */
export async function withNotion<T>(
  fn: (tools: NotionTools) => Promise<T>,
): Promise<T> {
  const stored = await load();
  if (!stored.tokens) throw new Error('Not connected to Notion.');

  let redirected = false;
  const provider = new Provider(stored, () => {
    redirected = true;
  });
  const client = newClient();
  try {
    await client.connect(
      new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider }),
    );
  } catch (e) {
    log('connect failed:', e instanceof Error ? e.message : e);
    if (e instanceof UnauthorizedError || redirected) {
      await disconnect();
      throw new Error('Notion authorization expired. Please reconnect.');
    }
    throw e;
  }

  const call = async <R>(name: string, args: Record<string, unknown>) => {
    for (let attempt = 1; ; attempt++) {
      const t0 = Date.now();
      const result = await client.callTool({ name, arguments: args });
      const text = textOf(result);
      log(
        `${name} attempt ${attempt}`,
        JSON.stringify(args),
        `-> ${result.isError ? 'ERROR' : 'ok'} ${text.length} chars in ${Date.now() - t0}ms`,
      );
      if (!result.isError) return JSON.parse(text) as R;
      const limited = /rate_limited/.test(text);
      if (limited && attempt < MAX_ATTEMPTS) {
        log(`${name} rate limited:`, text.slice(0, 300));
        const wait = Number(
          /"retry_after_seconds"\s*:\s*(\d+)/.exec(text)?.[1],
        );
        await sleep((wait || 2 ** attempt) * 1000 + Math.random() * 250);
        continue;
      }
      log(`${name} failed:`, text.slice(0, 500));
      throw new Error(`Notion ${name} failed: ${text.slice(0, 300)}`);
    }
  };

  try {
    return await fn({ call });
  } finally {
    await client.close().catch(() => {});
  }
}
