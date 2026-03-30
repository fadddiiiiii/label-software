// src/renderer/store/settings.ts — Full App Settings with Zustand Persist
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  // A — General
  theme: 'light' | 'dark' | 'system';
  language: string;
  units: 'mm' | 'cm' | 'in' | 'pt' | 'mil' | 'px';
  autoSaveMinutes: number;
  startupBehaviour: 'last' | 'library' | 'blank';
  recentFilesCount: number;
  restoreWindowSize: boolean;
  telemetry: boolean;
  confirmBeforeClose: boolean;

  // B — Workspace
  defaultZoom: number;
  gridSizeMm: number;
  snapToGrid: boolean;
  snapThresholdMm: number;
  showRulers: boolean;
  rulerUnits: 'mm' | 'cm' | 'in' | 'pt' | 'mil' | 'px';
  canvasBackground: string;
  workspaceBackground: string;
  showBindingDots: boolean;
  showElementTooltips: boolean;
  defaultFont: string;
  defaultFontSize: number;

  // C — Label Dimensions
  defaultLabelWidth: number;
  defaultLabelHeight: number;
  defaultLabelShape: 'rect' | 'ellipse' | 'round_rect';
  sheetCols: number;
  sheetRows: number;
  colGapMm: number;
  rowGapMm: number;
  sheetPageSize: string;
  sheetOrientation: 'portrait' | 'landscape';
  sheetTopMarginMm: number;
  sheetLeftMarginMm: number;

  // D — Barcode & Print
  defaultSymbology: string;
  barcodeRenderDpi: number;
  quietZoneFactor: number;
  includeChecksum: boolean;
  showBarcodeText: boolean;
  barcodeTextFont: string;
  barcodeTextPosition: 'below' | 'above';
  barcodeEncoding: string;
  barcodeLanguage: string;
  defaultPrinter: string;
  copiesPerLabel: number;
  printOrientation: 'portrait' | 'landscape';
  pdfOutputFolder: string;
  pdfResolution: number;
  colourProfile: string;
  labelOffsetX: number;
  labelOffsetY: number;
  printPreview: boolean;

  // E — Data Sources
  defaultDataFolder: string;
  csvEncoding: string;
  csvDelimiter: string;
  dateFormat: string;
  timeFormat: string;
  nullValueDisplay: string;
  autoDetectTypes: boolean;
  defaultDbTimeout: number;
  maxPreviewRows: number;
  cacheDataSource: boolean;

  // F — Performance
  hardwareAcceleration: boolean;
  barcodeImageCache: boolean;
  cacheSizeLimitMb: number;
  preRenderOnLoad: boolean;
  undoStackDepth: number;
  elementCountWarning: number;
  canvasLayerCaching: boolean;
  smoothZoom: boolean;
  reduceMotion: boolean;

  // G — Shortcuts (stored as JSON)
  customShortcuts: Record<string, string>;

  // H — Updates
  autoCheckUpdates: boolean;
  checkIntervalHours: number;
  updateChannel: 'stable' | 'beta' | 'nightly';
  autoDownloadUpdates: boolean;
  showUpdateBadge: boolean;
  notifyOnDesktop: boolean;
  updateProxy: string;

  // I — Advanced
  developerMode: boolean;
  ipcLogLevel: 'errors' | 'warnings' | 'verbose';
  pythonTimeout: number;
  showRawIpc: boolean;
}

const DEFAULTS: AppSettings = {
  theme: 'light', language: 'en', units: 'mm',
  autoSaveMinutes: 5, startupBehaviour: 'last', recentFilesCount: 10,
  restoreWindowSize: true, telemetry: false, confirmBeforeClose: true,

  defaultZoom: 1, gridSizeMm: 5, snapToGrid: false, snapThresholdMm: 0.5,
  showRulers: true, rulerUnits: 'mm', canvasBackground: '#FFFFFF',
  workspaceBackground: '', showBindingDots: true, showElementTooltips: true,
  defaultFont: 'Helvetica Neue', defaultFontSize: 12,

  defaultLabelWidth: 100, defaultLabelHeight: 70, defaultLabelShape: 'rect',
  sheetCols: 1, sheetRows: 1, colGapMm: 0, rowGapMm: 0,
  sheetPageSize: 'A4', sheetOrientation: 'portrait',
  sheetTopMarginMm: 10, sheetLeftMarginMm: 10,

  defaultSymbology: 'code128', barcodeRenderDpi: 300, quietZoneFactor: 10,
  includeChecksum: true, showBarcodeText: true,
  barcodeTextFont: 'Helvetica', barcodeTextPosition: 'below',
  barcodeEncoding: 'UTF-8', barcodeLanguage: 'en',
  defaultPrinter: 'System Default',
  copiesPerLabel: 1, printOrientation: 'portrait',
  pdfOutputFolder: '~/Documents', pdfResolution: 300, colourProfile: 'sRGB',
  labelOffsetX: 0, labelOffsetY: 0, printPreview: true,

  defaultDataFolder: '~/Documents', csvEncoding: 'UTF-8', csvDelimiter: ',',
  dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss', nullValueDisplay: '—',
  autoDetectTypes: true, defaultDbTimeout: 30, maxPreviewRows: 500, cacheDataSource: true,

  hardwareAcceleration: true, barcodeImageCache: true, cacheSizeLimitMb: 128,
  preRenderOnLoad: true, undoStackDepth: 50, elementCountWarning: 200,
  canvasLayerCaching: true, smoothZoom: true, reduceMotion: false,

  customShortcuts: {},

  autoCheckUpdates: true, checkIntervalHours: 24, updateChannel: 'stable',
  autoDownloadUpdates: true, showUpdateBadge: true, notifyOnDesktop: true, updateProxy: '',

  developerMode: false, ipcLogLevel: 'errors', pythonTimeout: 30, showRawIpc: false,
};

interface SettingsState extends AppSettings {
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  reset: () => void;
  getSnapshot: () => AppSettings;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as any),
      reset: () => set({ ...DEFAULTS }),
      getSnapshot: () => {
        const state = get();
        const snap: any = {};
        for (const k of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
          snap[k] = state[k];
        }
        return snap as AppSettings;
      },
    }),
    { name: 'omg-settings-v1' }
  )
);
