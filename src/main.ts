import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { join } from 'node:path';
import started from 'electron-squirrel-startup';

import * as copilot from './main/copilot';
import * as github from './main/github';
import * as googleCalendar from './main/google-calendar';
import * as jira from './main/jira';
import * as notes from './main/notes';
import * as secrets from './main/secrets';
import * as settings from './main/settings';
import * as slack from './main/slack';
import * as vscode from './main/vscode';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Stay above all other windows (including fullscreen apps on macOS), or not.
const applyAlwaysOnTop = (win: BrowserWindow, onTop: boolean): void => {
  if (onTop) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
  }
};

const createWindow = (): void => {
  const showOnTop = settings.getShowOnTop();
  // Create the browser window.
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    alwaysOnTop: showOnTop,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // The dev-server HMR client bundled into the preload requires Node's
      // "events" module, which is unavailable in a sandboxed preload.
      sandbox: false,
    },
  });

  applyAlwaysOnTop(mainWindow, showOnTop);

  // Open links (e.g. from the markdown preview) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools only when explicitly requested.
  if (process.env.WORK_DIARY_DEVTOOLS?.trim().toLowerCase() === 'true') {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // In dev the app runs inside the stock Electron bundle, so set the dock icon manually.
  if (!app.isPackaged && process.platform === 'darwin') {
    app.dock?.setIcon(join(app.getAppPath(), 'assets', 'icon.png'));
  }
  ipcMain.handle('github:getTodayActivity', () => github.getTodayActivity());
  // TODO: Slack disabled until IT grants the token scopes. Restore by returning slack.getTodayActivity().
  ipcMain.handle('slack:getTodayActivity', () =>
    false ? slack.getTodayActivity() : [],
  );
  ipcMain.handle('jira:getTodayActivity', () => jira.getTodayActivity());
  ipcMain.handle('vscode:getTodayActivity', () => vscode.getTodayActivity());
  ipcMain.handle('calendar:isConnected', () => googleCalendar.isConnected());
  ipcMain.handle('calendar:connect', () => googleCalendar.connect());
  ipcMain.handle('calendar:disconnect', () => googleCalendar.disconnect());
  ipcMain.handle('calendar:getTodayEvents', () =>
    googleCalendar.getTodayEvents(),
  );

  ipcMain.handle('copilot:isConnected', () => copilot.isConnected());
  ipcMain.handle('copilot:connect', (event) => copilot.connect(event.sender));
  ipcMain.handle('copilot:disconnect', () => copilot.disconnect());
  ipcMain.handle('copilot:generateLog', (_event, context: string) =>
    copilot.generateLog(context),
  );
  ipcMain.handle(
    'copilot:reviseLog',
    (_event, text: string, request: string, context: string) =>
      copilot.reviseLog(text, request, context),
  );

  ipcMain.handle('notes:save', (_event, content: string) =>
    notes.saveNotes(content),
  );
  ipcMain.handle('secrets:getStatus', () => secrets.getStatus());
  ipcMain.handle('secrets:set', (_event, values) => secrets.setSecrets(values));
  ipcMain.handle('settings:get', () => settings.getSettings());
  ipcMain.handle('settings:set', (_event, values) => {
    settings.setSettings(values);
    // Always-on-top applies live; the other settings are read on use.
    for (const win of BrowserWindow.getAllWindows()) {
      applyAlwaysOnTop(win, settings.getShowOnTop());
    }
  });
  ipcMain.handle('app:quit', () => app.quit());

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
