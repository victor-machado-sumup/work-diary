import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  SecretKey,
  SecretsStatus,
  SettingKey,
  SettingsState,
} from '@/shared/types';

const FIELDS: { key: SecretKey; label: string }[] = [
  { key: 'WORK_DIARY_GOOGLE_CLIENT_ID', label: 'Google client ID' },
  { key: 'WORK_DIARY_GOOGLE_CLIENT_SECRET', label: 'Google client secret' },
  { key: 'WORK_DIARY_GITHUB_TOKEN', label: 'GitHub token' },
  { key: 'WORK_DIARY_SLACK_TOKEN', label: 'Slack token' },
];

const OPTIONS: { key: SettingKey; label: string; hint: string }[] = [
  {
    key: 'WORK_DIARY_COPILOT_MODEL',
    label: 'Copilot model',
    hint: 'e.g. gpt-4.1',
  },
  {
    key: 'WORK_DIARY_SLACK_LOOKBACK_DAYS',
    label: 'Slack lookback (days)',
    hint: 'e.g. 7',
  },
];

// Slack is currently disabled, so it never forces the dialog open.
const REQUIRED: SecretKey[] = [
  'WORK_DIARY_GOOGLE_CLIENT_ID',
  'WORK_DIARY_GOOGLE_CLIENT_SECRET',
  'WORK_DIARY_GITHUB_TOKEN',
];

const STATUS_TEXT = {
  env: 'Set via environment variable (takes precedence)',
  saved: 'Saved. Leave blank to keep it, or type to replace.',
  missing: 'Not set',
} as const;

export function SettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after saving with the keys that were actually changed. */
  onSaved: (secrets: SecretKey[], settings: SettingKey[]) => void;
}) {
  const [status, setStatus] = useState<SecretsStatus | null>(null);
  const [values, setValues] = useState<Partial<Record<SecretKey, string>>>({});
  const [options, setOptions] = useState<SettingsState | null>(null);
  const [optionValues, setOptionValues] = useState<
    Partial<Record<SettingKey, string>>
  >({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({});
    setOptionValues({});
    setError(null);
    void window.secrets.getStatus().then(setStatus);
    void window.settings.get().then(setOptions);
  }, [open]);

  const save = async () => {
    try {
      const updates: Partial<Record<SecretKey, string>> = {};
      for (const { key } of FIELDS) {
        // Only send fields the user typed into; untouched fields keep their value.
        if (values[key]?.trim()) updates[key] = values[key];
      }
      await window.secrets.set(updates);
      // Options are prefilled with the current value, so only send changes.
      const changed: Partial<Record<SettingKey, string>> = {};
      for (const [k, v] of Object.entries(optionValues) as [
        SettingKey,
        string,
      ][]) {
        if (options && v !== options[k].value) changed[k] = v;
      }
      await window.settings.set(changed);
      onSaved(
        Object.keys(updates) as SecretKey[],
        Object.keys(changed) as SettingKey[],
      );
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Credentials are stored encrypted on this machine. Environment
            variables take precedence over saved values.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span>{label}</span>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                disabled={status?.[key] === 'env'}
                placeholder={status ? STATUS_TEXT[status[key]] : ''}
                value={values[key] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <hr className="border-border" />
          {OPTIONS.map(({ key, label, hint }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span>
                {label}
                {options?.[key].source === 'env' && (
                  <span className="text-muted-foreground">
                    {' '}
                    (set via environment variable)
                  </span>
                )}
              </span>
              <Input
                placeholder={hint}
                disabled={options?.[key].source === 'env'}
                value={optionValues[key] ?? options?.[key].value ?? ''}
                onChange={(e) =>
                  setOptionValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={options?.WORK_DIARY_SHOW_ON_TOP.source === 'env'}
              checked={
                (
                  optionValues.WORK_DIARY_SHOW_ON_TOP ??
                  options?.WORK_DIARY_SHOW_ON_TOP.value ??
                  'true'
                ).toLowerCase() !== 'false'
              }
              onChange={(e) =>
                setOptionValues((v) => ({
                  ...v,
                  WORK_DIARY_SHOW_ON_TOP: e.target.checked ? 'true' : 'false',
                }))
              }
            />
            <span>
              Keep window always on top
              {options?.WORK_DIARY_SHOW_ON_TOP.source === 'env' && (
                <span className="text-muted-foreground">
                  {' '}
                  (set via environment variable)
                </span>
              )}
            </span>
          </label>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** True when a required credential is neither in the env nor saved. */
export async function hasMissingRequiredSecrets(): Promise<boolean> {
  const status = await window.secrets.getStatus();
  return REQUIRED.some((k) => status[k] === 'missing');
}
