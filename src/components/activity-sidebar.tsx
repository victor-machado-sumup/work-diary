import {
  Calendar,
  GitPullRequest,
  GripVertical,
  MessageSquare,
} from 'lucide-react';
import type { ComponentType } from 'react';

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
    id: '1',
    source: 'calendar',
    time: '09:30',
    title: 'Daily standup',
    url: 'https://calendar.google.com/event/1',
  },
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
    id: '5',
    source: 'calendar',
    time: '14:00',
    title: '1:1 with Ana',
    url: 'https://calendar.google.com/event/2',
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

export function ActivitySidebar({ className }: { className?: string }) {
  return (
    <aside className={className}>
      <h2 className="mb-2 px-1 text-sm font-semibold">Today's activity</h2>
      <p className="mb-3 px-1 text-xs text-muted-foreground">
        Drag an item into the editor.
      </p>
      <ul className="flex flex-col gap-1.5">
        {MOCK_ACTIVITY.map((item) => {
          const { Icon, color, label } = SOURCES[item.source];
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData(
                  'text/plain',
                  `- ${item.time} [${label}] [${item.title}](${item.url})\n`,
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
