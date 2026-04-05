// src/preload/index.ts — Context Bridge (Security Layer)
// ═══════════════════════════════════════════════════════════════════
// Exposes a safe subset of Electron IPC to the renderer process.
// No direct Node.js access — all calls go through ipcRenderer.invoke.
// ═══════════════════════════════════════════════════════════════════

import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = [
  'app:version',
  'app:check-activation',
  'app:activate',
  'barcode:render',
  'qr:render',
  'template:save',
  'template:load',
  'template:save-dialog',
  'template:open-dialog',
  'data:open',
  'data:preview',
  'data:open-dialog',
  'batch:start',
  'batch:progress',
  'print:spool',
  'printers:list',
  'printer:openPreferences',
  'formula:eval',
  'log:export',
  'pdf:save-dialog',
  'data:read-file-binary',
  'data:read-file-text',
  'data:copy-to-internal',
  'data:read-internal',
  'data:save-internal',
  'app:check-updates',
  'app:download-update',
  'app:install-update',
  'app:get-version',
  'app:get-recents',
  'app:add-recent',
  'app:remove-recent',
  'app:get-presets',
  'app:add-preset',
  'app:remove-preset',
  'store:read',
  'store:write',
  'update:status',
  'update:progress',
] as const;

type Channel = typeof ALLOWED_CHANNELS[number];

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: Channel, ...args: any[]) => {
      if (ALLOWED_CHANNELS.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      throw new Error(`IPC channel not allowed: ${channel}`);
    },
    on: (channel: Channel, callback: (...args: any[]) => void) => {
      if (ALLOWED_CHANNELS.includes(channel)) {
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
      }
      return () => {};
    },
    removeAllListeners: (channel: Channel) => {
      if (ALLOWED_CHANNELS.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
  },
});
