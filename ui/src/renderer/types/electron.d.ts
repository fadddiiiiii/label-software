// src/renderer/types/electron.d.ts — Electron IPC type declarations

export interface ElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, callback: (...args: any[]) => void): void;
    removeAllListeners(channel: string): void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
