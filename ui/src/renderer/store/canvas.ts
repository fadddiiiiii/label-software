// src/renderer/store/canvas.ts — Canvas Store (Multi-Tab Adapter)
// ═══════════════════════════════════════════════════════════════════
// The canvas store now delegates all per-document state to the active
// tab in useTabsStore. Global state (zoom, showGrid, snapToGrid) stays
// here. All existing consumers continue to work via the same API.
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { produce } from 'immer';
import {
  LabelElement,
  LabelConfig,
  SheetLayout,
  TemplateDocument,
  DEFAULT_LABEL_CONFIG,
  DEFAULT_SHEET_LAYOUT,
  createBlankElement,
  ElementType,
} from '../types/template';
import { useTabsStore } from './tabs';
import { useDataStore } from './data';
import { TabsState } from '../types/tabs';
import { useSettingsStore } from './settings';

// ── Global (non-per-tab) state ─────────────────────────────────────
interface GlobalCanvasState {
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  showRulers: boolean;

  // Actions
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleRulers: () => void;
}

export const useCanvasStore = create<GlobalCanvasState>((set) => ({
  zoom: 1,
  showGrid: true,
  snapToGrid: true,
  showRulers: false,

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(4, zoom)) }),
  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set(s => ({ snapToGrid: !s.snapToGrid })),
  toggleRulers: () => set(s => ({ showRulers: !s.showRulers })),
}));

// ── Helpers that read/write on the active tab ───────────────────────

function getActiveTab() {
  return useTabsStore.getState().getActive();
}

function getActiveId() {
  return useTabsStore.getState().activeId;
}

// ── Per-tab state accessors (used by components via hooks) ─────────
export function useActiveElements(): LabelElement[] {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.elements ?? [];
}

export function useActiveLabel(): LabelConfig {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.label ?? { ...DEFAULT_LABEL_CONFIG };
}

export function useActiveSheetLayout(): SheetLayout {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.sheetLayout ?? { ...DEFAULT_SHEET_LAYOUT };
}

export function useSelectedId(): string | null {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.selectedId ?? null;
}

export function useActiveDirty(): boolean {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.saveState === 'unsaved';
}

export function useActiveFilePath(): string | null {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  return tab?.filePath ?? null;
}

// ── Action helpers (imperative, called outside React hooks) ────────

export function addElement(type: ElementType): LabelElement {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return createBlankElement(type);

  const s = useSettingsStore.getState();
  const elem = createBlankElement(type);
  elem.z_index = tab.elements.length;
  // Apply user defaults from settings
  if (type === 'text') {
    elem.font_name = s.defaultFont || elem.font_name;
    elem.font_size = s.defaultFontSize || elem.font_size;
  }
  if (type === 'barcode') {
    elem.symbology = s.defaultSymbology || elem.symbology;
    elem.show_text = s.showBarcodeText;
    elem.text_font_name = s.barcodeTextFont || elem.text_font_name;
    elem.text_on_top = s.barcodeTextPosition === 'above';
  }
  if (type === 'qrcode') {
    elem.symbology = 'qrcode';
  }

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  tabsStore.updateElements(tabId, [...tab.elements, elem]);
  tabsStore.setSelectedEl(tabId, elem.id);
  return elem;
}

export function updateElementRealtime(id: string, updates: Partial<LabelElement>) {
  const activeId = getActiveId();
  if (!activeId) return;
  useTabsStore.getState().updateElementsRealtime(activeId, id, updates);
}

/**
 * Standard update that saves to history.
 */
export function updateElement(id: string, updates: Partial<LabelElement>) {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const next = tab.elements.map(e => e.id === id ? { ...e, ...updates } : e);
  tabsStore.updateElements(tabId, next);
}

export function removeElement(id: string) {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const next = tab.elements.filter(e => e.id !== id);
  tabsStore.updateElements(tabId, next);
  if (tab.selectedId === id) tabsStore.setSelectedEl(tabId, null);
}

export function selectElement(id: string | null) {
  const tabId = getActiveId();
  if (tabId) useTabsStore.getState().setSelectedEl(tabId, id);
}

export function moveElement(id: string, x_mm: number, y_mm: number) {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const next = tab.elements.map(e =>
    (e.id === id && !e.locked) ? { ...e, x_mm, y_mm } : e
  );
  tabsStore.updateElements(tabId, next);
}

export function reorderElement(id: string, direction: 'up' | 'down') {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const sorted = [...tab.elements].sort((a, b) => a.z_index - b.z_index);
  const idx = sorted.findIndex(e => e.id === id);
  if (idx === -1) return;
  const target = direction === 'up' ? idx + 1 : idx - 1;
  if (target < 0 || target >= sorted.length) return;
  [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
  sorted.forEach((e, i) => { e.z_index = i; });
  tabsStore.updateElements(tabId, sorted);
}

export function duplicateElement(id: string) {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;

  const original = tab.elements.find(e => e.id === id);
  if (!original) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const dup = {
    ...original,
    id: `field_${Date.now().toString(36)}`,
    x_mm: original.x_mm + 5,
    y_mm: original.y_mm + 5,
    z_index: tab.elements.length,
  };
  tabsStore.updateElements(tabId, [...tab.elements, dup]);
  tabsStore.setSelectedEl(tabId, dup.id);
}

export function setLabel(config: Partial<LabelConfig>) {
  const tabId = getActiveId();
  if (tabId) {
    const tabsStore = useTabsStore.getState();
    tabsStore.pushHistory(tabId);
    tabsStore.updateLabel(tabId, config);
  }
}

// ── Alignment tools (multi-element) ──────────────────────────────

export function alignElements(selectedIds: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
  const tab = getActiveTab();
  const tabId = getActiveId();
  if (!tab || !tabId || selectedIds.length < 2) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);

  const selected = tab.elements.filter(e => selectedIds.includes(e.id));
  if (selected.length < 2) return;

  const next = tab.elements.map(e => {
    if (!selectedIds.includes(e.id)) return e;
    const clone = { ...e };
    switch (alignment) {
      case 'left': clone.x_mm = Math.min(...selected.map(s => s.x_mm)); break;
      case 'right': clone.x_mm = Math.max(...selected.map(s => s.x_mm + s.width_mm)) - clone.width_mm; break;
      case 'center': {
        const minX = Math.min(...selected.map(s => s.x_mm));
        const maxX = Math.max(...selected.map(s => s.x_mm + s.width_mm));
        clone.x_mm = (minX + maxX) / 2 - clone.width_mm / 2;
        break;
      }
      case 'top': clone.y_mm = Math.min(...selected.map(s => s.y_mm)); break;
      case 'bottom': clone.y_mm = Math.max(...selected.map(s => s.y_mm + s.height_mm)) - clone.height_mm; break;
      case 'middle': {
        const minY = Math.min(...selected.map(s => s.y_mm));
        const maxY = Math.max(...selected.map(s => s.y_mm + s.height_mm));
        clone.y_mm = (minY + maxY) / 2 - clone.height_mm / 2;
        break;
      }
    }
    return clone;
  });
  tabsStore.updateElements(tabId, next);
}

export function distributeElements(selectedIds: string[], axis: 'horizontal' | 'vertical') {
  const tab = getActiveTab();
  const tabId = getActiveId();
  if (!tab || !tabId || selectedIds.length < 3) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);

  const selected = tab.elements.filter(e => selectedIds.includes(e.id));
  if (selected.length < 3) return;

  if (axis === 'horizontal') {
    const sorted = [...selected].sort((a, b) => a.x_mm - b.x_mm);
    const minX = sorted[0].x_mm;
    const maxX = sorted[sorted.length - 1].x_mm + sorted[sorted.length - 1].width_mm;
    const totalWidth = sorted.reduce((sum, e) => sum + e.width_mm, 0);
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1);
    let x = minX;
    const positions: Record<string, number> = {};
    for (const e of sorted) {
      positions[e.id] = x;
      x += e.width_mm + gap;
    }
    const next = tab.elements.map(e => selectedIds.includes(e.id) ? { ...e, x_mm: Math.round((positions[e.id] ?? e.x_mm) * 10) / 10 } : e);
    tabsStore.updateElements(tabId, next);
  } else {
    const sorted = [...selected].sort((a, b) => a.y_mm - b.y_mm);
    const minY = sorted[0].y_mm;
    const maxY = sorted[sorted.length - 1].y_mm + sorted[sorted.length - 1].height_mm;
    const totalHeight = sorted.reduce((sum, e) => sum + e.height_mm, 0);
    const gap = (maxY - minY - totalHeight) / (sorted.length - 1);
    let y = minY;
    const positions: Record<string, number> = {};
    for (const e of sorted) {
      positions[e.id] = y;
      y += e.height_mm + gap;
    }
    const next = tab.elements.map(e => selectedIds.includes(e.id) ? { ...e, y_mm: Math.round((positions[e.id] ?? e.y_mm) * 10) / 10 } : e);
    tabsStore.updateElements(tabId, next);
  }
}

export function centerOnLabel(selectedIds: string[], axis: 'horizontal' | 'vertical') {
  const tab = getActiveTab();
  const tabId = getActiveId();
  if (!tab || !tabId || selectedIds.length === 0) return;

  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);

  const next = tab.elements.map(e => {
    if (!selectedIds.includes(e.id)) return e;
    const clone = { ...e };
    if (axis === 'horizontal') {
      clone.x_mm = (tab.label.width_mm - clone.width_mm) / 2;
    } else {
      clone.y_mm = (tab.label.height_mm - clone.height_mm) / 2;
    }
    return clone;
  });
  tabsStore.updateElements(tabId, next);
}

export function bringToFront(id: string) {
  const tab = getActiveTab();
  const tabId = getActiveId();
  if (!tab || !tabId) return;
  const maxZ = Math.max(...tab.elements.map(e => e.z_index), 0);
  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  tabsStore.updateElements(tabId, tab.elements.map(e => e.id === id ? { ...e, z_index: maxZ + 1 } : e));
}

export function sendToBack(id: string) {
  const tab = getActiveTab();
  const tabId = getActiveId();
  if (!tab || !tabId) return;
  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  const sorted = [...tab.elements].sort((a, b) => a.z_index - b.z_index);
  const next = sorted.map((e, i) => e.id === id ? { ...e, z_index: -1 } : e);
  next.sort((a, b) => a.z_index - b.z_index).forEach((e, i) => { e.z_index = i; });
  tabsStore.updateElements(tabId, next);
}

export function setSheetLayout(layout: Partial<SheetLayout>) {
  const tabId = getActiveId();
  const tab = getActiveTab();
  if (!tabId || !tab) return;
  const tabsStore = useTabsStore.getState();
  tabsStore.pushHistory(tabId);
  useTabsStore.setState(s => {
    const t = s.tabs.find(tt => tt.id === tabId);
    if (t) { Object.assign(t.sheetLayout, layout); t.saveState = 'unsaved'; }
  });
}

export function loadTemplate(doc: TemplateDocument) {
  const tabId = getActiveId();
  if (!tabId) return;
  const tabsStore = useTabsStore.getState();
  const dsStore = useDataStore.getState();

  tabsStore.updateElements(tabId, doc.elements);
  tabsStore.updateLabel(tabId, doc.label);
  
  // Sync Data Store if the doc has sources
  if (doc.active_source_id) {
    dsStore.setActiveSource(doc.active_source_id);
    if (doc.current_row_index !== undefined) {
      dsStore.setPreviewRow(doc.current_row_index);
    }
  }

  useTabsStore.setState(s => {
    const t = s.tabs.find(tt => tt.id === tabId);
    if (t) {
      t.sheetLayout = doc.sheet_layout;
      t.activeSourceId = doc.active_source_id ?? null;
      t.currentPreviewRow = doc.current_row_index ?? 0;
      t.past = [];
      t.future = [];
      t.selectedId = null;
      t.saveState = 'saved';
    }
  });
}

export function toDocument(): TemplateDocument {
  const tab = getActiveTab();
  const ds = useDataStore.getState();
  
  return {
    schema_version: '1.0',
    label: tab?.label ?? { ...DEFAULT_LABEL_CONFIG },
    sheet_layout: tab?.sheetLayout ?? { ...DEFAULT_SHEET_LAYOUT },
    elements: (tab?.elements ?? []).map(e => {
      // Base element with common styling
      const baseElem = {
        ...e,
        bold: e.font_weight === 'bold' || e.font_weight === 700,
        italic: e.font_italic,
        // Ensure vertical_align is passed correctly
        vertical_align: e.vertical_align || 'middle',
      };

      const b = ds.bindings.find(binding => binding.fieldId === e.id);
      if (!b) return baseElem;

      if (b.type === 'database') {
        return {
          ...baseElem,
          binding: {
            source_id: b.sourceId ?? ds.activeSourceId ?? '',
            column: b.column ?? '',
            formula: b.formula
          }
        };
      }

      if (b.type === 'serial') {
        const cfgId = b.serialId || e.id;
        const cfg = ds.serialConfigs[cfgId] || ds.serialConfigs[e.id] || { start: 1, increment: 1, current_value: 1 };
        return {
          ...baseElem,
          serial_binding: {
            field_id: e.id,
            source_type: 'serial',
            start_value: cfg.current_value,
            increment: (cfg.increment || 1) * (cfg.step_type === 'decrease' ? -1 : 1),
            pad_to_length: cfg.pad_left ? cfg.digits : 0,
            prefix: cfg.prefix || '',
            suffix: cfg.suffix || ''
          }
        };
      }

      if (b.type === 'date' || b.type === 'time') {
        return {
          ...baseElem,
          date_binding: {
            field_id: e.id,
            source_type: b.type,
            format_str: b.formatStr || (b.type === 'date' ? '%Y-%m-%d' : '%H:%M:%S')
          }
        };
      }

      if (b.type === 'keyboard') {
        return {
          ...baseElem,
          keyboard_binding: {
            field_id: e.id,
            source_type: 'keyboard',
            prompt_label: b.promptLabel || 'Enter value',
            default_value: b.defaultValue || ''
          }
        };
      }

      return baseElem;
    }),
    data_sources: ds.sources.map(s => ({
      id: s.id,
      type: s.type,
      path: s.path,
      name: s.name,
    })),
    active_source_id: tab?.activeSourceId ?? undefined,
    current_row_index: tab?.currentPreviewRow ?? 0,
  };
}

export function newTemplate() {
  const tabId = getActiveId();
  if (!tabId) return;
  useTabsStore.setState(s => {
    const t = s.tabs.find(tt => tt.id === tabId);
    if (t) {
      t.elements = [];
      t.label = { ...DEFAULT_LABEL_CONFIG };
      t.sheetLayout = { ...DEFAULT_SHEET_LAYOUT };
      t.filePath = null;
      t.saveState = 'unsaved';
      t.selectedId = null;
      t.past = [];
      t.future = [];
    }
  });
}

export function setFilePath(path: string | null) {
  const tabId = getActiveId();
  if (!tabId) return;
  useTabsStore.setState((s: TabsState) => {
    const t = s.tabs.find(tt => tt.id === tabId);
    if (t) t.filePath = path;
  });
}

export function markClean() {
  const tabId = getActiveId();
  if (tabId) useTabsStore.getState().markSaved(tabId, getActiveTab()?.filePath ?? '');
}

export function undoCanvas() {
  const tabId = getActiveId();
  if (tabId) useTabsStore.getState().undo(tabId);
}

export function redoCanvas() {
  const tabId = getActiveId();
  if (tabId) useTabsStore.getState().redo(tabId);
}

// ── Legacy hook shim — gives components a flat object (backward compat) ──
// Components call: const { elements, selectedId, ... } = useCanvasStoreCompat()
export function useCanvasStoreCompat() {
  const activeId = useTabsStore(s => s.activeId);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeId));
  const { zoom, showGrid, snapToGrid, showRulers, setZoom, toggleGrid, toggleSnap } = useCanvasStore();

  return {
    // Per-tab
    elements: tab?.elements ?? [],
    label: tab?.label ?? { ...DEFAULT_LABEL_CONFIG },
    sheetLayout: tab?.sheetLayout ?? { ...DEFAULT_SHEET_LAYOUT },
    filePath: tab?.filePath ?? null,
    dirty: tab?.saveState === 'unsaved',
    selectedId: tab?.selectedId ?? null,
    undoStack: tab?.past ?? [],
    redoStack: tab?.future ?? [],
    // Global
    zoom,
    showGrid,
    snapToGrid,
    showRulers,
    // Actions
    setElements: (elements: LabelElement[]) => {
      if (activeId) useTabsStore.getState().updateElements(activeId, elements);
    },
    addElement,
    updateElement,
    updateElementRealtime,
    removeElement,
    select: selectElement,
    moveElement,
    reorderElement,
    duplicateElement,
    setLabel,
    setSheetLayout,
    loadTemplate,
    toDocument,
    newTemplate,
    setFilePath,
    markClean,
    undo: undoCanvas,
    redo: redoCanvas,
    setZoom,
    toggleGrid,
    toggleSnap,
    pushHistory: () => {
      if (activeId) useTabsStore.getState().pushHistory(activeId);
    },
    alignElements,
    distributeElements,
    centerOnLabel,
    bringToFront,
    sendToBack,
  };
}
