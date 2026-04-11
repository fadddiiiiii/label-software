// src/renderer/App.tsx — Main Application Shell (Multi-Tab + Full Feature Set)
import React, { useEffect, useState, useCallback } from 'react';
import { useCanvasStore, useCanvasStoreCompat } from './store/canvas';
import { useTabsStore } from './store/tabs';
import { usePrintStore } from './store/print';
import { invokeIPC } from './hooks/useIPC';
import { useSettingsStore } from './store/settings';
import { useTabKeyboardShortcuts } from './hooks/useTabKeyboardShortcuts';
import { TabBar } from './components/tabs/TabBar';
import { useDataStore } from './store/data';

// Screens
import AuthScreen from './components/auth/AuthScreen';
import SplashScreen from './components/splash/SplashScreen';
import HomePage from './components/home/HomePage';

// Designer components
import Toolbox from './components/ui/Toolbox';
import PropertiesPanel from './components/ui/PropertiesPanel';
import LayersPanel from './components/ui/LayersPanel';
import DataSourcePanel from './components/ui/DataSourcePanel';
import BindingPanel from './components/ui/BindingPanel';
import TemplateLibrary from './components/template-lib/TemplateLibrary';
import LabelCanvas from './components/designer/LabelCanvas';
import BatchConsole from './components/batch/BatchConsole';
import KeyboardInputModal from './components/batch/KeyboardInputModal';
import PrintSettingsDialog from './components/batch/PrintSettingsDialog';
import PrintPreview from './components/batch/PrintPreview';
import NewLabelDialog from './components/designer/NewLabelDialog';
import SettingsPanel from './components/settings/SettingsPanel';
import Toolbar from './components/ui/Toolbar';
import SerialNumberManager from './components/ui/SerialNumberManager';
import { formatUnit } from './lib/units';
import type { UnitType } from './lib/units';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'red', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppView = 'checking' | 'auth' | 'splash' | 'home' | 'designer';

export default function App() {
  const [view, setView] = useState<AppView>('checking');
  const theme = useSettingsStore(s => s.theme);
  const startupBehaviour = useSettingsStore(s => s.startupBehaviour);
  const isDataHydrated = useDataStore(s => s.isHydrated);
  const reloadSources = useDataStore(s => s.reloadSources);
  const activeTabId = useTabsStore(s => s.activeId);
  const tabs = useTabsStore(s => s.tabs);

  // ── First-time activation gate ──
  useEffect(() => {
    (async () => {
      try {
        const result = await invokeIPC('app:check-activation');
        if (result?.activated) {
          setView('splash');
        } else {
          setView('auth');
        }
      } catch {
        // If IPC fails (e.g. during dev), skip auth
        setView('splash');
      }
    })();
  }, []);

  useEffect(() => {
    if (isDataHydrated) {
      console.log('App: Data hydrated, reloading sources...');
      reloadSources();
    }
  }, [isDataHydrated, reloadSources]);

  // Sync Data Store selection when tab changes
  useEffect(() => {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      const ds = useDataStore.getState();
      // Only update if actually different to avoid cycles
      if (ds.activeSourceId !== tab.activeSourceId) {
        ds.setActiveSource(tab.activeSourceId);
      }
      if (ds.currentPreviewRow !== tab.currentPreviewRow) {
        ds.setPreviewRow(tab.currentPreviewRow);
      }
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    let t = theme;
    if (theme === 'system') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  }, [theme]);

  const handleSplashFinish = useCallback(() => {
    const { tabs, openTab } = useTabsStore.getState();
    if (startupBehaviour === 'blank') {
      if (tabs.length === 0) openTab({ type: 'new' });
      setView('designer');
    } else if (startupBehaviour === 'last' && tabs.length > 0) {
      setView('designer');
    } else {
      setView('home');
    }
  }, [startupBehaviour]);

  const handleOpenDesigner = useCallback(() => {
    const { tabs, openTab } = useTabsStore.getState();
    if (tabs.length === 0) openTab({ type: 'new' });
    setView('designer');
  }, []);
  const handleGoHome = useCallback(() => setView('home'), []);

  if (view === 'checking') return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Checking activation…</div>
    </div>
  );
  if (view === 'auth') return <AuthScreen onActivated={() => setView('splash')} />;
  if (view === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;
  if (view === 'home') return <HomePage onOpenDesigner={handleOpenDesigner} />;

  return (
    <ErrorBoundary>
      <Designer onGoHome={handleGoHome} />
    </ErrorBoundary>
  );
}

import { AboutDialog } from './components/dialogs/AboutDialog';
import { DocumentationDialog } from './components/dialogs/DocumentationDialog';
import { FeedbackDialog } from './components/dialogs/FeedbackDialog';

function Designer({ onGoHome }: { onGoHome: () => void }) {
  const canvas = useCanvasStoreCompat();
  const { zoom, showGrid, snapToGrid, setZoom, toggleGrid, toggleSnap } = useCanvasStore();
  const { showBatchConsole } = usePrintStore();
  const settings = useSettingsStore();
  const [engineStatus, setEngineStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [version, setVersion] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showNewLabel, setShowNewLabel] = useState(false);
  
  // Menu Dialogs State
  const [showAbout, setShowAbout] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const activeId = useTabsStore(s => s.activeId);
  const tabCount = useTabsStore(s => s.tabs.length);
  const activeLabel = useTabsStore(s => {
    const t = s.tabs.find(tt => tt.id === s.activeId);
    return t ? t.label : null;
  });
  const activeElements = useTabsStore(s => {
    const t = s.tabs.find(tt => tt.id === s.activeId);
    return t ? t.elements : null;
  });

  useTabKeyboardShortcuts();

  useEffect(() => {
    if (tabCount === 0) onGoHome();
  }, [tabCount, onGoHome]);

  useEffect(() => {
    const checkEngine = async () => {
      try {
        const v = await invokeIPC('app:version');
        setVersion(v);
        setEngineStatus('online');
      } catch { setEngineStatus('offline'); }
    };
    checkEngine();
  }, []);

  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener('app:open-settings', handler);
    return () => window.removeEventListener('app:open-settings', handler);
  }, []);

  useEffect(() => {
    const handler = () => setShowNewLabel(true);
    window.addEventListener('app:new-label-dialog', handler);
    return () => window.removeEventListener('app:new-label-dialog', handler);
  }, []);

  useEffect(() => {
    if (settings.snapToGrid !== snapToGrid) toggleSnap();
  }, [settings.snapToGrid]);

  useEffect(() => {
    // Top Menu IPC Connections
    window.electron.ipcRenderer.on('menu:show-about', () => setShowAbout(true));
    window.electron.ipcRenderer.on('menu:show-docs', () => setShowDocs(true));
    window.electron.ipcRenderer.on('menu:show-feedback', () => setShowFeedback(true));
    
    // File Menu Connections
    window.electron.ipcRenderer.on('menu:file-new', () => setShowNewLabel(true));
    window.electron.ipcRenderer.on('menu:file-open', async () => {
      const path = await window.electron.ipcRenderer.invoke('template:open-dialog');
      if (path && typeof path === 'string') {
        const json = await window.electron.ipcRenderer.invoke('template:load', { filePath: path });
        // @ts-ignore - The 'file' type in openTab might legally accept it at runtime or it's fetched from 'path'
        useTabsStore.getState().openTab({ type: 'file', path: path, templateJson: json }); 
      }
    });
    window.electron.ipcRenderer.on('menu:file-save', async () => {
      const tab = useTabsStore.getState().getActive();
      if (!tab) return;
      let targetPath = tab.filePath || '';
      if (!targetPath) {
        const selected = await window.electron.ipcRenderer.invoke('template:save-dialog');
        if (!selected) return;
        targetPath = selected;
      }
      const doc = useCanvasStoreCompat().toDocument();
      await window.electron.ipcRenderer.invoke('template:save', { filePath: targetPath, json: doc });
      useTabsStore.getState().markSaved(tab.id, targetPath);
    });

    return () => {
      ['menu:show-about', 'menu:show-docs', 'menu:show-feedback', 'menu:file-new', 'menu:file-open', 'menu:file-save'].forEach(channel => {
          // @ts-ignore
          window.electron.ipcRenderer.removeAllListeners(channel);
      });
    };
  }, []);

  useEffect(() => {
    if (settings.showRulers !== showGrid) toggleGrid();
  }, [settings.showRulers]);

  useEffect(() => {
    setZoom(settings.defaultZoom);
  }, [settings.defaultZoom]);

  // Apply workspace background — only override if user set a custom value
  useEffect(() => {
    const el = document.querySelector('.app-canvas-area') as HTMLElement;
    if (!el) return;
    const isDefault = !settings.workspaceBackground || settings.workspaceBackground === '#07090E';
    if (isDefault) {
      el.style.background = '';
    } else {
      el.style.background = settings.workspaceBackground;
    }
  }, [settings.workspaceBackground]);

  // Auto-save timer
  useEffect(() => {
    if (!settings.autoSaveMinutes || settings.autoSaveMinutes <= 0) return;
    const interval = setInterval(async () => {
      const tab = useTabsStore.getState().getActive();
      if (tab && tab.filePath && tab.saveState === 'unsaved') {
        try {
          const doc = canvas.toDocument();
          await invokeIPC('template:save', { filePath: tab.filePath, json: doc });
          useTabsStore.getState().markSaved(tab.id, tab.filePath);
        } catch { /* silent */ }
      }
    }, settings.autoSaveMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings.autoSaveMinutes]);

  // Confirm before close (window)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!settings.confirmBeforeClose) return;
      const dirty = useTabsStore.getState().tabs.some(t => t.saveState === 'unsaved' && t.elements.length > 0);
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [settings.confirmBeforeClose]);

  const label = activeLabel;
  const elements = activeElements ?? [];

  const handleNewLabelApply = useCallback(async (newLabel: any, newSheet: any) => {
    await useTabsStore.getState().openTab({
      type: 'preset',
      preset: {
        name: `${newLabel.width_mm}×${newLabel.height_mm}mm`,
        width: newLabel.width_mm,
        height: newLabel.height_mm,
        shape: newLabel.shape,
        elements: [],
      },
    });
    // After the new tab is created and active, apply the full config
    setTimeout(() => {
      canvas.setLabel(newLabel);
      canvas.setSheetLayout(newSheet);
    }, 50);
  }, [canvas]);

  // ... existing code in Designer remains the same ...
  return (
    <div className="app-layout">
      {/* Top Nav */}
      <header className="app-titlebar">
        <div className="app-titlebar__brand">OMG</div>
        <div className="app-titlebar__actions">
          <Toolbar onGoHome={onGoHome} />
        </div>
      </header>

      {/* Tab Bar */}
      <TabBar />

      {/* Left Panel */}
      <aside className="app-sidebar">
        <TemplateLibrary />
        <Toolbox />
        <LayersPanel />
      </aside>

      {/* Center: Canvas */}
      <main className="app-canvas-area">
        <LabelCanvas />
      </main>

      {/* Right Panel */}
      <aside className="app-properties">
        <PropertiesPanel />
        <DataSourcePanel />
      </aside>

      {/* Status Bar */}
      <StatusBar label={label} elements={elements} zoom={zoom} version={version} />

      {/* Overlays */}
      <BatchConsole />
      <KeyboardInputModal />
      <PrintSettingsDialog />
      <PrintPreview />
      <NewLabelDialog
        open={showNewLabel}
        onClose={() => setShowNewLabel(false)}
        onApply={handleNewLabelApply}
        initialLabel={label || undefined}
        initialSheet={canvas.sheetLayout}
      />
      <SerialNumberManager />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      
      {/* Menu Dialogs */}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showDocs && <DocumentationDialog onClose={() => setShowDocs(false)} />}
      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
    </div>
  );
}

function StatusBar({ label, elements, zoom, version }: {
  label: any; elements: any[]; zoom: number; version: string;
}) {
  const units = useSettingsStore(s => s.units) as UnitType;
  const w = label?.width_mm ?? 0;
  const h = label?.height_mm ?? 0;
  return (
    <footer className="app-statusbar">
      <span>{formatUnit(w, units)} × {formatUnit(h, units)} @ {label?.dpi ?? '--'} DPI</span>
      <span>{elements.length} element{elements.length !== 1 ? 's' : ''}</span>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      {version && <span>v{version}</span>}
    </footer>
  );
}
