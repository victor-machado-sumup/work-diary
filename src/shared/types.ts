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

export interface JiraActivity {
  id: string;
  kind: 'created' | 'edited' | 'done';
  /** ISO date-time of my latest change to the issue today. */
  time: string;
  summary: string;
  url: string;
  /** My changes to the issue today, as markdown. */
  content?: string;
}

export interface JiraApi {
  getTodayActivity: () => Promise<JiraActivity[]>;
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

export interface NotionActivity {
  id: string;
  kind: 'created' | 'edited' | 'comment';
  /** ISO date-time of my latest change (or the comment time). */
  time: string;
  /** "Created|Edited <title>" or "Comment on <title>". */
  summary: string;
  url: string;
  /** Blocks I touched in page order, or the comment with its highlighted context. */
  content?: string;
}

export interface NotionApi {
  isConnected: () => Promise<boolean>;
  /** Opens the browser for the Notion MCP OAuth consent. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getTodayActivity: () => Promise<NotionActivity[]>;
}

export interface CopilotDeviceCode {
  userCode: string;
  verificationUri: string;
}

export interface CopilotApi {
  isConnected: () => Promise<boolean>;
  /** Runs the GitHub device flow; resolves once the user approved it. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Generates the initial log text from the activity context. */
  generateLog: (activityContext: string) => Promise<string>;
  /** Applies a change request to the current log text. */
  reviseLog: (text: string, request: string) => Promise<string>;
  /** Returns an unsubscribe function. */
  onDeviceCode: (callback: (info: CopilotDeviceCode) => void) => () => void;
}

export type SecretKey =
  | 'WORK_DIARY_GOOGLE_CLIENT_ID'
  | 'WORK_DIARY_GOOGLE_CLIENT_SECRET'
  | 'WORK_DIARY_GITHUB_TOKEN'
  | 'WORK_DIARY_SLACK_TOKEN'
  | 'WORK_DIARY_JIRA_TOKEN';

/** Where each secret currently comes from. Values are never sent to the renderer. */
export type SecretsStatus = Record<SecretKey, 'env' | 'saved' | 'missing'>;

export interface SecretsApi {
  getStatus: () => Promise<SecretsStatus>;
  /** Non-empty values are saved; an empty string clears the saved value. */
  set: (values: Partial<Record<SecretKey, string>>) => Promise<void>;
}

export type SettingKey =
  | 'WORK_DIARY_COPILOT_MODEL'
  | 'WORK_DIARY_SHOW_ON_TOP'
  | 'WORK_DIARY_AUTO_GENERATE'
  | 'WORK_DIARY_SLACK_LOOKBACK_DAYS'
  | 'WORK_DIARY_JIRA_URL'
  | 'WORK_DIARY_JIRA_EMAIL'
  | 'WORK_DIARY_JIRA_PROJECT';

/** Effective value of each setting and where it comes from. */
export type SettingsState = Record<
  SettingKey,
  { value: string; source: 'env' | 'saved' | 'default' }
>;

export interface SettingsApi {
  get: () => Promise<SettingsState>;
  /** Non-empty values are saved; an empty string reverts to the default. */
  set: (values: Partial<Record<SettingKey, string>>) => Promise<void>;
}

export interface NotesApi {
  /** Saves the notes to ~/.config/work-diary/YYYY-MM-DD.md; returns the path. */
  save: (content: string) => Promise<string>;
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    copilot: CopilotApi;
    vscode: VscodeApi;
    calendar: CalendarApi;
    github: GithubApi;
    slack: SlackApi;
    jira: JiraApi;
    notion: NotionApi;
    notes: NotesApi;
    secrets: SecretsApi;
    settings: SettingsApi;
  }
}
