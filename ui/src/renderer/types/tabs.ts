// src/renderer/types/tabs.ts — Multi-Tab Canvas Type Definitions
// ═══════════════════════════════════════════════════════════════════
import type { LabelElement, LabelConfig, SheetLayout } from './template';

/** Unique identifier for each tab (nanoid-style short string) */
export type TabId = string;

export type TabSaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/** Full state snapshot for one open tab */
export interface Tab {
  id: TabId;
  name: string;                // display name — derived from filename or "Untitled"
  filePath: string | null;     // absolute path on disk; null = never saved
  saveState: TabSaveState;
  lastSaved: number | null;    // Unix timestamp
  createdAt: number;

  // Per-tab document state
  elements: LabelElement[];
  label: LabelConfig;
  sheetLayout: SheetLayout;

  // Per-tab UI state (restored on tab switch)
  scrollX: number;
  scrollY: number;
  selectedId: string | null;

  // Undo/redo history (per-tab)
  past: Array<{ elements: LabelElement[]; label: LabelConfig }>;
  future: Array<{ elements: LabelElement[]; label: LabelConfig }>;

  // Thumbnail for tab icon (generated on save)
  thumbnail: string | null;    // base64 PNG, 48×34px

  // Per-tab data state
  activeSourceId: string | null;
  currentPreviewRow: number;

  // Whether this tab is currently being renamed inline
  isRenaming: boolean;
}

/** Lightweight version used in the tab bar render */
export interface TabMeta {
  id: TabId;
  name: string;
  filePath: string | null;
  saveState: TabSaveState;
  thumbnail: string | null;
  isRenaming: boolean;
  configW: number;    // label width mm — for thumbnail shape
  configH: number;
}

/** The tabs Zustand store shape */
export interface TabsState {
  tabs: Tab[];
  activeId: TabId | null;

  // Actions
  openTab: (source: OpenTabSource) => Promise<TabId>;
  closeTab: (id: TabId) => Promise<void>;
  switchTab: (id: TabId) => void;
  duplicateTab: (id: TabId) => TabId;
  renameTab: (id: TabId, name: string) => void;
  reorderTab: (fromIdx: number, toIdx: number) => void;
  markDirty: (id: TabId) => void;
  markSaved: (id: TabId, path: string) => void;
  setThumbnail: (id: TabId, thumb: string) => void;
  closeOthers: (id: TabId) => Promise<void>;
  closeAll: () => Promise<void>;
  closeSaved: () => void;
  getActive: () => Tab | null;
  getMeta: () => TabMeta[];
  setScroll: (id: TabId, x: number, y: number) => void;
  setSelectedEl: (id: TabId, elId: string | null) => void;
  startRenaming: (id: TabId) => void;
  updateElements: (id: TabId, elements: LabelElement[]) => void;
  updateElementsRealtime: (id: TabId, elId: string, updates: Partial<LabelElement>) => void;
  updateLabel: (id: TabId, patch: Partial<LabelConfig>) => void;
  updateActiveSource: (id: TabId, sourceId: string | null) => void;
  updatePreviewRow: (id: TabId, idx: number) => void;
  pushHistory: (id: TabId) => void;
  undo: (id: TabId) => void;
  redo: (id: TabId) => void;
}

/** How a new tab is created */
export type OpenTabSource =
  | { type: 'new'; preset?: string }             // New Template
  | { type: 'file'; path: string }               // Open from disk
  | { type: 'template'; templateId: string }     // From template library
  | { type: 'preset'; preset: any }             // From home page presets
  | { type: 'duplicate'; sourceTabId: TabId };   // Duplicate existing
