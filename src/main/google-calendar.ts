import { app, safeStorage, shell } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import type { CalendarEvent } from '../shared/types';
import { getSecret } from './secrets';
import { getTodayRange } from './today';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

interface StoredTokens {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

const tokenFile = () => path.join(app.getPath('userData'), 'google-token.bin');

async function getCredentials() {
  const clientId = await getSecret('WORK_DIARY_GOOGLE_CLIENT_ID');
  const clientSecret = await getSecret('WORK_DIARY_GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Google client ID / secret. Set WORK_DIARY_GOOGLE_CLIENT_ID / WORK_DIARY_GOOGLE_CLIENT_SECRET or add them in Settings.',
    );
  }
  return { clientId, clientSecret };
}

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await fs.promises.readFile(tokenFile());
    const json = (await safeStorage.isAsyncEncryptionAvailable())
      ? await safeStorage.decryptStringAsync(raw)
      : { result: raw.toString('utf8') };
    return JSON.parse(json.result) as StoredTokens;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens) {
  const json = JSON.stringify(tokens);
  const data = (await safeStorage.isAsyncEncryptionAvailable())
    ? await safeStorage.encryptStringAsync(json)
    : Buffer.from(json, 'utf8');
  await fs.promises.writeFile(tokenFile(), data, { mode: 0o600 });
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

export function disconnect() {
  fs.rmSync(tokenFile(), { force: true });
}

async function postToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(
      `Google token request failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

/** Opens the system browser for consent (loopback redirect + PKCE). */
export async function connect(): Promise<void> {
  const { clientId, clientSecret } = await getCredentials();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const server = http.createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as { port: number };
  const redirectUri = `http://127.0.0.1:${port}`;

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Google sign-in timed out.')),
        5 * 60 * 1000,
      );
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri);
        const error = url.searchParams.get('error');
        const got = url.searchParams.get('code');
        if (!error && !got) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<p>You can close this tab and return to Work Diary.</p>');
        clearTimeout(timeout);
        if (error) reject(new Error(`Google sign-in failed: ${error}`));
        else if (url.searchParams.get('state') !== state)
          reject(new Error('Google sign-in state mismatch.'));
        else resolve(got!);
      });

      const authUrl = new URL(AUTH_URL);
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      }).toString();
      void shell.openExternal(authUrl.toString());
    });

    const tok = await postToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    if (!tok.refresh_token) {
      throw new Error('Google did not return a refresh token.');
    }
    await saveTokens({
      refreshToken: tok.refresh_token,
      accessToken: tok.access_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    });
  } finally {
    server.close();
  }
}

async function getAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Not connected to Google Calendar.');
  if (
    tokens.accessToken &&
    tokens.expiresAt &&
    tokens.expiresAt > Date.now() + 60_000
  ) {
    return tokens.accessToken;
  }
  const { clientId, clientSecret } = await getCredentials();
  const tok = await postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });
  await saveTokens({
    refreshToken: tokens.refreshToken,
    accessToken: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  });
  return tok.access_token;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();
  const { start, end } = getTodayRange();

  const url = new URL(EVENTS_URL);
  url.search = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  }).toString();

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    disconnect();
    throw new Error('Google authorization expired. Please reconnect.');
  }
  if (!res.ok) {
    throw new Error(
      `Google Calendar request failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { items?: GoogleEvent[] };
  return (data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary || '(No title)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      allDay: !e.start?.dateTime,
      url: e.htmlLink ?? 'https://calendar.google.com',
    }));
}
