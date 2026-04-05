// src/renderer/store/tabs.ts — Multi-Tab Canvas Zustand Store
// ═══════════════════════════════════════════════════════════════════
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Tab, TabId, TabsState, TabMeta, OpenTabSource } from '../types/tabs';
import { DEFAULT_LABEL_CONFIG, DEFAULT_SHEET_LAYOUT, LabelConfig, LabelElement } from '../types/template';
import { useSettingsStore } from './settings';
import { addRecentFile } from '../lib/recentFiles';
import { extractBindingsFromElements } from '../lib/restoreBindings';

const MAX_TABS = 20;

function makeTab(overrides: Partial<Tab> = {}): Tab {
  const s = useSettingsStore.getState();
  return {
    id: `tab_${nanoid(6)}`,
    name: 'Untitled',
    filePath: null,
    saveState: 'unsaved',
    lastSaved: null,
    createdAt: Date.now(),
    elements: [],
    label: {
      ...DEFAULT_LABEL_CONFIG,
      width_mm: s.defaultLabelWidth || DEFAULT_LABEL_CONFIG.width_mm,
      height_mm: s.defaultLabelHeight || DEFAULT_LABEL_CONFIG.height_mm,
      shape: s.defaultLabelShape || DEFAULT_LABEL_CONFIG.shape,
      background_color: s.canvasBackground || DEFAULT_LABEL_CONFIG.background_color,
    },
    sheetLayout: {
      ...DEFAULT_SHEET_LAYOUT,
      cols: s.sheetCols || DEFAULT_SHEET_LAYOUT.cols,
      rows: s.sheetRows || DEFAULT_SHEET_LAYOUT.rows,
      h_gap_mm: s.colGapMm ?? DEFAULT_SHEET_LAYOUT.h_gap_mm,
      v_gap_mm: s.rowGapMm ?? DEFAULT_SHEET_LAYOUT.v_gap_mm,
      margin_top_mm: s.sheetTopMarginMm ?? DEFAULT_SHEET_LAYOUT.margin_top_mm,
      margin_left_mm: s.sheetLeftMarginMm ?? DEFAULT_SHEET_LAYOUT.margin_left_mm,
    },
    scrollX: 0,
    scrollY: 0,
    selectedId: null,
    activeSourceId: null,
    currentPreviewRow: 0,
    past: [],
    future: [],
    thumbnail: null,
    isRenaming: false,
    ...overrides,
  };
}

export const useTabsStore = create<TabsState>()(
  persist(
    immer((set, get) => ({
      tabs: [],
      activeId: null,

      openTab: async (source: OpenTabSource) => {
        const state = get();
        if (state.tabs.length >= MAX_TABS) {
          const oldest = state.tabs.find(t => t.saveState === 'saved');
          if (oldest) await state.closeTab(oldest.id);
        }

        let newTab: Tab;
        if (source.type === 'new') {
          newTab = makeTab({ name: 'Untitled' });
        } else if (source.type === 'file') {
          const existing = state.tabs.find(t => t.filePath === source.path);
          if (existing) {
            set(s => { s.activeId = existing.id; });
            return existing.id;
          }
          try {
            const doc = await (window as any).electron?.ipcRenderer?.invoke('template:load', { filePath: source.path });
            if (doc && (doc.elements || doc.label)) {
              const fileName = source.path.split(/[/\\]/).pop()?.replace(/\.lft$/, '') ?? 'Untitled';
              newTab = makeTab({
                name: fileName,
                filePath: source.path,
                saveState: 'saved',
                elements: doc.elements ?? [],
                label: doc.label ?? { ...DEFAULT_LABEL_CONFIG },
                sheetLayout: doc.sheet_layout ?? { ...DEFAULT_SHEET_LAYOUT },
                activeSourceId: doc.active_source_id ?? null,
                currentPreviewRow: doc.current_row_index ?? 0,
              });

              // ── Restore bindings from saved element objects into the DataStore ──
              // The .lft file embeds binding info (binding, serial_binding,
              // date_binding, time_binding, keyboard_binding) on each element.
              // We need to reconstruct DataStore.bindings from these so that
              // toDocument() can find them again at print time.
              try {
                const rawElements = doc.elements ?? [];
                const { bindings, serialConfigs } = extractBindingsFromElements(rawElements);
                if (bindings.length > 0 || Object.keys(serialConfigs).length > 0) {
                  // Lazy-import to avoid circular dependency
                  const { useDataStore } = await import('./data');
                  const ds = useDataStore.getState();
                  
                  // Merge restored bindings (don't overwrite existing ones from other documents)
                  for (const b of bindings) {
                    const existing = ds.bindings.find(x => x.fieldId === b.fieldId);
                    if (!existing) {
                      ds.addBinding(b);
                    }
                  }
                  
                  // Merge serial configs
                  for (const [id, cfg] of Object.entries(serialConfigs)) {
                    if (!ds.serialConfigs[id]) {
                      ds.setSerialConfig(id, cfg);
                    }
                  }
                  
                  // Restore data sources references
                  if (doc.data_sources && doc.data_sources.length > 0) {
                    for (const src of doc.data_sources) {
                      const exists = ds.sources.find(s => s.id === src.id);
                      if (!exists && src.path) {
                        // Add a placeholder source (user will need to refresh/reload)
                        ds.addSource({
                          id: src.id,
                          type: src.type || 'csv',
                          path: src.path,
                          name: src.name || src.path.split(/[/\\]/).pop() || 'Data',
                          columns: [],
                          rowCount: 0,
                          rows: [],
                        }, { isReload: true });
                      }
                    }
                    
                    // Set active source if specified
                    if (doc.active_source_id) {
                      ds.setActiveSource(doc.active_source_id);
                    }
                  }
                  
                  console.log(`[Tabs] Restored ${bindings.length} bindings and ${Object.keys(serialConfigs).length} serial configs from saved file`);
                }
              } catch (bindErr) {
                console.error('[Tabs] Failed to restore bindings from file:', bindErr);
              }

              addRecentFile({
                name: fileName,
                path: source.path,
                modified: new Date().toISOString(),
                width: doc.label?.width_mm,
                height: doc.label?.height_mm,
                elementCount: doc.elements?.length
              }).catch(console.error);
            } else {
              newTab = makeTab({ name: 'Untitled' });
            }
          } catch {
            newTab = makeTab({ name: 'Untitled' });
          }
        } else if (source.type === 'preset') {
          newTab = makeTab({
            name: source.preset.name,
            elements: source.preset.elements ?? [],
            label: { ...DEFAULT_LABEL_CONFIG, width_mm: source.preset.width, height_mm: source.preset.height, shape: source.preset.shape },
            saveState: 'unsaved',
          });
        } else if (source.type === 'duplicate') {
          const src = state.tabs.find(t => t.id === source.sourceTabId);
          if (!src) throw new Error('Source tab not found');
          newTab = makeTab({
            name: `${src.name} (copy)`,
            elements: JSON.parse(JSON.stringify(src.elements)),
            label: { ...src.label },
            sheetLayout: { ...src.sheetLayout },
            saveState: 'unsaved',
          });
        } else {
          newTab = makeTab({ name: 'Untitled' });
        }

        set(s => {
          s.tabs.push(newTab);
          s.activeId = newTab.id;
        });
        return newTab.id;
      },

      closeTab: async (id: TabId) => {
        const tab = get().tabs.find(t => t.id === id);
        if (!tab) return;
        if (tab.saveState === 'unsaved' && tab.elements.length > 0) {
          const confirmed = window.confirm(`"${tab.name}" has unsaved changes.\n\nYour changes will be lost if you close this tab without saving. Close anyway?`);
          if (!confirmed) return;
        }
        set(s => {
          const idx = s.tabs.findIndex(t => t.id === id);
          if (idx === -1) return;
          s.tabs.splice(idx, 1);
          if (s.activeId === id) {
            s.activeId = s.tabs[Math.min(idx, s.tabs.length - 1)]?.id ?? null;
          }
        });
      },

      switchTab: (id: TabId) => {
        set(s => { s.activeId = id; });
      },

      duplicateTab: (id: TabId) => {
        const src = get().tabs.find(t => t.id === id);
        if (!src) return id;
        const newId = `tab_${nanoid(6)}`;
        set(s => {
          const idx = s.tabs.findIndex(t => t.id === id);
          const dup: Tab = {
            ...JSON.parse(JSON.stringify(src)),
            id: newId,
            name: `${src.name} (copy)`,
            saveState: 'unsaved',
            filePath: null,
            past: [],
            future: [],
            createdAt: Date.now(),
          };
          s.tabs.splice(idx + 1, 0, dup);
          s.activeId = newId;
        });
        return newId;
      },

      renameTab: (id: TabId, name: string) => {
        set(s => {
          const tab = s.tabs.find(t => t.id === id);
          if (!tab) return;
          tab.name = name.trim() || tab.name;
          tab.isRenaming = false;
          tab.saveState = 'unsaved';
        });
      },

      startRenaming: (id: TabId) => {
        set(s => {
          const tab = s.tabs.find(t => t.id === id);
          if (tab) tab.isRenaming = true;
        });
      },

      reorderTab: (fromIdx: number, toIdx: number) => {
        set(s => {
          const [tab] = s.tabs.splice(fromIdx, 1);
          s.tabs.splice(toIdx, 0, tab);
        });
      },

      markDirty: (id: TabId) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) tab.saveState = 'unsaved';
      }),

      markSaved: (id: TabId, path: string) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (!tab) return;
        tab.saveState = 'saved';
        tab.filePath = path;
        tab.lastSaved = Date.now();
        const nameFromPath = path.split(/[/\\]/).pop()?.replace(/\.lft$/, '') ?? tab.name;
        tab.name = nameFromPath;
        addRecentFile({
          name: nameFromPath,
          path: path,
          modified: new Date().toISOString(),
          width: tab.label.width_mm,
          height: tab.label.height_mm,
          elementCount: tab.elements.length
        }).catch(console.error);
      }),

      setThumbnail: (id: TabId, thumb: string) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) tab.thumbnail = thumb;
      }),

      closeOthers: async (id: TabId) => {
        const others = get().tabs.filter(t => t.id !== id).map(t => t.id);
        for (const oid of others) await get().closeTab(oid);
      },

      closeAll: async () => {
        const ids = get().tabs.map(t => t.id);
        for (const id of ids) await get().closeTab(id);
      },

      closeSaved: () => set(s => {
        s.tabs = s.tabs.filter(t => t.saveState !== 'saved');
        if (!s.tabs.find(t => t.id === s.activeId))
          s.activeId = s.tabs[s.tabs.length - 1]?.id ?? null;
      }),

      getActive: () => {
        const { tabs, activeId } = get();
        return tabs.find(t => t.id === activeId) ?? null;
      },

      getMeta: () => get().tabs.map(t => ({
        id: t.id,
        name: t.name,
        filePath: t.filePath,
        saveState: t.saveState,
        thumbnail: t.thumbnail,
        isRenaming: t.isRenaming,
        configW: t.label.width_mm,
        configH: t.label.height_mm,
      })),

      setScroll: (id: TabId, x: number, y: number) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) { tab.scrollX = x; tab.scrollY = y; }
      }),

      setSelectedEl: (id: TabId, elId: string | null) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) tab.selectedId = elId;
      }),

      updateElements: (id: TabId, elements: LabelElement[]) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) { tab.elements = elements; tab.saveState = 'unsaved'; }
      }),

      updateLabel: (id: TabId, patch: Partial<LabelConfig>) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) { Object.assign(tab.label, patch); tab.saveState = 'unsaved'; }
      }),

      updateActiveSource: (id: TabId, sourceId: string | null) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) { tab.activeSourceId = sourceId; tab.saveState = 'unsaved'; }
      }),

      updatePreviewRow: (id: TabId, idx: number) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) { tab.currentPreviewRow = idx; tab.saveState = 'unsaved'; }
      }),

      updateElementsRealtime: (id: TabId, elId: string, updates: Partial<LabelElement>) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (tab) {
          const el = tab.elements.find(e => e.id === elId);
          if (el) { Object.assign(el, updates); tab.saveState = 'unsaved'; }
        }
      }),

      pushHistory: (id: TabId) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (!tab) return;
        tab.past.push({
          elements: JSON.parse(JSON.stringify(tab.elements)),
          label: { ...tab.label },
        });
        const maxUndo = useSettingsStore.getState().undoStackDepth || 50;
        if (tab.past.length > maxUndo) tab.past.shift();
        tab.future = [];
      }),

      undo: (id: TabId) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (!tab || !tab.past.length) return;
        const prev = tab.past.pop()!;
        tab.future.push({ elements: JSON.parse(JSON.stringify(tab.elements)), label: { ...tab.label } });
        tab.elements = prev.elements;
        tab.label = prev.label;
        tab.saveState = 'unsaved';
      }),

      redo: (id: TabId) => set(s => {
        const tab = s.tabs.find(t => t.id === id);
        if (!tab || !tab.future.length) return;
        const next = tab.future.pop()!;
        tab.past.push({ elements: JSON.parse(JSON.stringify(tab.elements)), label: { ...tab.label } });
        tab.elements = next.elements;
        tab.label = next.label;
        tab.saveState = 'unsaved';
      }),
    })),
    {
      name: 'omg-tabs-v1',
      partialize: (state) => ({
        tabs: state.tabs.map(t => ({
          ...t,
          past: [],
          future: [],
          thumbnail: null,
        })),
        activeId: state.activeId,
      }),
    }
  )
);
