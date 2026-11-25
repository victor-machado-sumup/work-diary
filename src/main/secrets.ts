import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { SecretKey, SecretsStatus } from '../shared/types';

export const SECRET_KEYS: SecretKey[] = [
  'WORK_DIARY_GOOGLE_CLIENT_ID',
  'WORK_DIARY_GOOGLE_CLIENT_SECRET',
  'WORK_DIARY_GITHUB_TOKEN',
  'WORK_DIARY_SLACK_TOKEN',
];

type Stored = Partial<Record<SecretKey, string>>;

const secretsFile = () => path.join(app.getPath('userData'), 'secrets.bin');

async function load(): Promise<Stored> {
  try {
    const raw = await fs.promises.readFile(secretsFile());
    const json = (await safeStorage.isAsyncEncryptionAvailable())
      ? (await safeStorage.decryptStringAsync(raw)).result
      : raw.toString('utf8');
    return JSON.parse(json) as Stored;
  } catch {
    return {};
  }
}

async function save(values: Stored) {
  const json = JSON.stringify(values);
  const data = (await safeStorage.isAsyncEncryptionAvailable())
    ? await safeStorage.encryptStringAsync(json)
    : Buffer.from(json, 'utf8');
  await fs.promises.writeFile(secretsFile(), data, { mode: 0o600 });
}

/** Environment variable first, then the value saved from the settings form. */
export async function getSecret(key: SecretKey): Promise<string | undefined> {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;
  return (await load())[key]?.trim() || undefined;
}

export async function getStatus(): Promise<SecretsStatus> {
  const stored = await load();
  const status = {} as SecretsStatus;
  for (const key of SECRET_KEYS) {
    status[key] = process.env[key]?.trim()
      ? 'env'
      : stored[key]?.trim()
        ? 'saved'
        : 'missing';
  }
  return status;
}

/** Saves non-empty values; an empty string clears the saved value. */
export async function setSecrets(updates: Stored): Promise<void> {
  const stored = await load();
  for (const key of SECRET_KEYS) {
    const value = updates[key]?.trim();
    if (value === undefined) continue;
    if (value) stored[key] = value;
    else delete stored[key];
  }
  await save(stored);
}
