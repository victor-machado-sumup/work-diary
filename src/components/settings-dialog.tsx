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
  { key: 'WORK_DIARY_JIRA_TOKEN', label: 'Jira API token' },
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
  {
    key: 'WORK_DIARY_JIRA_URL',
    label: 'Jira URL',
    hint: 'e.g. https://your-company.atlassian.net',
  },
  {
    key: 'WORK_DIARY_JIRA_EMAIL',
    label: 'Jira email',
    hint: 'Atlassian account email',
  },
  {
    key: 'WORK_DIARY_JIRA_PROJECT',
    label: 'Jira project key',
    hint: 'e.g. RCVBLS (optional)',
  },
];

// Slack is currently disabled, so it never forces the dialog open.
const REQUIRED: SecretKey[] = [
  'WORK_DIARY_GOOGLE_CLIENT_ID',
  'WORK_DIARY_GOOGLE_CLIENT_SECRET',
  'WORK_DIARY_GITHUB_TOKEN',
];

const JIRA_ORDER: (SecretKey | SettingKey)[] = [
  'WORK_DIARY_JIRA_URL',
  'WORK_DIARY_JIRA_EMAIL',
  'WORK_DIARY_JIRA_TOKEN',
  'WORK_DIARY_JIRA_PROJECT',
];
const JIRA_KEYS: (SecretKey | SettingKey)[] = JIRA_ORDER;

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'sources', label: 'Data Sources' },
] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general');

  useEffect(() => {
    if (!open) return;
    setValues({});
    setOptionValues({});
    setError(null);
    setTab('general');
    void window.secrets.getStatus().then((st) => {
      setStatus(st);
      // Jump to the credentials when a required one is missing.
      if (REQUIRED.some((k) => st[k] === 'missing')) setTab('sources');
    });
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

  const renderSecret = ({ key, label }: { key: SecretKey; label: string }) => (
    <label key={key} className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        disabled={status?.[key] === 'env'}
        placeholder={status ? STATUS_TEXT[status[key]] : ''}
        value={values[key] ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </label>
  );

  const renderOption = ({
    key,
    label,
    hint,
  }: {
    key: SettingKey;
    label: string;
    hint: string;
  }) => (
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
  );

  const renderCheckbox = (
    key: SettingKey,
    label: string,
    defaultValue: string,
  ) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        disabled={options?.[key].source === 'env'}
        checked={
          (
            optionValues[key] ??
            options?.[key].value ??
            defaultValue
          ).toLowerCase() !== 'false'
        }
        onChange={(e) =>
          setOptionValues((v) => ({
            ...v,
            [key]: e.target.checked ? 'true' : 'false',
          }))
        }
      />
      <span>
        {label}
        {options?.[key].source === 'env' && (
          <span className="text-muted-foreground">
            {' '}
            (set via environment variable)
          </span>
        )}
      </span>
    </label>
  );

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
        <div className="flex gap-1 border-b" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
                tab === id
                  ? 'border-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-1">
          {tab === 'general' && (
            <>
              {renderOption(
                OPTIONS.find((o) => o.key === 'WORK_DIARY_COPILOT_MODEL')!,
              )}
              {renderCheckbox(
                'WORK_DIARY_AUTO_GENERATE',
                'Generate the log automatically once activity is loaded',
                'false',
              )}
              {renderCheckbox(
                'WORK_DIARY_SHOW_ON_TOP',
                'Keep window always on top',
                'true',
              )}
            </>
          )}
          {tab === 'sources' && (
            <>
              {FIELDS.filter((f) => !JIRA_KEYS.includes(f.key)).map(
                renderSecret,
              )}
              {OPTIONS.filter(
                (o) =>
                  !JIRA_KEYS.includes(o.key) &&
                  o.key !== 'WORK_DIARY_COPILOT_MODEL',
              ).map(renderOption)}
              <hr className="border-border" />
              <h3 className="text-sm font-semibold">Jira</h3>
              {JIRA_ORDER.map((key) => {
                const f = FIELDS.find((x) => x.key === key);
                if (f) return renderSecret(f);
                const o = OPTIONS.find((x) => x.key === key);
                return o ? renderOption(o) : null;
              })}
            </>
          )}
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
