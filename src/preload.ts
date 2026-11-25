// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

import type { CalendarApi, GithubApi } from './shared/types';

const github: GithubApi = {
  getTodayActivity: () => ipcRenderer.invoke('github:getTodayActivity'),
};
contextBridge.exposeInMainWorld('github', github);

const calendar: CalendarApi = {
  isConnected: () => ipcRenderer.invoke('calendar:isConnected'),
  connect: () => ipcRenderer.invoke('calendar:connect'),
  disconnect: () => ipcRenderer.invoke('calendar:disconnect'),
  getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
};

contextBridge.exposeInMainWorld('calendar', calendar);
