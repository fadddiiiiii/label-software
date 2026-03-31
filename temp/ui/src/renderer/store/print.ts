// src/renderer/store/print.ts — Print Job Zustand Store (Full Feature Set)
import { create } from 'zustand';
import { PrintSettings, DEFAULT_PRINT_SETTINGS } from '../types/template';

export interface PrintProgress {
  totalRows: number;
  completedRows: number;
  errorRows: number;
  currentRow: number;
  status: 'idle' | 'running' | 'paused' | 'done' | 'partial' | 'failed' | 'cancelled';
  elapsedMs: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

export interface PrintLogEntry {
  timestamp: string;
  templateName: string;
  printer: string;
  totalLabels: number;
  rowsProcessed: number;
  copiesPerLabel: number;
  durationMs: number;
  firstSerialValue?: string;
  lastSerialValue?: string;
  errors: string[];
}

interface PrintState {
  printers: string[];
  selectedPrinter: string;
  settings: PrintSettings;
  progress: PrintProgress;
  printLog: PrintLogEntry[];
  showBatchConsole: boolean;
  showPrintSettings: boolean;
  showPrintPreview: boolean;
  showKeyboardInput: boolean;
  keyboardValues: Record<string, string>;

  setPrinters: (printers: string[]) => void;
  setSelectedPrinter: (name: string) => void;
  updateSettings: (updates: Partial<PrintSettings>) => void;
  setProgress: (progress: Partial<PrintProgress>) => void;
  resetProgress: () => void;
  addLogEntry: (entry: PrintLogEntry) => void;
  clearLog: () => void;
  setShowBatchConsole: (show: boolean) => void;
  setShowPrintSettings: (show: boolean) => void;
  setShowPrintPreview: (show: boolean) => void;
  setShowKeyboardInput: (show: boolean) => void;
  setKeyboardValue: (key: string, value: string) => void;
  clearKeyboardValues: () => void;

  // Legacy compat
  copiesPerLabel: number;
  printRange: 'all' | 'custom';
  customRange: { start: number; end: number };
  setCopiesPerLabel: (n: number) => void;
  setPrintRange: (range: 'all' | 'custom') => void;
  setCustomRange: (start: number, end: number) => void;
}

const defaultProgress: PrintProgress = {
  totalRows: 0, completedRows: 0, errorRows: 0, currentRow: 0,
  status: 'idle', elapsedMs: 0, errors: [],
};

export const usePrintStore = create<PrintState>((set) => ({
  printers: ['PDF'],
  selectedPrinter: 'PDF',
  settings: { ...DEFAULT_PRINT_SETTINGS },
  progress: { ...defaultProgress },
  printLog: [],
  showBatchConsole: false,
  showPrintSettings: false,
  showPrintPreview: false,
  showKeyboardInput: false,
  keyboardValues: {},

  // Legacy compat
  copiesPerLabel: 1,
  printRange: 'all',
  customRange: { start: 1, end: 1 },

  setPrinters: (printers) => set({ printers }),
  setSelectedPrinter: (name) => set(s => ({
    selectedPrinter: name,
    settings: { ...s.settings, printer: name },
  })),
  updateSettings: (updates) => set(s => ({
    settings: { ...s.settings, ...updates },
  })),
  setCopiesPerLabel: (n) => set(s => ({
    copiesPerLabel: Math.max(1, n),
    settings: { ...s.settings, copies: Math.max(1, n) },
  })),
  setPrintRange: (r) => set(s => ({
    printRange: r,
    settings: { ...s.settings, all_rows: r === 'all' },
  })),
  setCustomRange: (start, end) => set({ customRange: { start: Math.max(1, start), end: Math.max(1, end) } }),
  setProgress: (updates) => set(s => ({ progress: { ...s.progress, ...updates } })),
  resetProgress: () => set({ progress: { ...defaultProgress } }),
  addLogEntry: (entry) => set(s => ({ printLog: [...s.printLog, entry] })),
  clearLog: () => set({ printLog: [] }),
  setShowBatchConsole: (show) => set({ showBatchConsole: show }),
  setShowPrintSettings: (show) => set({ showPrintSettings: show }),
  setShowPrintPreview: (show) => set({ showPrintPreview: show }),
  setShowKeyboardInput: (show) => set({ showKeyboardInput: show }),
  setKeyboardValue: (key, value) => set(s => ({
    keyboardValues: { ...s.keyboardValues, [key]: value },
  })),
  clearKeyboardValues: () => set({ keyboardValues: {} }),
}));
