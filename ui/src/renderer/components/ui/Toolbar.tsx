import React from 'react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { useTabsStore } from '../../store/tabs';
import { useDataStore } from '../../store/data';
import { invokeIPC, saveTemplate, loadTemplate } from '../../hooks/useIPC';
import { addRecentFile } from '../../lib/recentFiles';
import {
  FilePlus, FolderOpen, Save, SaveAll, Download,
  Undo2, Redo2, ZoomOut, ZoomIn,
  Grid3X3, ArrowRightToLine, Database, Hash,
  ChevronDown, FileImage, FileText, FileCode,
  Home, Printer, ChevronLeft, ChevronRight, Eye,
  LayoutTemplate
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { usePrintStore } from '../../store/print';
import { useSettingsStore } from '../../store/settings';

const ZOOM_PRESETS = [
  { label: '25%', value: 0.25 }, { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 }, { label: '100%', value: 1 },
  { label: '125%', value: 1.25 }, { label: '150%', value: 1.5 },
  { label: '200%', value: 2 }, { label: '300%', value: 3 },
];

export default function Toolbar({ onGoHome }: { onGoHome?: () => void }) {
  const { undo, redo, undoStack, redoStack, toDocument, loadTemplate: loadDoc,
    setFilePath, markClean, filePath, newTemplate, zoom, setZoom,
    toggleGrid, toggleSnap, showGrid, snapToGrid, dirty, label, elements } = useCanvasStoreCompat();
  const { setDataSourceModalOpen, setSerialNumberModalOpen, activeSourceId, sources, currentPreviewRow, setPreviewRow, updateSourcePreviewRow } = useDataStore();
  const activeSource = sources.find(s => s.id === activeSourceId);

  useEffect(() => {
    if (activeSource) {
      invokeIPC('data:preview', { path: activeSource.path, type: activeSource.type, row_index: currentPreviewRow })
        .then((row: Record<string, string>) => {
          updateSourcePreviewRow(activeSource.id, row);
        })
        .catch(err => console.error("Failed to fetch preview row:", err));
    }
  }, [activeSource?.id, activeSource?.path, activeSource?.type, currentPreviewRow, updateSourcePreviewRow]);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [editingZoom, setEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState('');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false);
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) { setShowZoomMenu(false); setEditingZoom(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    let path = filePath;
    if (!path) {
      path = await invokeIPC('template:save-dialog');
      if (!path) return;
      setFilePath(path);
    }
    await saveTemplate(path, toDocument());
    markClean();
    await addRecentFile({ name: path.split('/').pop() || path, path, modified: new Date().toISOString(), width: label?.width_mm, height: label?.height_mm, elementCount: elements.length });
  };

  const handleOpen = async () => {
    const path = await invokeIPC('template:open-dialog');
    if (!path) return;
    const tabId = await useTabsStore.getState().openTab({ type: 'file', path });
    const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
    if (tab && tab.filePath) {
      await addRecentFile({ name: tab.name, path: tab.filePath, modified: new Date().toISOString(), width: tab.label.width_mm, height: tab.label.height_mm, elementCount: tab.elements.length });
    }
  };

  const handleSaveAs = async () => {
    const path = await invokeIPC('template:save-dialog');
    if (!path) return;
    await saveTemplate(path, toDocument());
    setFilePath(path);
    markClean();
    await addRecentFile({ name: path.split('/').pop() || path, path, modified: new Date().toISOString(), width: label?.width_mm, height: label?.height_mm, elementCount: elements.length });
  };

  const handleExport = (format: 'png' | 'pdf' | 'svg') => {
    window.dispatchEvent(new CustomEvent(`canvas:export-${format}`));
    setShowExportMenu(false);
  };

  const handleGoHomeClick = () => {
    const { tabs } = useTabsStore.getState();
    const dirtyTabs = tabs.filter(t => t.saveState === 'unsaved' && t.elements.length > 0);
    if (dirtyTabs.length > 0) {
      const names = dirtyTabs.map(t => `• ${t.name}`).join('\n');
      const confirmed = window.confirm(`You have unsaved changes in ${dirtyTabs.length === 1 ? 'this tab' : `${dirtyTabs.length} tabs`}:\n\n${names}\n\nYour changes will be lost. Go home anyway?`);
      if (!confirmed) return;
    }
    if (onGoHome) onGoHome();
  };

  const handleZoomInputSubmit = () => {
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val >= 10 && val <= 600) {
      setZoom(val / 100);
    }
    setEditingZoom(false);
    setShowZoomMenu(false);
  };

  const handleFitLabel = () => {
    window.dispatchEvent(new CustomEvent('canvas:fit-label'));
    setShowZoomMenu(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) handleSaveAs(); else handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleSaveAs]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button className="btn btn--ghost btn--icon" onClick={handleGoHomeClick} data-tooltip-bottom="Home">
        <Home size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      <button className="btn btn--ghost btn--icon" onClick={() => window.dispatchEvent(new Event('app:new-label-dialog'))} data-tooltip-bottom="New Label">
        <LayoutTemplate size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={() => useTabsStore.getState().openTab({ type: 'new' })} data-tooltip-bottom="New File">
        <FilePlus size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={handleOpen} data-tooltip-bottom="Open File">
        <FolderOpen size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={handleSave} data-tooltip-bottom="Save">
        <Save size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={handleSaveAs} data-tooltip-bottom="Save As">
        <SaveAll size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>

      {/* Data Preview Navigator */}
      {activeSource && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 6, padding: 2 }}>
            <button className="btn btn--ghost btn--icon"
              onClick={() => setPreviewRow(Math.max(0, currentPreviewRow - 1))}
              disabled={currentPreviewRow === 0}
              style={{ width: 24, height: 24, padding: 0 }} data-tooltip-bottom="Previous Row">
              <ChevronLeft size={14} />
            </button>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '0 6px', color: 'var(--text-secondary)', userSelect: 'none' }} data-tooltip-bottom="Preview Row">
              <Eye size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              {currentPreviewRow + 1}
            </div>
            <button className="btn btn--ghost btn--icon"
              onClick={() => setPreviewRow(Math.min(activeSource.rowCount - 1, currentPreviewRow + 1))}
              disabled={currentPreviewRow >= activeSource.rowCount - 1}
              style={{ width: 24, height: 24, padding: 0 }} data-tooltip-bottom="Next Row">
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      {/* Print */}
      <button className="btn btn--ghost btn--icon"
        onClick={() => usePrintStore.getState().setShowPrintPreview(true)} data-tooltip-bottom="Print">
        <Printer size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>

      {/* Export Dropdown */}
      <div style={{ position: 'relative' }} ref={exportMenuRef}>
        <button className="btn btn--ghost" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', height: 32 }}
          onClick={() => setShowExportMenu(!showExportMenu)} data-tooltip-bottom="Export As...">
          <Download size={16} strokeWidth={2} color="var(--text-primary)" />
          <ChevronDown size={12} color="var(--text-muted)" />
        </button>
        {showExportMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160,
            padding: 4, display: 'flex', flexDirection: 'column', gap: 2
          }}>
            <button className="export-menu-item" onClick={() => handleExport('png')}>
              <FileImage size={14} /> <span>PNG Image (.png)</span>
            </button>
            <button className="export-menu-item" onClick={() => handleExport('pdf')}>
              <FileText size={14} /> <span>PDF Document (.pdf)</span>
            </button>
            <button className="export-menu-item" onClick={() => handleExport('svg')}>
              <FileCode size={14} /> <span>Vector Graphic (.svg)</span>
            </button>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      <button className="btn btn--ghost btn--icon" onClick={undo} disabled={undoStack.length === 0} data-tooltip-bottom="Undo">
        <Undo2 size={16} strokeWidth={2} color={undoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)'} />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={redo} disabled={redoStack.length === 0} data-tooltip-bottom="Redo">
        <Redo2 size={16} strokeWidth={2} color={redoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)'} />
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      {/* Zoom with dropdown */}
      <button className="btn btn--ghost btn--icon" onClick={() => setZoom(zoom - 0.25)} data-tooltip-bottom="Zoom Out">
        <ZoomOut size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>

      <div style={{ position: 'relative' }} ref={zoomMenuRef}>
        <button className="btn btn--ghost" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 54, padding: '0 8px' }}
          onClick={() => { setShowZoomMenu(!showZoomMenu); setZoomInput(String(Math.round(zoom * 100))); }}>
          {Math.round(zoom * 100)}%
        </button>
        {showZoomMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 4,
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 130,
            padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
          }}>
            {/* Custom input */}
            <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 2 }}>
              <input type="number" className="input input--compact" value={zoomInput}
                onChange={e => setZoomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleZoomInputSubmit(); }}
                onBlur={handleZoomInputSubmit}
                autoFocus style={{ width: '100%', textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                min={10} max={600} />
            </div>
            {ZOOM_PRESETS.map(p => (
              <button key={p.value} className="export-menu-item"
                style={{ fontSize: 12, fontWeight: zoom === p.value ? 700 : 400, color: zoom === p.value ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                onClick={() => { setZoom(p.value); setShowZoomMenu(false); }}>
                {p.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 2, paddingTop: 2 }}>
              <button className="export-menu-item" style={{ fontSize: 12 }} onClick={handleFitLabel}>Fit Label</button>
            </div>
          </div>
        )}
      </div>

      <button className="btn btn--ghost btn--icon" onClick={() => setZoom(zoom + 0.25)} data-tooltip-bottom="Zoom In">
        <ZoomIn size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      <button className="btn btn--ghost btn--icon" style={{ background: showGrid ? 'var(--accent-primary)' : 'transparent' }} onClick={toggleGrid} data-tooltip-bottom="Toggle Grid">
        <Grid3X3 size={16} strokeWidth={2} color={showGrid ? 'var(--text-inverse)' : 'var(--text-primary)'} />
      </button>
      <button className="btn btn--ghost btn--icon" style={{ background: snapToGrid ? 'var(--accent-primary)' : 'transparent' }} onClick={toggleSnap} data-tooltip-bottom="Toggle Snap">
        <ArrowRightToLine size={16} strokeWidth={2} color={snapToGrid ? 'var(--text-inverse)' : 'var(--text-primary)'} />
      </button>

      <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 8px' }} />

      <button className="btn btn--ghost btn--icon" onClick={() => setDataSourceModalOpen(true)} data-tooltip-bottom="Data Sources">
        <Database size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
      <button className="btn btn--ghost btn--icon" onClick={() => setSerialNumberModalOpen(true)} data-tooltip-bottom="Serial Numbers">
        <Hash size={16} strokeWidth={2} color="var(--text-primary)" />
      </button>
    </div>
  );
}
