// src/main/index.ts — Electron Main Process
// ═══════════════════════════════════════════════════════════════════
// App lifecycle, BrowserWindow, and IPC host for OMG.
// ═══════════════════════════════════════════════════════════════════

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { startPythonBridge, callPython, stopPythonBridge } from './python-bridge';
import { registerIpcHandlers } from './ipc';
import { setupUpdater } from './updater';

app.name = 'OMG';
app.setName('OMG');

// ── Single-instance lock (production only) ───────────────────────────
// Only enforce in packaged builds. In dev mode (npm run electron:dev),
// we never want this to block the dev Electron from starting while
// a previously-built production app happens to be open.
if (app.isPackaged) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icons/icon.icns')
    : path.join(__dirname, '../../assets/icons/icon.icns');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OMG',
    icon: iconPath,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // macOS dock icon
  if (process.platform === 'darwin') {
    try {
      const dockIcon = app.isPackaged
        ? path.join(process.resourcesPath, 'assets/icons/icon.icns')
        : path.join(__dirname, '../../assets/icons/icon.icns');
      app.dock.setIcon(dockIcon);
    } catch (e) { /* ignore if icon not found in dev */ }
  }

  // Show when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load Vite dev server in dev, or built files in production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'right' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Start the Python engine subprocess
  // In dev: __dirname is ui/dist/main/, so we go up 3 levels to reach project root's omg/
  const enginePath = app.isPackaged
    ? path.join(process.resourcesPath, 'engine')
    : path.join(__dirname, '../../../omg');
  
  try {
    startPythonBridge(enginePath);
    console.log('Python bridge started');
  } catch (err) {
    console.error('Failed to start Python bridge:', err);
  }

  // Register all IPC handlers
  registerIpcHandlers();
  
  ipcMain.handle('engine:get-status', () => {
    const { getPythonStatus, isPythonReady } = require('./python-bridge');
    return {
      ready: isPythonReady(),
      status: getPythonStatus()
    };
  });

  // Setup Auto-Updater
  setupUpdater();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBridge();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Expose mainWindow for IPC handlers
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
