import {
  Calendar,
  GitPullRequest,
  GripVertical,
  MessageSquare,
  NotebookText,
  StickyNote,
  Ticket,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import '../shared/types';

export type Source =
  | 'github'
  | 'calendar'
  | 'slack'
  | 'jira'
  | 'vscode'
  | 'notion';

export interface ActivityItem {
  id: string;
  source: Source;
  time: string;
  /** Short one-line description. */
  summary: string;
  url: string;
  /** Full text (e.g. comment bodies), inserted below the summary on drop. */
  content?: string;
}

export const SOURCES: Record<
  Source,
  { label: string; Icon: ComponentType<{ className?: string }>; color: string }
> = {
  github: { label: 'GitHub', Icon: GitPullRequest, color: 'text-purple-400' },
  calendar: { label: 'Calendar', Icon: Calendar, color: 'text-yellow-400' },
  slack: { label: 'Slack', Icon: MessageSquare, color: 'text-green-400' },
  jira: { label: 'Jira', Icon: Ticket, color: 'text-blue-400' },
  vscode: { label: 'VSCode', Icon: StickyNote, color: 'text-sky-400' },
  notion: { label: 'Notion', Icon: NotebookText, color: 'text-stone-300' },
};

/** Escapes characters that would break markdown link text. */
function escapeMarkdown(text: string): string {
  return text
    .trim()
    .replace(/[\\`*_{}[\]<>|]/g, '\\$&')
    .replace(/\s+/g, ' ');
}

/**
 * Markdown inserted on drop: a summary line linking to the item, followed by
 * the full content (if any) as an indented blockquote under the list item.
 */
function toMarkdown(item: ActivityItem, label: string): string {
  const summary = escapeMarkdown(item.summary);
  const url = item.url.replace(/[()]/g, encodeURIComponent);
  let md = `- ${item.time} [${label}] ${url ? `[${summary}](${url})` : summary}\n`;
  const content = item.content?.trim();
  if (content) {
    md += content
      .split(/\r?\n/)
      .map((line) => (line.trim() ? `  > ${line}` : '  >'))
      .join('\n');
    md += '\n';
  }
  return md;
}

function useGithubActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activity = await window.github.getTodayActivity();
      setItems(
        activity.map((a) => ({
          id: `github-${a.id}`,
          source: 'github' as const,
          time: new Date(a.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          summary: a.summary,
          url: a.url,
          content: a.content,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, busy, loaded, error, load };
}

function useSlackActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activity = await window.slack.getTodayActivity();
      setItems(
        activity.map((a) => ({
          id: `slack-${a.id}`,
          source: 'slack' as const,
          time: new Date(a.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          summary: a.summary,
          url: a.url,
          content: a.content,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, busy, loaded, error, load };
}

function useJiraActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activity = await window.jira.getTodayActivity();
      setItems(
        activity.map((a) => ({
          id: `jira-${a.id}`,
          source: 'jira' as const,
          time: new Date(a.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          summary: a.summary,
          url: a.url,
          content: a.content,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, busy, loaded, error, load };
}

function useVscodeActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activity = await window.vscode.getTodayActivity();
      setItems(
        activity.map((a) => ({
          id: `vscode-${a.id}`,
          source: 'vscode' as const,
          time: new Date(a.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          summary: a.summary,
          url: a.url,
          content: a.content,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, busy, loaded, error, load };
}

function useNotionActivity() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const isConnected = await window.notion.isConnected();
      setConnected(isConnected);
      if (!isConnected) {
        setItems([]);
        return;
      }
      const activity = await window.notion.getTodayActivity();
      setItems(
        activity.map((a) => ({
          id: `notion-${a.id}`,
          source: 'notion' as const,
          time: new Date(a.time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          summary: a.summary,
          url: a.url,
          content: a.content,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(await window.notion.isConnected().catch(() => false));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await window.notion.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    await load();
  }, [load]);

  const disconnect = useCallback(async () => {
    await window.notion.disconnect();
    setConnected(false);
    setItems([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    connected,
    items,
    busy,
    loaded,
    error,
    load,
    connect,
    disconnect,
  };
}

function useCalendarActivity() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const isConnected = await window.calendar.isConnected();
      setConnected(isConnected);
      if (!isConnected) {
        setItems([]);
        return;
      }
      const events = await window.calendar.getTodayEvents();
      setItems(
        events.map((e) => ({
          id: `calendar-${e.id}`,
          source: 'calendar' as const,
          time: e.allDay
            ? 'All day'
            : new Date(e.start).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }),
          summary: e.title,
          url: e.url,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(await window.calendar.isConnected().catch(() => false));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await window.calendar.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    await load();
  }, [load]);

  const disconnect = useCallback(async () => {
    await window.calendar.disconnect();
    setConnected(false);
    setItems([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    connected,
    items,
    busy,
    loaded,
    error,
    load,
    connect,
    disconnect,
  };
}

export function useActivitySources() {
  const calendar = useCalendarActivity();
  const github = useGithubActivity();
  const slack = useSlackActivity();
  const jira = useJiraActivity();
  const vscode = useVscodeActivity();
  const notion = useNotionActivity();
  const items = [
    ...calendar.items,
    ...github.items,
    ...slack.items,
    ...jira.items,
    ...vscode.items,
    ...notion.items,
  ].sort((a, b) =>
    a.time === 'All day'
      ? -1
      : b.time === 'All day'
        ? 1
        : a.time.localeCompare(b.time),
  );
  /** True once every source has finished its first pull (successfully or not). */
  const allLoaded =
    calendar.loaded &&
    github.loaded &&
    slack.loaded &&
    jira.loaded &&
    vscode.loaded &&
    notion.loaded;
  return {
    calendar,
    github,
    slack,
    jira,
    vscode,
    notion,
    items,
    allLoaded,
  };
}

export type ActivitySources = ReturnType<typeof useActivitySources>;

/** Plain-text context for the AI: every item with its summary, link and full content. */
export function buildActivityContext(items: ActivityItem[]): string {
  if (items.length === 0) return '(No activity was recorded today.)';
  return items
    .map((item) => {
      let text = `### ${item.time} [${SOURCES[item.source].label}] ${item.summary}\n`;
      if (item.url) text += `URL: ${item.url}\n`;
      const content = item.content?.trim();
      if (content) text += `\n${content}\n`;
      return text;
    })
    .join('\n');
}

export function ActivitySidebar({
  className,
  sources,
}: {
  className?: string;
  sources: ActivitySources;
}) {
  const {
    calendar,
    github,
    slack,
    jira,
    vscode,
    notion,
    items: activity,
  } = sources;

  return (
    <aside className={className}>
      <h2 className="mb-2 px-1 text-sm font-semibold">Today's activity</h2>
      <p className="mb-3 px-1 text-xs text-muted-foreground">
        Drag an item into the editor.
      </p>
      <div className="mb-3 flex flex-col gap-1 px-1 text-xs">
        {calendar.connected === false && (
          <Button size="sm" disabled={calendar.busy} onClick={calendar.connect}>
            Connect Google Calendar
          </Button>
        )}
        {calendar.connected && (
          <div className="flex gap-2 text-muted-foreground">
            <button
              className="underline disabled:opacity-50"
              disabled={calendar.busy}
              onClick={calendar.load}
            >
              Refresh calendar
            </button>
            <button className="underline" onClick={calendar.disconnect}>
              Disconnect
            </button>
          </div>
        )}
        {calendar.error && (
          <p className="break-words text-red-400">{calendar.error}</p>
        )}
        <div className="flex gap-2 text-muted-foreground">
          <button
            className="underline disabled:opacity-50"
            disabled={github.busy}
            onClick={github.load}
          >
            Refresh GitHub
          </button>
        </div>
        {github.error && (
          <p className="break-words text-red-400">{github.error}</p>
        )}
        <div className="flex gap-2 text-muted-foreground">
          <button
            className="underline disabled:opacity-50"
            disabled={slack.busy}
            onClick={slack.load}
          >
            Refresh Slack
          </button>
        </div>
        {slack.error && (
          <p className="break-words text-red-400">{slack.error}</p>
        )}
        <div className="flex gap-2 text-muted-foreground">
          <button
            className="underline disabled:opacity-50"
            disabled={jira.busy}
            onClick={jira.load}
          >
            Refresh Jira
          </button>
        </div>
        {jira.error && <p className="break-words text-red-400">{jira.error}</p>}
        <div className="flex gap-2 text-muted-foreground">
          <button
            className="underline disabled:opacity-50"
            disabled={vscode.busy}
            onClick={vscode.load}
          >
            Refresh VSCode
          </button>
        </div>
        {vscode.error && (
          <p className="break-words text-red-400">{vscode.error}</p>
        )}
        {notion.connected === false && (
          <Button size="sm" disabled={notion.busy} onClick={notion.connect}>
            Connect Notion
          </Button>
        )}
        {notion.connected && (
          <div className="flex gap-2 text-muted-foreground">
            <button
              className="underline disabled:opacity-50"
              disabled={notion.busy}
              onClick={notion.load}
            >
              Refresh Notion
            </button>
            <button className="underline" onClick={notion.disconnect}>
              Disconnect
            </button>
          </div>
        )}
        {notion.error && (
          <p className="break-words text-red-400">{notion.error}</p>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {activity.map((item) => {
          const { Icon, color, label } = SOURCES[item.source];
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', toMarkdown(item, label));
              }}
              className="flex cursor-grab items-start gap-2 rounded-md border bg-card p-2 text-sm active:cursor-grabbing"
            >
              <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {item.time} · {label}
                </div>
                <div className="break-words">{item.summary}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
