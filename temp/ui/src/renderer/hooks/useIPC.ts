// src/renderer/hooks/useIPC.ts — Typed IPC Hook
// ═══════════════════════════════════════════════════════════════════
// Wraps window.electron.ipcRenderer with typed, async helpers.
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';

/**
 * Call an IPC channel and return the result.
 */
export async function invokeIPC<T = any>(
  channel: string,
  params?: Record<string, any>
): Promise<T> {
  return window.electron.ipcRenderer.invoke(channel, params);
}

/**
 * Hook for IPC calls with loading/error state.
 */
export function useIPC<T = any>(channel: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (params?: Record<string, any>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invokeIPC<T>(channel, params);
      setData(result);
      return result;
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [channel]);

  return { data, loading, error, call };
}

/**
 * Render a barcode via the Python bridge — returns base64 PNG.
 */
export async function renderBarcode(
  symbology: string,
  data: string,
  width_mm: number,
  height_mm: number
): Promise<string> {
  return invokeIPC<string>('barcode:render', {
    symbology, data, width_mm, height_mm,
  });
}

/**
 * Save template to disk.
 */
export async function saveTemplate(filePath: string, json: any): Promise<void> {
  await invokeIPC('template:save', { filePath, json });
}

/**
 * Load template from disk.
 */
export async function loadTemplate(filePath: string): Promise<any> {
  return invokeIPC('template:load', { filePath });
}

/**
 * Open a file dialog for choosing a data source.
 */
export async function openDataSourceDialog(): Promise<string | null> {
  return invokeIPC('data:open-dialog');
}

/**
 * List available system printers.
 */
export async function listPrinters(): Promise<string[]> {
  return invokeIPC('printers:list');
}
