import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { SettingKey, SettingsState } from '../shared/types';

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  WORK_DIARY_COPILOT_MODEL: 'gpt-4.1',
  WORK_DIARY_SHOW_ON_TOP: 'true',
  WORK_DIARY_AUTO_GENERATE: 'false',
  WORK_DIARY_SLACK_LOOKBACK_DAYS: '7',
  WORK_DIARY_JIRA_URL: '',
  WORK_DIARY_JIRA_EMAIL: '',
  WORK_DIARY_JIRA_PROJECT: '',
};

type Stored = Partial<Record<SettingKey, string>>;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function load(): Stored {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Stored;
  } catch {
    return {};
  }
}

/** Environment variable first, then the saved value, then the default. */
export function getSetting(key: SettingKey): string {
  return (
    process.env[key]?.trim() || load()[key]?.trim() || SETTING_DEFAULTS[key]
  );
}

export function getShowOnTop(): boolean {
  return getSetting('WORK_DIARY_SHOW_ON_TOP').toLowerCase() !== 'false';
}

export function getSettings(): SettingsState {
  const stored = load();
  const state = {} as SettingsState;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const env = process.env[key]?.trim();
    const saved = stored[key]?.trim();
    state[key] = env
      ? { value: env, source: 'env' }
      : saved
        ? { value: saved, source: 'saved' }
        : { value: SETTING_DEFAULTS[key], source: 'default' };
  }
  return state;
}

/** Saves non-empty values; an empty string reverts the setting to its default. */
export function setSettings(updates: Stored): void {
  const stored = load();
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const value = updates[key]?.trim();
    if (value === undefined) continue;
    if (value) stored[key] = value;
    else delete stored[key];
  }
  fs.writeFileSync(settingsFile(), JSON.stringify(stored, null, 2));
}
