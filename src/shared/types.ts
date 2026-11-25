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

declare global {
  interface Window {
    calendar: CalendarApi;
  }
}
