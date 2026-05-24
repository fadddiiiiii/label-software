// src/renderer/store/data.ts — Data Source Zustand Store with Persistence
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SerialNumberConfig, DateTimeFormat, DATE_TIME_FORMATS, type FieldBinding } from '../types/template';
import { useTabsStore } from './tabs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ── IPC-based storage ───────────────────────────────────────
// createJSONStorage wraps this so Zustand handles JSON serialization.
// We just store/read raw strings via IPC → userData JSON files.
const ipcStorageDriver = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const ipc = (window as any).electron?.ipcRenderer;
      if (!ipc) {
        console.log('[Store] No IPC — using localStorage fallback for:', name);
        return localStorage.getItem(name);
      }
      const result = await ipc.invoke('store:read', { name });
      if (result?.ok && result.data != null) {
        console.log('[Store] Read from IPC file OK:', name, '(', String(result.data).length, 'chars)');
        return result.data as string;
      }
      // First-boot migration: try localStorage
      const lsData = localStorage.getItem(name);
      if (lsData) {
        console.log('[Store] Migrating from localStorage to IPC:', name);
        await ipc.invoke('store:write', { name, data: lsData });
      }
      return lsData;
    } catch (err) {
      console.error('[Store] getItem error:', name, err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const ipc = (window as any).electron?.ipcRenderer;
      if (!ipc) { localStorage.setItem(name, value); return; }
      await ipc.invoke('store:write', { name, data: value });
      console.log('[Store] Wrote to IPC file:', name, '(', value.length, 'chars)');
      try { localStorage.setItem(name, value); } catch {} // redundant backup
    } catch (err) {
      console.error('[Store] setItem error:', name, err);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const ipc = (window as any).electron?.ipcRenderer;
      if (ipc) await ipc.invoke('store:write', { name, data: null });
      localStorage.removeItem(name);
    } catch {}
  },
};
const electronFileStorage = createJSONStorage(() => ipcStorageDriver as any);

export interface DataColumn {
  name: string;
  dtype: string;
}

export interface DataSource {
  id: string;
  type: 'csv' | 'excel' | 'sql';
  path: string;
  name?: string;
  columns: DataColumn[];
  rowCount: number;
  rows?: Record<string, any>[];
  previewRow?: Record<string, string>;
  internalPath?: string;
}

// Re-export FieldBinding from template.ts (moved there to break circular dependency)
export type { FieldBinding } from '../types/template';

interface DataState {
  sources: DataSource[];
  bindings: FieldBinding[];
  activeSourceId: string | null;
  currentPreviewRow: number;
  isDataSourceModalOpen: boolean;
  isSerialNumberModalOpen: boolean;
  serialConfigs: Record<string, SerialNumberConfig>;
  isHydrated: boolean;
  setHydrated: (h: boolean) => void;

  setDataSourceModalOpen: (open: boolean) => void;
  setSerialNumberModalOpen: (open: boolean) => void;
  addSource: (source: DataSource, options?: { isReload?: boolean }) => void;
  removeSource: (id: string) => void;
  updateSourceRows: (id: string, rows: Record<string, any>[]) => void;
  updateSourcePreviewRow: (id: string, row: Record<string, string>) => void;
  setActiveSource: (id: string | null) => void;
  setPreviewRow: (idx: number) => void;
  addBinding: (binding: FieldBinding) => void;
  updateBinding: (fieldId: string, updates: Partial<FieldBinding>) => void;
  removeBinding: (fieldId: string) => void;
  getBindingForField: (fieldId: string) => FieldBinding | undefined;
  reloadSources: () => Promise<void>;
  refreshSource: (id: string) => Promise<{ ok: boolean; error?: string }>;
  // Serial number management
  setSerialConfig: (fieldId: string, config: SerialNumberConfig) => void;
  getSerialConfig: (fieldId: string) => SerialNumberConfig | undefined;
  incrementSerial: (fieldId: string) => void;
  resetSerial: (fieldId: string) => void;
  // Resolve binding value for preview
  resolveBindingValue: (fieldId: string, rowIndex?: number) => string;
}

function formatDateTime(formatStr: string): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const y = now.getFullYear();
  const M = now.getMonth() + 1;
  const d = now.getDate();
  const H = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const h12 = H % 12 || 12;
  const ampm = H >= 12 ? 'PM' : 'AM';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return formatStr
    .replace('YYYY', String(y))
    .replace('YY', String(y).slice(-2))
    .replace('MMMM', months[M - 1])
    .replace('MMM', monthsShort[M - 1])
    .replace('MM', pad(M))
    .replace(/(?<!M)M(?!M)/, String(M))
    .replace('dddd', days[now.getDay()])
    .replace('DD', pad(d))
    .replace(/(?<!D)D(?!D)/, String(d))
    .replace('HH', pad(H))
    .replace('hh', pad(h12))
    .replace(/(?<!h)h(?!h)/, String(h12))
    .replace('mm', pad(m))
    .replace('ss', pad(s))
    .replace('A', ampm)
    .replace('Z', 'Z');
}

function formatSerialValue(config: SerialNumberConfig): string {
  let val = config.current_value;
  let text = '';

  if (config.type === 'hex') {
    text = val.toString(16).toUpperCase();
  } else if (config.type === 'alpha') {
    // Basic A-Z mapping
    text = String.fromCharCode(65 + (val % 26));
  } else if (config.type === 'custom' && config.custom_sequence) {
    const seq = config.custom_sequence;
    text = seq[val % seq.length];
  } else {
    text = String(val);
  }

  if (config.pad_left && config.digits > 0) {
    text = text.padStart(config.digits, '0');
  }

  return `${config.prefix}${text}${config.suffix}`;
}

const DEFAULT_SERIAL: SerialNumberConfig = {
  id: '',
  name: 'New Serial',
  start: 1,
  increment: 1,
  step_type: 'increase',
  digits: 5,
  pad_left: true,
  prefix: '',
  suffix: '',
  type: 'decimal',
  reset_on: 'never',
  current_value: 1,
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      sources: [],
      bindings: [],
      activeSourceId: null,
      currentPreviewRow: 0,
      isDataSourceModalOpen: false,
      isSerialNumberModalOpen: false,
      serialConfigs: {},
      isHydrated: false,
      setHydrated: (h: boolean) => set({ isHydrated: h }),

      setDataSourceModalOpen: (open) => set({ isDataSourceModalOpen: open }),
      setSerialNumberModalOpen: (open) => set({ isSerialNumberModalOpen: open }),

      addSource: (source, options) => set(s => {
        if (!options?.isReload) {
          const activeTabId = useTabsStore.getState().activeId;
          if (activeTabId) useTabsStore.getState().updateActiveSource(activeTabId, source.id);
        }
        return {
          sources: [...s.sources.filter(x => x.id !== source.id), source],
          activeSourceId: options?.isReload ? s.activeSourceId : source.id,
        };
      }),

      removeSource: (id) => set(s => ({
        sources: s.sources.filter(d => d.id !== id),
        activeSourceId: s.activeSourceId === id ? (s.sources.find(d => d.id !== id)?.id ?? null) : s.activeSourceId,
      })),

      updateSourceRows: (id, rows) => set(s => ({
        sources: s.sources.map(src => src.id === id ? { ...src, rows } : src),
      })),

      updateSourcePreviewRow: (id, row) => set(s => ({
        sources: s.sources.map(src => src.id === id ? { ...src, previewRow: row } : src),
      })),

      setActiveSource: (id) => set(s => {
        const activeTabId = useTabsStore.getState().activeId;
        if (activeTabId) useTabsStore.getState().updateActiveSource(activeTabId, id);
        return { activeSourceId: id };
      }),
      setPreviewRow: (idx) => set(s => {
        const activeTabId = useTabsStore.getState().activeId;
        if (activeTabId) useTabsStore.getState().updatePreviewRow(activeTabId, idx);
        return { currentPreviewRow: idx };
      }),

      addBinding: (binding) => set(s => ({
        bindings: [...s.bindings.filter(b => b.fieldId !== binding.fieldId), binding],
      })),

      updateBinding: (fieldId, updates) => set(s => ({
        bindings: s.bindings.map(b => b.fieldId === fieldId ? { ...b, ...updates } : b),
      })),

      removeBinding: (fieldId) => set(s => ({
        bindings: s.bindings.filter(b => b.fieldId !== fieldId),
      })),

      getBindingForField: (fieldId) => get().bindings.find(b => b.fieldId === fieldId),

      getSerialConfig: (id) => get().serialConfigs[id],
      setSerialConfig: (id, config) => set(s => ({
        serialConfigs: { ...s.serialConfigs, [id]: config },
      })),
      incrementSerial: (id) => set(s => {
        const cfg = s.serialConfigs[id];
        if (!cfg) return s;
        const delta = cfg.step_type === 'decrease' ? -cfg.increment : cfg.increment;
        return {
          serialConfigs: {
            ...s.serialConfigs,
            [id]: { ...cfg, current_value: cfg.current_value + delta },
          },
        };
      }),
      resetSerial: (id) => set(s => {
        const cfg = s.serialConfigs[id];
        if (!cfg) return s;
        return {
          serialConfigs: {
            ...s.serialConfigs,
            [id]: { ...cfg, current_value: cfg.start },
          },
        };
      }),

      resolveBindingValue: (fieldId, rowIndex?) => {
        const state = get();
        const binding = state.bindings.find(b => b.fieldId === fieldId);
        if (!binding) return '';

        switch (binding.type) {
          case 'database': {
            if (!binding.column) return '';
            const source = state.sources.find(s => s.id === binding.sourceId) || state.sources[0];
            if (!source) return '';
            const ri = rowIndex ?? state.currentPreviewRow;
            const isExplicit = rowIndex !== undefined;
            
            if (!isExplicit && source.previewRow && source.previewRow[binding.column] !== undefined) {
              return String(source.previewRow[binding.column] || '');
            }
            if (source.rows && source.rows.length > ri) {
              return String(source.rows[ri][binding.column] || '');
            }
            return '';
          }
          case 'serial': {
            const cfgId = binding.serialId || fieldId;
            const cfg = state.serialConfigs[cfgId] || state.serialConfigs[fieldId] || binding.serialConfig || DEFAULT_SERIAL;
            const ri = rowIndex ?? state.currentPreviewRow;
            const delta = (cfg.increment || 1) * (cfg.step_type === 'decrease' ? -1 : 1);
            const calculatedCfg = {
              ...cfg,
              current_value: cfg.current_value + (ri * delta)
            };
            return formatSerialValue(calculatedCfg);
          }
          case 'date':
          case 'time': {
            const fmt = binding.formatStr || 'YYYY-MM-DD HH:mm:ss';
            return formatDateTime(fmt);
          }
          case 'keyboard': {
            return binding.defaultValue || `[${binding.promptLabel || 'Input'}]`;
          }
          case 'fixed': {
            return binding.fixedValue || '';
          }
          case 'programming': {
            return binding.expression || '';
          }
          default:
            return '';
        }
      },

      reloadSources: async () => {
        // Rows are now persisted directly in localStorage.
        // No reload needed — data survives restarts automatically.
        console.log('DataStore: rows are persisted, no reload needed.');
      },

      refreshSource: async (id) => {
        const { sources, addSource } = get();
        const source = sources.find(s => s.id === id);
        if (!source || !source.path) return { ok: false, error: 'Source path missing' };

        try {
          const ext = source.path.split('.').pop()?.toLowerCase() || '';
          let columns: { name: string; dtype: string }[] = [];
          let rows: any[] = [];
          
          if (['xlsx', 'xls'].includes(ext)) {
            // Excel - read as binary
            const res = await (window as any).electron.ipcRenderer.invoke('data:read-file-binary', { path: source.path });
            if (!res.ok) throw new Error(res.error || 'Could not read Excel from path');
            
            const wb = XLSX.read(res.data, { type: 'array', cellDates: true });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            // Get raw rows
            const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
            if (rawRows.length === 0) throw new Error('Excel is empty');
            
            const headers = (rawRows[0] || []).map(h => String(h || '').trim());
            columns = headers.map(name => ({ name: name || 'Column', dtype: 'string' }));
            
            // Map and filter data rows to objects
            rows = rawRows.slice(1)
              .filter(row => row.some(v => v !== null && v !== undefined && String(v).trim() !== ""))
              .map(row => {
                const obj: Record<string, string> = {};
                headers.forEach((h, i) => {
                  const val = row[i];
                  obj[h] = (val === undefined || val === null) ? '' : String(val);
                });
                return obj;
              });
          } else {
            // Text files (CSV, JSON, etc.)
            const res = await (window as any).electron.ipcRenderer.invoke('data:read-file-text', { path: source.path });
            if (!res.ok) throw new Error(res.error || 'Could not read file text');
            
            if (ext === 'json') {
              const json = JSON.parse(res.content);
              const records = Array.isArray(json) ? json : (json.data || json.records || []);
              if (!records.length) throw new Error('No records in JSON');
              rows = records;
              columns = Object.keys(records[0]).map(k => ({ name: k, dtype: 'string' }));
            } else {
              // CSV / TSV
              const results = Papa.parse<Record<string, unknown>>(res.content, { header: true, skipEmptyLines: true });
              if (results.meta.fields) {
                columns = results.meta.fields.map(name => ({ name, dtype: 'string' }));
                // Filter out empty rows from CSV
                rows = results.data.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ""));
              } else if (results.data.length > 0) {
                columns = Object.keys(results.data[0]).map(k => ({ name: k, dtype: 'string' }));
                rows = results.data.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ""));
              }
            }
          }

          if (rows.length > 0) {
            addSource({
              ...source,
              columns,
              rows,
              rowCount: rows.length,
            }, { isReload: true });
            
            console.log(`[Store] successfully refreshed source ${source.name} with ${rows.length} rows`);
            return { ok: true };
          }
          return { ok: false, error: 'No new data found in source' };
        } catch (err: any) {
          console.error('[Store] refreshSource error:', err);
          return { ok: false, error: err.message || 'Refresh failed' };
        }
      },
    }),
    {
      name: 'omg-data-v1',
      storage: electronFileStorage,
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('DataStore hydration failed:', error);
        else {
          console.log('DataStore hydrated:', state?.sources?.length, 'sources');
          state?.setHydrated(true);
        }
      },
      partialize: (state) => ({
        sources: state.sources.map(s => ({
          id: s.id,
          type: s.type,
          path: s.path,
          name: s.name,
          columns: s.columns,
          rowCount: s.rowCount,
          rows: s.rows ?? [], // ✅ Persist rows so data survives restarts
        })),
        bindings: state.bindings,
        activeSourceId: state.activeSourceId,
        currentPreviewRow: state.currentPreviewRow,
        serialConfigs: state.serialConfigs,
      }),
    }
  )
);
