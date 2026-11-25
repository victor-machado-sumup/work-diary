// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

import type {
  CalendarApi,
  CopilotApi,
  CopilotDeviceCode,
  GithubApi,
  JiraApi,
  NotesApi,
  NotionApi,
  SecretsApi,
  SettingsApi,
  SlackApi,
  VscodeApi,
} from './shared/types';

const github: GithubApi = {
  getTodayActivity: () => ipcRenderer.invoke('github:getTodayActivity'),
};
contextBridge.exposeInMainWorld('github', github);

const slack: SlackApi = {
  getTodayActivity: () => ipcRenderer.invoke('slack:getTodayActivity'),
};
contextBridge.exposeInMainWorld('slack', slack);

const jira: JiraApi = {
  getTodayActivity: () => ipcRenderer.invoke('jira:getTodayActivity'),
};
contextBridge.exposeInMainWorld('jira', jira);

const notion: NotionApi = {
  isConnected: () => ipcRenderer.invoke('notion:isConnected'),
  connect: () => ipcRenderer.invoke('notion:connect'),
  disconnect: () => ipcRenderer.invoke('notion:disconnect'),
  getTodayActivity: () => ipcRenderer.invoke('notion:getTodayActivity'),
};
contextBridge.exposeInMainWorld('notion', notion);

const vscode: VscodeApi = {
  getTodayActivity: () => ipcRenderer.invoke('vscode:getTodayActivity'),
};
contextBridge.exposeInMainWorld('vscode', vscode);

const calendar: CalendarApi = {
  isConnected: () => ipcRenderer.invoke('calendar:isConnected'),
  connect: () => ipcRenderer.invoke('calendar:connect'),
  disconnect: () => ipcRenderer.invoke('calendar:disconnect'),
  getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
};

contextBridge.exposeInMainWorld('calendar', calendar);

const copilot: CopilotApi = {
  isConnected: () => ipcRenderer.invoke('copilot:isConnected'),
  connect: () => ipcRenderer.invoke('copilot:connect'),
  disconnect: () => ipcRenderer.invoke('copilot:disconnect'),
  generateLog: (context) => ipcRenderer.invoke('copilot:generateLog', context),
  reviseLog: (text, request, context) =>
    ipcRenderer.invoke('copilot:reviseLog', text, request, context),
  onDeviceCode: (callback) => {
    const listener = (_e: unknown, info: CopilotDeviceCode) => callback(info);
    ipcRenderer.on('copilot:deviceCode', listener);
    return () => ipcRenderer.removeListener('copilot:deviceCode', listener);
  },
};
contextBridge.exposeInMainWorld('copilot', copilot);

const secrets: SecretsApi = {
  getStatus: () => ipcRenderer.invoke('secrets:getStatus'),
  set: (values) => ipcRenderer.invoke('secrets:set', values),
};
contextBridge.exposeInMainWorld('secrets', secrets);

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (values) => ipcRenderer.invoke('settings:set', values),
};
contextBridge.exposeInMainWorld('settings', settings);

const notes: NotesApi = {
  save: (content) => ipcRenderer.invoke('notes:save', content),
  quit: () => ipcRenderer.invoke('app:quit'),
};
contextBridge.exposeInMainWorld('notes', notes);
