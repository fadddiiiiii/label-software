import { autoUpdater } from 'electron-updater';
import { getMainWindow } from './index';

export function setupUpdater() {
  autoUpdater.autoDownload = false; // We'll trigger it manually from UI if needed

  autoUpdater.on('checking-for-update', () => {
    getMainWindow()?.webContents.send('update:status', 'checking');
  });

  autoUpdater.on('update-available', (info: any) => {
    getMainWindow()?.webContents.send('update:status', 'available', info);
  });

  autoUpdater.on('update-not-available', () => {
    getMainWindow()?.webContents.send('update:status', 'uptodate');
  });

  autoUpdater.on('error', (err: any) => {
    getMainWindow()?.webContents.send('update:status', 'error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj: any) => {
    getMainWindow()?.webContents.send('update:progress', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    getMainWindow()?.webContents.send('update:status', 'ready');
  });
}

export async function checkForUpdates() {
  return autoUpdater.checkForUpdates();
}

export function downloadUpdate() {
  return autoUpdater.downloadUpdate();
}

export function installUpdate() {
  autoUpdater.quitAndInstall();
}
