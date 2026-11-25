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

declare global {
  interface Window {
    calendar: CalendarApi;
    github: GithubApi;
  }
}
