import {
  Calendar,
  GitPullRequest,
  GripVertical,
  MessageSquare,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import '../shared/types';

type Source = 'github' | 'calendar' | 'slack';

interface ActivityItem {
  id: string;
  source: Source;
  time: string;
  title: string;
  url: string;
}

const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: '2',
    source: 'github',
    time: '10:12',
    title: 'Opened PR #482 "Fix retry logic"',
    url: 'https://github.com/acme/payments/pull/482',
  },
  {
    id: '3',
    source: 'slack',
    time: '11:40',
    title: 'Replied in #payments-incident',
    url: 'https://acme.slack.com/archives/C1/p1',
  },
  {
    id: '4',
    source: 'github',
    time: '13:05',
    title: 'Reviewed PR #479 "Add refund endpoint"',
    url: 'https://github.com/acme/payments/pull/479',
  },
  {
    id: '6',
    source: 'github',
    time: '15:48',
    title: 'Merged PR #482 "Fix retry logic"',
    url: 'https://github.com/acme/payments/pull/482',
  },
  {
    id: '7',
    source: 'slack',
    time: '16:20',
    title: 'Thread in #eng-backend about rate limits',
    url: 'https://acme.slack.com/archives/C2/p2',
  },
];

const SOURCES: Record<
  Source,
  { label: string; Icon: ComponentType<{ className?: string }>; color: string }
> = {
  github: { label: 'GitHub', Icon: GitPullRequest, color: 'text-purple-400' },
  calendar: { label: 'Calendar', Icon: Calendar, color: 'text-blue-400' },
  slack: { label: 'Slack', Icon: MessageSquare, color: 'text-green-400' },
};

/** Escapes characters that would break markdown link text. */
function escapeMarkdown(text: string): string {
  return text
    .trim()
    .replace(/[\\`*_{}[\]<>|]/g, '\\$&')
    .replace(/\s+/g, ' ');
}

function useCalendarActivity() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
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
          title: e.title,
          url: e.url,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(await window.calendar.isConnected().catch(() => false));
    } finally {
      setBusy(false);
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

  return { connected, items, busy, error, load, connect, disconnect };
}

export function ActivitySidebar({ className }: { className?: string }) {
  const calendar = useCalendarActivity();
  const activity = [...calendar.items, ...MOCK_ACTIVITY].sort((a, b) =>
    a.time === 'All day'
      ? -1
      : b.time === 'All day'
        ? 1
        : a.time.localeCompare(b.time),
  );

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
                e.dataTransfer.setData(
                  'text/plain',
                  `- ${item.time} [${label}] [${escapeMarkdown(item.title)}](${item.url.replace(/[()]/g, encodeURIComponent)})\n`,
                );
              }}
              className="flex cursor-grab items-start gap-2 rounded-md border bg-card p-2 text-sm active:cursor-grabbing"
            >
              <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {item.time} · {label}
                </div>
                <div className="break-words">{item.title}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
