// src/main/ipc.ts — IPC Handler Registration
// ═══════════════════════════════════════════════════════════════════
// Maps ipcMain.handle() channels to Python bridge calls or
// direct Electron API calls.
// ═══════════════════════════════════════════════════════════════════

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { callPython, isPythonReady } from './python-bridge';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import { checkForUpdates, installUpdate, downloadUpdate } from './updater';

/**
 * Electron-based PDF printing fallback.
 * Loads the PDF in a hidden BrowserWindow and prints via Chromium's print API.
 * Works with ANY printer the OS can see — no extra dependencies.
 */
async function electronPrintPdf(pdfPath: string, printerName: string): Promise<boolean> {
  const pdfUrl = url.pathToFileURL(pdfPath).href;
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  try {
    await win.loadURL(pdfUrl);
    // Give Chromium's PDF viewer a moment to parse the document
    await new Promise(resolve => setTimeout(resolve, 1500));

    return new Promise<boolean>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          printBackground: true,
        },
        (success, failureReason) => {
          if (success) {
            console.log(`[Electron] PDF printed to '${printerName}'`);
            resolve(true);
          } else {
            console.error(`[Electron] Print failed: ${failureReason}`);
            resolve(false);
          }
        }
      );
    });
  } finally {
    win.destroy();
  }
}

export function registerIpcHandlers(): void {
  // ── App ──────────────────────────────────────────────────────
  
  ipcMain.handle('app:version', async () => {
    try {
      return await callPython('get_version');
    } catch {
      return '1.0.0 (engine offline)';
    }
  });

  // ── Application Updates ─────────────────────────────────────
  ipcMain.handle('app:check-updates', async () => {
    return checkForUpdates();
  });

  ipcMain.handle('app:download-update', async () => {
    return downloadUpdate();
  });

  ipcMain.handle('app:install-update', () => {
    installUpdate();
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // ── Recent Files (Filesystem Persisted) ──────────────────────
  const getRecentFilesPath = () => path.join(app.getPath('userData'), 'recent_files.json');

  ipcMain.handle('app:get-recents', async () => {
    try {
      const filePath = getRecentFilesPath();
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });

  ipcMain.handle('app:add-recent', async (_event, file) => {
    try {
      const filePath = getRecentFilesPath();
      let recents = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        recents = JSON.parse(raw);
      } catch {}
      
      const existing = recents.filter((f: any) => f.path !== file.path);
      const updated = [{ ...file, modified: new Date().toISOString() }, ...existing].slice(0, 20);
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (err: any) {
      console.error('Failed to add recent:', err);
      return [];
    }
  });

  ipcMain.handle('app:remove-recent', async (_event, pathToRemove) => {
    try {
      const filePath = getRecentFilesPath();
      let recents = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        recents = JSON.parse(raw);
      } catch {}
      
      const updated = recents.filter((f: any) => f.path !== pathToRemove);
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (err: any) {
      console.error('Failed to remove recent:', err);
      return [];
    }
  });

  // ── Custom Presets (Filesystem Persisted) ───────────────────
  const getCustomPresetsPath = () => path.join(app.getPath('userData'), 'custom_presets.json');

  ipcMain.handle('app:get-presets', async () => {
    try {
      const filePath = getCustomPresetsPath();
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });

  // ── Generic Persistent Store ─────────────────────────────────
  // Raw string storage in userData. The Zustand createJSONStorage wrapper
  // handles JSON.stringify/parse itself, so we just store/read raw strings.
  ipcMain.handle('store:read', async (_event, { name }: { name: string }) => {
    try {
      const filePath = path.join(app.getPath('userData'), `${name}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      return { ok: true, data: raw }; // Return raw string — Zustand parses it
    } catch { return { ok: false, data: null }; }
  });
  ipcMain.handle('store:write', async (_event, { name, data }: { name: string; data: string | null }) => {
    try {
      const filePath = path.join(app.getPath('userData'), `${name}.json`);
      if (data === null) {
        try { await fs.unlink(filePath); } catch {}
      } else {
        await fs.writeFile(filePath, data, 'utf-8'); // Write raw string
      }
      return { ok: true };
    } catch (err: any) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('app:add-preset', async (_event, preset) => {
    try {
      const filePath = getCustomPresetsPath();
      let presets = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        presets = JSON.parse(raw);
      } catch {}

      // Avoid duplicates of the same dimensions/shape
      const existing = presets.filter((p: any) => 
        !(p.width === preset.width && p.height === preset.height && p.shape === preset.shape)
      );
      const updated = [{ ...preset, id: preset.id || `preset_${Date.now()}` }, ...existing].slice(0, 50);
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (err: any) {
      console.error('Failed to add preset:', err);
      return [];
    }
  });

  ipcMain.handle('app:remove-preset', async (_event, { id }) => {
    try {
      const filePath = getCustomPresetsPath();
      let presets = [];
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        presets = JSON.parse(raw);
      } catch {}

      const updated = presets.filter((p: any) => p.id !== id);
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (err: any) {
      console.error('Failed to remove preset:', err);
      return [];
    }
  });

  // ── Barcode Rendering ────────────────────────────────────────

  ipcMain.handle('barcode:render', async (_event, params) => {
    return callPython('render_barcode', params);
  });

  ipcMain.handle('qr:render', async (_event, params) => {
    return callPython('render_qr', params);
  });

  // ── Template I/O ─────────────────────────────────────────────

  ipcMain.handle('template:save', async (_event, { filePath, json }) => {
    await fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf-8');
    return { ok: true, path: filePath };
  });

  ipcMain.handle('template:load', async (_event, { filePath }) => {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  });

  ipcMain.handle('template:save-dialog', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
      filters: [{ name: 'OMG Template', extensions: ['lft'] }],
      defaultPath: 'untitled.lft',
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('template:open-dialog', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'OMG Template', extensions: ['lft'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Data Source ──────────────────────────────────────────────

  ipcMain.handle('data:open', async (_event, params) => {
    try {
      return await callPython('open_data_source', params);
    } catch (err: any) {
      return { error: err.message || 'Python engine unavailable', columns: [], rows: [], row_count: 0 };
    }
  });

  ipcMain.handle('data:preview', async (_event, params) => {
    try {
      return await callPython('preview_row', params);
    } catch (err: any) {
      return {};
    }
  });

  ipcMain.handle('data:open-dialog', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [
        { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'json', 'txt', 'tsv'] },
        { name: 'Database', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('data:read-file-binary', async (_event, { path: filePath }) => {
    try {
      const buf = await fs.readFile(filePath);
      return { ok: true, data: buf };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('data:read-file-text', async (_event, { path: filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { ok: true, content };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  const getInternalDataPath = (fileName: string) => {
    const dataDir = path.join(app.getPath('userData'), 'data_storage');
    return path.join(dataDir, fileName);
  };

  ipcMain.handle('data:copy-to-internal', async (_event, { sourcePath }) => {
    const dataDir = path.join(app.getPath('userData'), 'data_storage');
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const fileName = path.basename(sourcePath);
      const destPath = getInternalDataPath(fileName);
      await fs.copyFile(sourcePath, destPath);
      return { ok: true, internalPath: destPath };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('data:save-internal', async (_event, { fileName, content }) => {
    const dataDir = path.join(app.getPath('userData'), 'data_storage');
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const destPath = getInternalDataPath(fileName);
      await fs.writeFile(destPath, content, 'utf-8');
      return { ok: true, internalPath: destPath };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('data:read-internal', async (_event, { fileName }) => {
    const filePath = getInternalDataPath(fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { ok: true, content };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });


  // ── Batch Print ─────────────────────────────────────────────
  // PRIMARY: Python generates the PDF AND dispatches to OS spooler.
  // FALLBACK: If Python dispatch fails but PDF was generated,
  // Electron uses its own printing API to send the PDF to the printer.

  ipcMain.handle('batch:start', async (_event, params) => {
    try {
      console.log(`[IPC] batch:start — printer: ${params.printer}, mode: ${params.print_mode || 'pdf'}`);

      const result = await callPython('start_batch', params);

      console.log(`[IPC] batch:start result — status: ${result?.status}, output: ${result?.output_path || 'none'}`);

      // If Python generated a PDF but the print dispatch itself failed,
      // try printing via Electron's built-in printing as a fallback.
      if (
        result?.status === 'failed' &&
        result?.output_path &&
        params.printer &&
        params.printer !== 'PDF' &&
        (params.print_mode || 'pdf') === 'pdf'
      ) {
        console.log('[IPC] Python dispatch failed — attempting Electron print fallback');
        try {
          const printed = await electronPrintPdf(result.output_path, params.printer);
          if (printed) {
            console.log('[IPC] Electron print fallback succeeded');
            result.status = 'done';
            // Clear the dispatch error since Electron handled it
            result.errors = (result.errors || []).filter(
              (e: any) => !e.message?.includes('Print dispatch failed') && !e.message?.includes('print methods failed')
            );
            result.error_rows = result.errors?.length || 0;
          }
        } catch (fallbackErr: any) {
          console.error('[IPC] Electron print fallback also failed:', fallbackErr.message);
        }
      }

      return result;
    } catch (err: any) {
      return { status: 'failed', error: err.message || 'Python engine unavailable' };
    }
  });

  ipcMain.handle('print:spool', async (_event, params) => {
    try {
      return await callPython('print_spool', params);
    } catch (err: any) {
      return { status: 'failed', error: err.message || 'Python engine unavailable' };
    }
  });

  // ── Printers ────────────────────────────────────────────────

  ipcMain.handle('printers:list', async (event) => {
    const printerSet = new Set<string>();

    // Source 1: Electron's Chromium API (usually most complete)
    try {
      const chromiumPrinters = await event.sender.getPrintersAsync();
      for (const p of chromiumPrinters) {
        printerSet.add(p.name);
      }
    } catch (e) {
      console.warn('[printers:list] Electron getPrintersAsync failed:', e);
    }

    // Source 2: Python win32print (includes local + network via EnumPrinters(6))
    try {
      const pythonPrinters: string[] = await callPython('list_printers');
      if (Array.isArray(pythonPrinters)) {
        for (const p of pythonPrinters) {
          printerSet.add(p);
        }
      }
    } catch (e) {
      console.warn('[printers:list] Python list_printers failed:', e);
    }

    const result = Array.from(printerSet);
    return result.length > 0 ? result : ['PDF'];
  });

  // Open OS printer preferences dialog
  ipcMain.handle('printer:openPreferences', async (_event, { printer }) => {
    const { exec } = require('child_process');
    const printerName = printer || '';
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        // Many thermal drivers (like Seagull / TSC) fail to launch /e (Printing Preferences) 
        // from a non-Explorer process like Electron due to missing DLL context.
        // /p (Printer Properties) is universally reliable and contains a "Preferences" button inside it.
        exec(`rundll32 printui.dll,PrintUIEntry /p /n "${printerName}"`, (err: any) => {
          if (err) {
            console.error('Failed to open Printer Properties:', err);
            // Fallback to /e just in case /p was blocked
            exec(`rundll32 printui.dll,PrintUIEntry /e /n "${printerName}"`, (err2: any) => {
              if (err2) reject(err2); else resolve({ ok: true });
            });
          } else {
            resolve({ ok: true });
          }
        });
      } else if (process.platform === 'darwin') {
        exec('open /System/Library/PreferencePanes/PrintAndScan.prefPane', (err: any) => {
          if (err) reject(err); else resolve({ ok: true });
        });
      } else {
        exec('xdg-open system-config-printer', (err: any) => {
          if (err) reject(err); else resolve({ ok: true });
        });
      }
    });
  });

  // ── Formula ─────────────────────────────────────────────────

  ipcMain.handle('formula:eval', async (_event, params) => {
    return callPython('eval_formula', params);
  });

  // ── Log Export ──────────────────────────────────────────────

  ipcMain.handle('log:export', async (_event, params) => {
    return callPython('export_log', params);
  });

  // ── PDF Export ──────────────────────────────────────────────

  ipcMain.handle('pdf:save-dialog', async (_event, { filename } = {}) => {
    const defaultName = filename ? (filename.endsWith('.pdf') ? filename : `${filename}.pdf`) : 'labels.pdf';
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      defaultPath: defaultName,
    });
    return result.canceled ? null : result.filePath;
  });
}
