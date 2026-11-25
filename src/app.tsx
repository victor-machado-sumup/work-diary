import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MonacoEditor,
  type MonacoEditorHandle,
} from '@/components/monaco-editor';
import { MarkdownPreview } from '@/components/markdown-preview';
import {
  SettingsDialog,
  hasMissingRequiredSecrets,
} from '@/components/settings-dialog';
import {
  ActivitySidebar,
  buildActivityContext,
  useActivitySources,
} from '@/components/activity-sidebar';
import type { CopilotDeviceCode } from '@/shared/types';

type AiState = 'idle' | 'generating' | 'done' | 'error';

function App() {
  const [content, setContent] = useState('');
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [request, setRequest] = useState('');
  const [preview, setPreview] = useState(false);
  const [topLine, setTopLine] = useState(1);
  const editorHandle = useRef<MonacoEditorHandle>(null);
  const sources = useActivitySources();
  const [ai, setAi] = useState<AiState>('idle');
  // null until the setting has been read.
  const [autoGenerate, setAutoGenerate] = useState<boolean | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<CopilotDeviceCode | null>(null);
  const started = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // First run: ask for missing credentials right away.
  useEffect(() => {
    void hasMissingRequiredSecrets().then((missing) => {
      if (missing) setSettingsOpen(true);
    });
  }, []);

  const loadAutoGenerate = useCallback(async () => {
    const s = await window.settings.get();
    setAutoGenerate(s.WORK_DIARY_AUTO_GENERATE.value.toLowerCase() !== 'false');
  }, []);
  useEffect(() => {
    void loadAutoGenerate();
  }, [loadAutoGenerate]);

  const generate = useCallback(async (context: string) => {
    setAi('generating');
    setAiError(null);
    try {
      if (!(await window.copilot.isConnected())) {
        const off = window.copilot.onDeviceCode(setDeviceCode);
        try {
          await window.copilot.connect();
        } finally {
          off();
          setDeviceCode(null);
        }
      }
      editorHandle.current?.setValue(await window.copilot.generateLog(context));
      setAi('done');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAi('error');
    }
  }, []);

  // Optionally generate the initial text once, after every activity source finished pulling.
  const activityContext = buildActivityContext(sources.items);
  useEffect(() => {
    if (!autoGenerate || !sources.allLoaded || started.current) return;
    started.current = true;
    void generate(activityContext);
  }, [autoGenerate, sources.allLoaded, activityContext, generate]);

  const waitingForSources = autoGenerate === true && !sources.allLoaded;
  const editorDisabled = ai === 'generating' || waitingForSources;

  const generateNow = () => {
    if (
      content.trim() &&
      !window.confirm('Replace the current text with a generated one?')
    ) {
      return;
    }
    started.current = true;
    void generate(activityContext);
  };

  const togglePreview = () => {
    // Read the viewport while the editor is still visible.
    if (!preview) setTopLine(editorHandle.current?.getTopLine() ?? 1);
    setPreview(!preview);
  };

  const save = async () => {
    setSaveError(null);
    try {
      setSavedPath(await window.notes.save(content));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const revise = async () => {
    const text = request.trim();
    if (!text || (ai !== 'done' && ai !== 'idle')) return;
    setAi('generating');
    setAiError(null);
    try {
      const revised = await window.copilot.reviseLog(
        content,
        text,
        activityContext,
      );
      editorHandle.current?.setValue(revised);
      setRequest('');
      setAi('done');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAi('error');
    }
  };

  return (
    <div className="flex h-full gap-2 p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {(editorDisabled || ai === 'error') && (
          <div className="rounded-md border px-3 py-2 text-sm">
            {waitingForSources &&
              ai === 'idle' &&
              'Waiting for activity sources...'}
            {ai === 'generating' &&
              (deviceCode
                ? `Authorize Copilot at ${deviceCode.verificationUri} with code ${deviceCode.userCode}`
                : 'Generating text with Copilot...')}
            {ai === 'error' && (
              <span className="flex items-center gap-2 text-red-400">
                <span className="min-w-0 flex-1 break-words">{aiError}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generate(activityContext)}
                >
                  Retry
                </Button>
              </span>
            )}
          </div>
        )}
        <div className="flex min-h-0 flex-1 gap-2">
          <MonacoEditor
            disabled={editorDisabled}
            className="min-h-0 flex-1 overflow-hidden rounded-md border"
            onChange={setContent}
            hidden={preview}
            handleRef={editorHandle}
          />
          {preview && (
            <MarkdownPreview
              className="min-h-0 flex-1 overflow-y-auto rounded-md border"
              content={content}
              topLine={topLine}
            />
          )}
        </div>
        <Textarea
          rows={3}
          className="resize-none"
          placeholder="Ask the model for changes to the text... (Cmd+Enter to send)"
          value={request}
          disabled={ai !== 'done' && ai !== 'idle'}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
              e.preventDefault();
              void revise();
            }
          }}
        />
      </div>
      <div className="flex w-fit shrink-0 flex-col gap-2">
        <ActivitySidebar
          className="min-h-0 w-0 min-w-full flex-1 overflow-y-auto"
          sources={sources}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          <Button variant="outline" onClick={togglePreview}>
            {preview ? 'Edit' : 'Preview'}
          </Button>
          <Button
            variant="outline"
            disabled={!sources.allLoaded || ai === 'generating'}
            onClick={generateNow}
          >
            Generate
          </Button>
          <Button onClick={() => void save()}>Save</Button>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={(secrets, settings) => {
          const changed = new Set<string>([...secrets, ...settings]);
          const touched = (...keys: string[]) =>
            keys.some((k) => changed.has(k));
          if (touched('WORK_DIARY_AUTO_GENERATE')) void loadAutoGenerate();
          // Refetch only the sources whose credentials or options changed.
          if (
            touched(
              'WORK_DIARY_GOOGLE_CLIENT_ID',
              'WORK_DIARY_GOOGLE_CLIENT_SECRET',
            )
          ) {
            void sources.calendar.load();
          }
          if (touched('WORK_DIARY_GITHUB_TOKEN')) void sources.github.load();
          if (
            touched('WORK_DIARY_SLACK_TOKEN', 'WORK_DIARY_SLACK_LOOKBACK_DAYS')
          ) {
            void sources.slack.load();
          }
          if (
            touched(
              'WORK_DIARY_JIRA_TOKEN',
              'WORK_DIARY_JIRA_URL',
              'WORK_DIARY_JIRA_EMAIL',
              'WORK_DIARY_JIRA_PROJECT',
            )
          ) {
            void sources.jira.load();
          }
        }}
      />
      <Dialog
        open={savedPath !== null}
        onOpenChange={(o) => !o && setSavedPath(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notes saved</DialogTitle>
            <DialogDescription className="break-all">
              {savedPath}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavedPath(null)}>
              Keep editing
            </Button>
            <Button onClick={() => void window.notes.quit()}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={saveError !== null}
        onOpenChange={(o) => !o && setSaveError(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not save</DialogTitle>
            <DialogDescription className="break-all">
              {saveError}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
