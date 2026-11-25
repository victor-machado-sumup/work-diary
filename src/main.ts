import { app, BrowserWindow, ipcMain, shell } from 'electron';
import started from 'electron-squirrel-startup';

import * as googleCalendar from './main/google-calendar';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Set WORK_DIARY_SHOW_ON_TOP=false to disable the always-on-top behavior (default: true).
const showOnTop = process.env.WORK_DIARY_SHOW_ON_TOP?.trim().toLowerCase() !== 'false';

const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    alwaysOnTop: showOnTop,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // The dev-server HMR client bundled into the preload requires Node's
      // "events" module, which is unavailable in a sandboxed preload.
      sandbox: false,
    },
  });

  if (showOnTop) {
    // Stay above all other windows (including fullscreen apps on macOS).
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

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
  ipcMain.handle('calendar:isConnected', () => googleCalendar.isConnected());
  ipcMain.handle('calendar:connect', () => googleCalendar.connect());
  ipcMain.handle('calendar:disconnect', () => googleCalendar.disconnect());
  ipcMain.handle('calendar:getTodayEvents', () =>
    googleCalendar.getTodayEvents(),
  );

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
