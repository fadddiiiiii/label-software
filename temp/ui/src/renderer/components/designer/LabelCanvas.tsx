// src/renderer/components/designer/LabelCanvas.tsx — Konva Canvas Designer (Full Feature Set)
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Line, Ellipse, Group, Transformer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { useCanvasStoreCompat, useCanvasStore, addElement as addCanvasElement, updateElement, updateElementRealtime, moveElement, removeElement, selectElement, alignElements, distributeElements } from '../../store/canvas';
import { useDataStore } from '../../store/data';
import { LabelElement as LabelElementType } from '../../types/template';
import CanvasContextMenu from './CanvasContextMenu';
import { renderBarcodeClientSide } from '../../hooks/useBarcodeRenderer';
import { useSettingsStore } from '../../store/settings';
import { usePrintStore } from '../../store/print';
import { useTabsStore } from '../../store/tabs';
import { mmToUnit, UNITS } from '../../lib/units';
import type { UnitType } from '../../lib/units';
import { jsPDF } from 'jspdf';

import { ElementShape, MM_TO_PX, mmToPx, pxToMm } from './ElementShape';

function snapToGrid(val: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return val;
  return Math.round(val / gridSize) * gridSize;
}




/** Ruler — shows clean numbers across the entire expanded workspace */
function Ruler({ direction, labelMm, padPx, zoom, units, totalPx }: {
  direction: 'h' | 'v'; labelMm: number; padPx: number; zoom: number; units: string; totalPx: number;
}) {
  const size = 22;
  const isH = direction === 'h';

  // Pick tick interval based on zoom so labels never overlap
  const pxPerMm = MM_TO_PX * zoom;
  let majorMm: number;
  if (units === 'in') {
    majorMm = pxPerMm * 25.4 > 60 ? 25.4 : pxPerMm * 25.4 > 30 ? 25.4 * 2 : 25.4 * 4;
  } else {
    if (pxPerMm * 5 > 40) majorMm = 5;
    else if (pxPerMm * 10 > 40) majorMm = 10;
    else if (pxPerMm * 20 > 40) majorMm = 20;
    else if (pxPerMm * 50 > 40) majorMm = 50;
    else majorMm = 100;
  }
  const minorMm = majorMm / 2;

  // Format label value
  const formatLabel = (mm: number): string => {
    if (units === 'cm') return (mm / 10).toFixed(mm % 10 === 0 ? 0 : 1);
    if (units === 'in') return (mm / 25.4).toFixed(1);
    return String(Math.round(mm));
  };

  // Generate ticks to cover the entire container (but only labels from 0+)
  const ticks: React.ReactNode[] = [];
  const startMm = 0; // User said "no need of - values"
  const endMm = (totalPx - padPx) / pxPerMm; // Cover the full asymmetrical width

  for (let mm = startMm; mm <= endMm; mm += minorMm) {
    const roundedMm = Math.round(mm * 100) / 100;
    // Check if it's a major tick
    const isMajor = Math.abs(roundedMm % majorMm) < 0.01 || Math.abs(roundedMm % majorMm - majorMm) < 0.01;
    const px = padPx + roundedMm * pxPerMm;
    const tickH = isMajor ? size * 0.65 : size * 0.35;

    ticks.push(
      <div key={`t${roundedMm}`} style={{
        position: 'absolute',
        [isH ? 'left' : 'top']: px,
        [isH ? 'bottom' : 'right']: 0,
        [isH ? 'width' : 'height']: 1,
        [isH ? 'height' : 'width']: tickH,
        background: isMajor ? 'var(--text-muted)' : 'var(--border-default)',
      }} />
    );

    if (isMajor) {
      ticks.push(
        <span key={`l${roundedMm}`} style={{
          position: 'absolute',
          [isH ? 'left' : 'top']: px + 2,
          [isH ? 'top' : 'left']: 1,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-main, #333)',
          lineHeight: '1',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          zIndex: 10,
          ...(isH ? {} : { writingMode: 'vertical-lr' as const }),
        }}>{formatLabel(roundedMm)}</span>
      );
    }
  }

  return (
    <div style={{
      position: 'relative',
      [isH ? 'width' : 'height']: totalPx,
      [isH ? 'height' : 'width']: size,
      background: 'var(--bg-secondary)',
      [isH ? 'borderBottom' : 'borderRight']: '1px solid var(--border-subtle)',
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {ticks}
    </div>
  );
}

function GridLayer({ width, height, zoom, step }: {
  width: number; height: number; zoom: number; step: number;
}) {
  const stepPx = mmToPx(step, zoom);
  const lines: React.ReactNode[] = [];
  for (let i = 1; i < Math.ceil(width / stepPx); i++) {
    lines.push(<Line key={`v${i}`} points={[i * stepPx, 0, i * stepPx, height]}
      stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />);
  }
  for (let j = 1; j < Math.ceil(height / stepPx); j++) {
    lines.push(<Line key={`h${j}`} points={[0, j * stepPx, width, j * stepPx]}
      stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />);
  }
  return <>{lines}</>;
}

export default function LabelCanvas() {
  const { elements, label, selectedId, select, moveElement, pushHistory, zoom, setZoom, showGrid, snapToGrid: snapEnabled,
    removeElement, duplicateElement, reorderElement, updateElement, undo, redo } = useCanvasStoreCompat();
  const rulerUnits = useSettingsStore(s => s.rulerUnits) as UnitType;
  const displayUnits = useSettingsStore(s => s.units) as UnitType;
  const unitShort = UNITS[displayUnits]?.short || 'mm';
  const gridSizeMm = useSettingsStore(s => s.gridSizeMm) || 5;
  const snapThresholdMm = useSettingsStore(s => s.snapThresholdMm) || 2.5;
  const showRulers = useSettingsStore(s => s.showRulers);
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFit = useRef(false);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [cursorMm, setCursorMm] = useState<{ x: number; y: number } | null>(null);
  const [editingZoom, setEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState('');
  // ── Multi-select state ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Auto-fit zoom
  useEffect(() => {
    if (hasAutoFit.current || !containerRef.current) return;
    hasAutoFit.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const availW = rect.width - 80 - 20;
    const availH = rect.height - 80 - 20;
    const labelWPx = label.width_mm * MM_TO_PX;
    const labelHPx = label.height_mm * MM_TO_PX;
    const fitZoom = Math.min(availW / labelWPx, availH / labelHPx, 4);
    setZoom(Math.max(0.5, Math.round(fitZoom * 4) / 4));
  }, []);

  // Ctrl+scroll zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(6, Math.max(0.25, zoom + delta));
        setZoom(Math.round(newZoom * 100) / 100);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [zoom, setZoom]);

  // Export handlers
  useEffect(() => {
    const handleExportPNG = () => {
      if (!stageRef.current) return;
      select(null);
      setTimeout(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const dataURL = stage.toDataURL({
          x: padX, y: padY, width: mmToPx(label.width_mm, zoom), height: mmToPx(label.height_mm, zoom),
          pixelRatio: 2 / zoom,
        });
        const link = document.createElement('a');
        link.download = `label-${label.width_mm}x${label.height_mm}-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }, 50);
    };

    const handleExportPDF = () => {
      if (!stageRef.current) return;
      select(null);
      setTimeout(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const dataURL = stage.toDataURL({
          x: padX, y: padY, width: mmToPx(label.width_mm, zoom), height: mmToPx(label.height_mm, zoom),
          pixelRatio: 3 / zoom,
        });
        const pdf = new jsPDF({
          orientation: label.width_mm > label.height_mm ? 'landscape' : 'portrait',
          unit: 'mm', format: [label.width_mm, label.height_mm]
        });
        pdf.addImage(dataURL, 'PNG', 0, 0, label.width_mm, label.height_mm);
        pdf.save(`label-${label.width_mm}x${label.height_mm}-${Date.now()}.pdf`);
      }, 50);
    };

    const handleExportSVG = () => {
      if (!stageRef.current) return;
      select(null);
      setTimeout(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const dataURL = stage.toDataURL({
          x: padX, y: padY, width: mmToPx(label.width_mm, zoom), height: mmToPx(label.height_mm, zoom),
          pixelRatio: 2 / zoom,
        });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${label.width_mm}mm" height="${label.height_mm}mm" viewBox="0 0 ${label.width_mm} ${label.height_mm}">
          <image href="${dataURL}" x="0" y="0" width="${label.width_mm}" height="${label.height_mm}" />
        </svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `label-${label.width_mm}x${label.height_mm}-${Date.now()}.svg`;
        link.href = url;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 50);
    };

    window.addEventListener('canvas:export-png', handleExportPNG);
    window.addEventListener('canvas:export-pdf', handleExportPDF);
    window.addEventListener('canvas:export-svg', handleExportSVG);
    return () => {
      window.removeEventListener('canvas:export-png', handleExportPNG);
      window.removeEventListener('canvas:export-pdf', handleExportPDF);
      window.removeEventListener('canvas:export-svg', handleExportSVG);
    };
  }, [label, zoom, select]);

  const labelW = mmToPx(label.width_mm, zoom);
  const labelH = mmToPx(label.height_mm, zoom);

  // Asymmetrical workspace: Tight padding on top/left (40px)
  // Large workspace extension (200% extra) on right/bottom
  const padX = 40;
  const padY = 40;

  const rulerSize = 22;
  // Total stage size: label + 40px padding + 200% extra space on right/bottom
  const stageW = labelW + padX + (labelW * 2);
  const stageH = labelH + padY + (labelH * 2);

  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const isDraggingMarquee = useRef(false);

  const handleStageMouseDown = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.attrs?.id === 'label-bg';
    if (!clickedOnEmpty) return;
    select(null);
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    marqueeStart.current = { x: pos.x, y: pos.y };
    isDraggingMarquee.current = false;
    setMarquee(null);
  };

  const handleStageMouseMove = (e: any) => {
    // Update cursor position readout
    const stage = stageRef.current;
    if (stage) {
      const pos = stage.getPointerPosition();
      if (pos) {
        const mx = pxToMm(pos.x - padX, zoom);
        const my = pxToMm(pos.y - padY, zoom);
        setCursorMm({ x: Math.round(mx * 10) / 10, y: Math.round(my * 10) / 10 });
      }
    }

    if (!marqueeStart.current) return;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    isDraggingMarquee.current = true;
    const sx = marqueeStart.current.x;
    const sy = marqueeStart.current.y;
    setMarquee({ x: Math.min(sx, pos.x), y: Math.min(sy, pos.y), w: Math.abs(pos.x - sx), h: Math.abs(pos.y - sy) });
  };

  const handleStageMouseUp = () => {
    if (marquee && isDraggingMarquee.current) {
      const mx1 = pxToMm(marquee.x - padX, zoom);
      const my1 = pxToMm(marquee.y - padY, zoom);
      const mx2 = pxToMm(marquee.x + marquee.w - padX, zoom);
      const my2 = pxToMm(marquee.y + marquee.h - padY, zoom);
      const hit = elements.find(el =>
        el.x_mm < mx2 && el.x_mm + el.width_mm > mx1 &&
        el.y_mm < my2 && el.y_mm + el.height_mm > my1
      );
      if (hit) select(hit.id);
    }
    marqueeStart.current = null;
    isDraggingMarquee.current = false;
    setMarquee(null);
  };

  const handleDeselect = (e: any) => {
    if (e.target === e.target.getStage() || e.target.attrs?.id === 'label-bg') {
      if (!isDraggingMarquee.current) select(null);
    }
  };


  const handleCtxAction = useCallback((action: string, id: string) => {
    switch (action) {
      case 'duplicate': duplicateElement(id); break;
      case 'delete': removeElement(id); break;
      case 'up': reorderElement(id, 'up'); break;
      case 'down': reorderElement(id, 'down'); break;
      case 'front': {
        const maxZ = Math.max(...elements.map(e => e.z_index), 0);
        updateElement(id, { z_index: maxZ + 1 });
        break;
      }
      case 'back': updateElement(id, { z_index: 0 }); break;
      case 'lock': {
        const el = elements.find(e => e.id === id);
        if (el) updateElement(id, { locked: !el.locked });
        break;
      }
    }
  }, [duplicateElement, removeElement, reorderElement, updateElement, elements]);

  // ── Comprehensive keyboard shortcuts (Figma-like) ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;

      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key.toLowerCase();
      if (meta) console.log('Canvas Shortcut handler triggered:', key, 'meta:', meta);
      const sel = selectedId;
      const el = sel ? elements.find(x => x.id === sel) : null;

      // Let browser/Electron system shortcuts pass through
      if (meta && (key === 'r' || key === 'f5' || (key === 'i' && shift && alt) || key === 'f12')) return;

      // Delete / Backspace
      if (key === 'delete' || key === 'backspace') {
        if (sel) { e.preventDefault(); removeElement(sel); }
        return;
      }

      // Escape — clear multi-select too
      if (key === 'escape') { e.preventDefault(); select(null); setSelectedIds([]); return; }

      // Tool shortcuts (no modifier)
      if (!meta && !alt && !shift) {
        if (key === 't') { e.preventDefault(); addCanvasElement('text'); return; }
        if (key === 'b') { e.preventDefault(); addCanvasElement('barcode'); return; }
        if (key === 'q') { e.preventDefault(); addCanvasElement('qrcode'); return; }
        if (key === 'r') { e.preventDefault(); addCanvasElement('rect'); return; }
        if (key === 'c') { e.preventDefault(); addCanvasElement('circle'); return; }
        if (key === 'l') { e.preventDefault(); addCanvasElement('line'); return; }
        if (key === 'i') { e.preventDefault(); addCanvasElement('image'); return; }
        if (key === 'v') { e.preventDefault(); select(null); return; }
      }

      // Arrow keys — nudge
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && sel && el && !el.locked && !meta) {
        e.preventDefault();
        const step = shift ? 10 : alt ? 0.1 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        
        moveElement(sel, Math.round((el.x_mm + dx) * 10) / 10, Math.round((el.y_mm + dy) * 10) / 10);
        return;
      }

      // Meta/Ctrl shortcuts
      if (meta) {
        // Undo / Redo
        if (key === 'z' && !shift) { e.preventDefault(); undo(); return; }
        if (key === 'z' && shift) { e.preventDefault(); redo(); return; }
        if (key === 'y') { e.preventDefault(); redo(); return; }

        // Duplicate
        if (key === 'd' && !shift) { e.preventDefault(); if (sel) duplicateElement(sel); return; }

        // Select all text/barcode/qrcode
        if (key === 'a') {
          e.preventDefault();
          const selectable = elements.filter(el => el.type === 'text' || el.type === 'barcode' || el.type === 'qrcode');
          if (selectable.length > 0) {
            setSelectedIds(selectable.map(el => el.id));
            select(selectable[0].id);
          }
          return;
        }

        // Copy
        if (key === 'c' && !shift) {
          e.preventDefault();
          if (sel && el) clipboardRef.current = JSON.parse(JSON.stringify(el));
          return;
        }

        // Cut
        if (key === 'x' && !shift) {
          e.preventDefault();
          if (sel && el) {
            clipboardRef.current = JSON.parse(JSON.stringify(el));
            removeElement(sel);
          }
          return;
        }

        // Paste
        if (key === 'v' && !shift && !alt) {
          e.preventDefault();
          if (clipboardRef.current) {
            const pasted = { ...JSON.parse(JSON.stringify(clipboardRef.current)) };
            pasted.id = `field_${Date.now().toString(36)}`;
            pasted.x_mm = (pasted.x_mm || 0) + 5;
            pasted.y_mm = (pasted.y_mm || 0) + 5;
            pasted.name = (pasted.name || '') + ' copy';
            const ts = useTabsStore.getState();
            const aid = ts.activeId;
            const tab = ts.tabs.find(tt => tt.id === aid);
            if (tab && aid) {
              ts.pushHistory(aid);
              ts.updateElements(aid, [...tab.elements, pasted]);
              ts.setSelectedEl(aid, pasted.id);
            }
          }
          return;
        }

        // Z-order
        if (key === ']' && shift) { e.preventDefault(); if (sel) { const maxZ = Math.max(...elements.map(x => x.z_index), 0); updateElement(sel, { z_index: maxZ + 1 }); } return; }
        if (key === '[' && shift) { e.preventDefault(); if (sel) updateElement(sel, { z_index: 0 }); return; }
        if (key === ']' && !shift) { e.preventDefault(); if (sel) reorderElement(sel, 'up'); return; }
        if (key === '[' && !shift) { e.preventDefault(); if (sel) reorderElement(sel, 'down'); return; }

        // Lock / Unlock
        if (key === 'l' && shift) { e.preventDefault(); if (sel && el) updateElement(sel, { locked: !el.locked }); return; }

        // Hide / Show
        if (key === 'h' && shift) { e.preventDefault(); if (sel && el) updateElement(sel, { hidden: !el.hidden }); return; }

        // Zoom
        if (key === '=' || key === '+') { e.preventDefault(); setZoom(Math.min(6, zoom + 0.25)); return; }
        if (key === '-') { e.preventDefault(); setZoom(Math.max(0.1, zoom - 0.25)); return; }
        if (key === '0') { e.preventDefault(); setZoom(1); return; }

        // Fit to window
        if (key === '1' && shift) {
          e.preventDefault();
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const fitZoom = Math.min((rect.width - 100) / (label.width_mm * MM_TO_PX), (rect.height - 100) / (label.height_mm * MM_TO_PX)) * 0.85;
            setZoom(Math.round(fitZoom * 100) / 100);
          }
          return;
        }

        // Toggle grid
        if (key === 'g' && !shift) { e.preventDefault(); useCanvasStore.getState().toggleGrid(); return; }

        // Toggle snap
        if (key === "'" || (key === 'g' && shift)) { e.preventDefault(); useCanvasStore.getState().toggleSnap(); return; }

        // Print
        if (key === 'p') {
          e.preventDefault();
          if (useSettingsStore.getState().printPreview) {
            usePrintStore.getState().setShowPrintPreview(true);
          } else {
            usePrintStore.getState().setShowBatchConsole(true);
          }
          return;
        }

        // New label dialog
        if (key === 'n' && !shift) { e.preventDefault(); window.dispatchEvent(new Event('app:new-label-dialog')); return; }
      }

      // Alt shortcuts
      if (alt && !meta) {
        if (key === 'h' && sel && el) { e.preventDefault(); updateElement(sel, { mirror: !el.mirror } as any); return; }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, elements, removeElement, undo, redo, duplicateElement, moveElement,
    reorderElement, updateElement, select, setZoom, zoom, label]);

  // Copy/Paste clipboard ref
  const clipboardRef = useRef<any>(null);

  // Selection size
  const selectedElem = elements.find(e => e.id === selectedId);

  // Zoom presets
  const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const handleFitLabel = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const availW = rect.width - rulerSize * 2; // Account for rulers on both sides
    const availH = rect.height - rulerSize * 2; // Account for rulers on both sides
    const labelWPx = label.width_mm * MM_TO_PX;
    const labelHPx = label.height_mm * MM_TO_PX;
    const fitZoom = Math.min(availW / labelWPx, availH / labelHPx) * 0.85;
    setZoom(Math.round(fitZoom * 100) / 100);
  }, [label, setZoom]);

  // Refs for ruler scroll sync
  const hRulerRef = useRef<HTMLDivElement>(null);
  const vRulerRef = useRef<HTMLDivElement>(null);

  // Focus on the label (top-left) in the scroll area on mount / zoom change
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    requestAnimationFrame(() => {
      // Just reset to the top-left corner so the label (at 40,40) is immediately visible
      c.scrollLeft = 0;
      c.scrollTop = 0;
    });
  }, [zoom]);

  // Sync ruler scroll position with canvas scroll
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const handleScroll = () => {
      if (hRulerRef.current) hRulerRef.current.scrollLeft = c.scrollLeft;
      if (vRulerRef.current) vRulerRef.current.scrollTop = c.scrollTop;
    };
    c.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => c.removeEventListener('scroll', handleScroll);
  }, [showRulers]);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'grid',
      gridTemplateColumns: `${rulerSize}px 1fr`,
      gridTemplateRows: `${rulerSize}px 1fr`,
      overflow: 'hidden',
      background: 'var(--bg-secondary)',
    }}>
      {/* Corner box */}
      <div style={{
        gridColumn: 1, gridRow: 1,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8, color: 'var(--text-muted)', fontWeight: 'bold', zIndex: 4,
      }}>{showRulers ? rulerUnits : ''}</div>

      {/* Horizontal ruler — scroll synced with canvas */}
      <div ref={hRulerRef} style={{
        gridColumn: 2, gridRow: 1, overflow: 'hidden', position: 'relative', zIndex: 3,
      }}>
        {showRulers && (
          <Ruler direction="h" labelMm={label.width_mm} padPx={padX} zoom={zoom} units={rulerUnits} totalPx={stageW} />
        )}
      </div>

      {/* Vertical ruler — scroll synced with canvas */}
      <div ref={vRulerRef} style={{
        gridColumn: 1, gridRow: 2, overflow: 'hidden', position: 'relative', zIndex: 3,
      }}>
        {showRulers && (
          <Ruler direction="v" labelMm={label.height_mm} padPx={padY} zoom={zoom} units={rulerUnits} totalPx={stageH} />
        )}
      </div>

      {/* Scrollable canvas area */}
      <div ref={containerRef} style={{
        gridColumn: 2, gridRow: 2,
        overflow: 'auto',
        background: 'var(--bg-tertiary)',
        position: 'relative',
      }}>
        <div style={{ width: stageW, height: stageH, position: 'relative' }}>
          <Stage ref={stageRef} width={stageW} height={stageH}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onTap={handleDeselect}
            onContextMenu={(e: any) => {
              e.evt.preventDefault();
              const target = e.target;
              if (target !== target.getStage() && target.attrs?.id !== 'label-bg') {
                const pos = stageRef.current?.getPointerPosition();
                const containerRect = containerRef.current?.getBoundingClientRect();
                if (pos && containerRect) {
                  const clickedElem = elements.find(el => {
                    const ex = mmToPx(el.x_mm, zoom) + padX;
                    const ey = mmToPx(el.y_mm, zoom) + padY;
                    const ew = mmToPx(el.width_mm, zoom);
                    const eh = mmToPx(el.height_mm, zoom);
                    return pos.x >= ex && pos.x <= ex + ew && pos.y >= ey && pos.y <= ey + eh;
                  });
                  if (clickedElem) {
                    select(clickedElem.id);
                    setCtxMenu({
                      x: containerRect.left + pos.x + 20,
                      y: containerRect.top + pos.y + 20,
                      id: clickedElem.id,
                    });
                  }
                }
              }
            }}>
            <Layer>
              <Rect x={padX + 3} y={padY + 3} width={labelW} height={labelH}
                fill="rgba(0,0,0,0.25)" cornerRadius={label.shape === 'round_rect' ? mmToPx(label.corner_radius_mm, zoom) : 0} />

              {label.shape === 'ellipse' ? (
                <Ellipse id="label-bg"
                  x={padX + labelW / 2} y={padY + labelH / 2}
                  radiusX={labelW / 2} radiusY={labelH / 2}
                  fill={label.background_color} stroke="#555" strokeWidth={1}
                  onClick={handleDeselect} />
              ) : (
                <Rect id="label-bg" x={padX} y={padY} width={labelW} height={labelH}
                  fill={label.background_color} stroke="#555" strokeWidth={1}
                  cornerRadius={label.shape === 'round_rect' ? mmToPx(label.corner_radius_mm, zoom) : 0}
                  onClick={handleDeselect} />
              )}

              {showGrid && (
                <Group x={padX} y={padY} clipX={0} clipY={0} clipWidth={labelW} clipHeight={labelH}>
                  <GridLayer width={labelW} height={labelH} zoom={zoom} step={gridSizeMm} />
                </Group>
              )}

              <Group x={padX} y={padY}>
                {[...elements].sort((a, b) => a.z_index - b.z_index).map(elem => (
                  <ElementShape key={elem.id} elem={elem} zoom={zoom}
                    isSelected={elem.id === selectedId || selectedIds.includes(elem.id)}
                    onSelect={select}
                    onDragStart={() => pushHistory()}
                    onDragEnd={(id, x, y) => {
                      updateElementRealtime(id, { x_mm: x, y_mm: y });
                    }}
                    onDragMove={(id, updates) => {
                      updateElementRealtime(id, updates);
                    }}
                    onTransformStart={() => pushHistory()}
                    onTransformEnd={(id, updates) => {
                      updateElementRealtime(id, updates);
                    }}
                    snapEnabled={snapEnabled}
                  />
                ))}
              </Group>

              {marquee && (
                <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                  fill="rgba(124,92,252,0.1)" stroke="#7c5cfc" strokeWidth={1} dash={[4, 3]} />
              )}
            </Layer>
          </Stage>
        </div>
      </div>

      {/* Cursor position readout */}
      <div style={{
        position: 'absolute', bottom: 4, left: rulerSize + 8, display: 'flex', gap: 16,
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        background: 'var(--glass-bg)', padding: '3px 10px', borderRadius: 4,
        border: '1px solid var(--glass-border)', zIndex: 3,
      }}>
        {cursorMm && (
          <span>X: {mmToUnit(cursorMm.x, displayUnits)} {unitShort} &nbsp; Y: {mmToUnit(cursorMm.y, displayUnits)} {unitShort}</span>
        )}
        {selectedElem && (
          <span style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
            W: {mmToUnit(selectedElem.width_mm, displayUnits)} {unitShort} &nbsp; H: {mmToUnit(selectedElem.height_mm, displayUnits)} {unitShort}
          </span>
        )}
        {selectedIds.length > 1 && (
          <span style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12, color: 'var(--accent-primary)' }}>
            {selectedIds.length} selected
          </span>
        )}
      </div>

      {/* ── Multi-Select Alignment Toolbar ── */}
      {selectedIds.length > 1 && (
        <div style={{
          position: 'absolute',
          top: rulerSize + 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          padding: '6px 12px',
          boxShadow: 'var(--shadow-lg)',
          fontFamily: 'var(--font-sans)',
          userSelect: 'none',
        }}>
          {/* Count badge */}
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0 8px',
            whiteSpace: 'nowrap',
          }}>
            {selectedIds.length} selected
          </span>

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 6px' }} />

          {/* Horizontal alignment group label */}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', paddingRight: 4 }}>H</span>

          {/* Align Left */}
          <button title="Align Left Edges" onClick={() => alignElements(selectedIds, 'left')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="2" y2="14"/>
              <rect x="4" y="4" width="5" height="3" rx="1"/>
              <rect x="4" y="9" width="8" height="3" rx="1"/>
            </svg>
          </button>

          {/* Center Horizontally */}
          <button title="Center Horizontally" onClick={() => alignElements(selectedIds, 'center')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="8" y1="2" x2="8" y2="14"/>
              <rect x="3" y="4" width="10" height="3" rx="1"/>
              <rect x="5" y="9" width="6" height="3" rx="1"/>
            </svg>
          </button>

          {/* Align Right */}
          <button title="Align Right Edges" onClick={() => alignElements(selectedIds, 'right')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="14" y1="2" x2="14" y2="14"/>
              <rect x="7" y="4" width="5" height="3" rx="1"/>
              <rect x="4" y="9" width="8" height="3" rx="1"/>
            </svg>
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 6px' }} />

          {/* Vertical alignment group label */}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', paddingRight: 4 }}>V</span>

          {/* Align Top */}
          <button title="Align Top Edges" onClick={() => alignElements(selectedIds, 'top')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="14" y2="2"/>
              <rect x="4" y="4" width="3" height="5" rx="1"/>
              <rect x="9" y="4" width="3" height="8" rx="1"/>
            </svg>
          </button>

          {/* Center Vertically */}
          <button title="Center Vertically" onClick={() => alignElements(selectedIds, 'middle')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="8" x2="14" y2="8"/>
              <rect x="4" y="3" width="3" height="10" rx="1"/>
              <rect x="9" y="5" width="3" height="6" rx="1"/>
            </svg>
          </button>

          {/* Align Bottom */}
          <button title="Align Bottom Edges" onClick={() => alignElements(selectedIds, 'bottom')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="14" x2="14" y2="14"/>
              <rect x="4" y="7" width="3" height="5" rx="1"/>
              <rect x="9" y="4" width="3" height="8" rx="1"/>
            </svg>
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 6px' }} />

          {/* Distribute H */}
          <button title="Distribute Horizontally" onClick={() => distributeElements(selectedIds, 'horizontal')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="3" x2="2" y2="13"/>
              <line x1="14" y1="3" x2="14" y2="13"/>
              <rect x="5" y="5" width="6" height="6" rx="1"/>
            </svg>
          </button>

          {/* Distribute V */}
          <button title="Distribute Vertically" onClick={() => distributeElements(selectedIds, 'vertical')} className="btn btn--ghost btn--icon" style={{ width: 36, height: 36, minWidth: 36 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="2" x2="13" y2="2"/>
              <line x1="3" y1="14" x2="13" y2="14"/>
              <rect x="5" y="5" width="6" height="6" rx="1"/>
            </svg>
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 8px' }} />

          {/* Dismiss */}
          <button title="Clear Selection (Esc)" onClick={() => { setSelectedIds([]); select(null); }}
            className="btn btn--ghost btn--icon"
            style={{ width: 32, height: 36, minWidth: 32, color: 'var(--text-muted)', fontSize: 18 }}>
            ✕
          </button>
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <CanvasContextMenu
          x={ctxMenu.x} y={ctxMenu.y} elementId={ctxMenu.id}
          onClose={() => setCtxMenu(null)}
          onAction={handleCtxAction}
          isLocked={elements.find(e => e.id === ctxMenu.id)?.locked ?? false}
        />
      )}
    </div>

  );
}
