// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

import type {
  CalendarApi,
  GithubApi,
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
