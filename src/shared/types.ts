export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO date-time, or YYYY-MM-DD for all-day events. */
  start: string;
  allDay: boolean;
  url: string;
}

export interface CalendarApi {
  isConnected: () => Promise<boolean>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getTodayEvents: () => Promise<CalendarEvent[]>;
}

export interface GithubActivity {
  id: string;
  kind: 'merged' | 'comment';
  /** ISO date-time. */
  time: string;
  /** Short one-line description of the activity. */
  summary: string;
  url: string;
  /** Full text of the activity (e.g. the comments), as markdown. */
  content?: string;
}

export interface GithubApi {
  getTodayActivity: () => Promise<GithubActivity[]>;
}

export interface SlackActivity {
  id: string;
  kind: 'thread' | 'dm';
  /** ISO date-time. */
  time: string;
  summary: string;
  url: string;
  /** Messages in sequence, as markdown. */
  content?: string;
}

export interface SlackApi {
  getTodayActivity: () => Promise<SlackActivity[]>;
}

export interface VscodeActivity {
  id: string;
  /** ISO date-time of the last update of the unsaved file. */
  time: string;
  summary: string;
  /** Always empty: unsaved files have no link. */
  url: string;
  /** Full text of the unsaved file. */
  content?: string;
}

export interface VscodeApi {
  getTodayActivity: () => Promise<VscodeActivity[]>;
}

declare global {
  interface Window {
    vscode: VscodeApi;
    calendar: CalendarApi;
    github: GithubApi;
    slack: SlackApi;
  }
}
