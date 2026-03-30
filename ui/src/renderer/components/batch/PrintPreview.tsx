// src/renderer/components/batch/PrintPreview.tsx — Multi-Page Print Preview
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Printer, FileDown, Minus, Plus, RotateCw } from 'lucide-react';
import { usePrintStore } from '../../store/print';
import { useDataStore } from '../../store/data';
import { useCanvasStoreCompat, toDocument } from '../../store/canvas';
import { useTabsStore } from '../../store/tabs';
import { invokeIPC } from '../../hooks/useIPC';
import { LabelPreviewRenderer } from './LabelPreviewRenderer';

const PAGE_PRESETS = [
  { name: 'Match Label Size', width: 0, height: 0 },
  { name: 'A4 Portrait', width: 210, height: 297 },
  { name: 'A4 Landscape', width: 297, height: 210 },
  { name: 'A5 Portrait', width: 148, height: 210 },
  { name: 'A5 Landscape', width: 210, height: 148 },
  { name: 'Letter Portrait', width: 215.9, height: 279.4 },
  { name: 'Letter Landscape', width: 279.4, height: 215.9 },
  { name: 'A3 Portrait', width: 297, height: 420 },
  { name: '4×6" Label', width: 101.6, height: 152.4 },
  { name: '4×2" Label', width: 101.6, height: 50.8 },
  { name: '3×2" Label', width: 76.2, height: 50.8 },
  { name: '2×1" Label', width: 50.8, height: 25.4 },
  { name: '100×70mm', width: 100, height: 70 },
  { name: '100×50mm', width: 100, height: 50 },
  { name: '80×40mm', width: 80, height: 40 },
  { name: '60×40mm', width: 60, height: 40 },
  { name: '50×25mm', width: 50, height: 25 },
  { name: 'Custom', width: -1, height: -1 },
];

export default function PrintPreview() {
  const { showPrintPreview, setShowPrintPreview, setShowBatchConsole, settings, updateSettings } = usePrintStore();
  const { sources, activeSourceId, currentPreviewRow, setPreviewRow } = useDataStore();
  const { label, sheetLayout, setSheetLayout } = useCanvasStoreCompat();
  const active = sources.find(s => s.id === activeSourceId);

  const [previewZoom, setPreviewZoom] = useState(1);
  const [customPage, setCustomPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const layout = sheetLayout;
  const pageW = layout.page_width_mm;
  const pageH = layout.page_height_mm;

  // How many labels actually FIT on one page
  const fit = useMemo(() => {
    const usableW = pageW - layout.margin_left_mm - (layout.margin_right_mm || 0);
    const usableH = pageH - layout.margin_top_mm - (layout.margin_bottom_mm || 0);
    const cols = Math.max(1, Math.floor((usableW + layout.h_gap_mm) / (label.width_mm + layout.h_gap_mm)));
    const rows = Math.max(1, Math.floor((usableH + layout.v_gap_mm) / (label.height_mm + layout.v_gap_mm)));
    return { cols, rows, perPage: cols * rows };
  }, [pageW, pageH, layout, label]);

  // Always use the user-defined cols/rows from sheetLayout.
  // fit.cols/rows is only the physical max that can fit on the page (used as cap).
  const effectiveCols = Math.min(layout.cols, fit.cols);
  const effectiveRows  = Math.min(layout.rows, fit.rows);
  const effectivePerPage = effectiveCols * effectiveRows;
  const totalLabelsToPrint = active ? active.rowCount : effectivePerPage;
  const totalPages = Math.max(1, Math.ceil(totalLabelsToPrint / effectivePerPage));

  // Clamp page if layout changed and reduced total pages
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  useEffect(() => {
    if (currentPage > totalPages - 1) setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages]);

  const startIdx = safePage * effectivePerPage;
  const labelsOnPage = Math.min(effectivePerPage, totalLabelsToPrint - startIdx);
  const gridRows = Math.ceil(Math.max(0, labelsOnPage) / effectiveCols);

  // Preview scaling
  const maxPreviewH = 460;
  const maxPreviewW = 520;
  const baseRatio = Math.min(maxPreviewW / pageW, maxPreviewH / pageH);
  const ratio = baseRatio * previewZoom;

  if (!showPrintPreview) return null;

  const currentPrinter = settings.printer || 'PDF';
  const isVirtualPrinter = /^pdf$/i.test(currentPrinter.trim()) || currentPrinter.toLowerCase().includes('save as pdf');
  const isMatchLabel = pageW <= label.width_mm + 2 && pageH <= label.height_mm + 2 && fit.cols === 1 && fit.rows === 1;

  const handlePrint = () => {
    setSheetLayout({ cols: effectiveCols, rows: effectiveRows });
    setShowPrintPreview(false);
    setShowBatchConsole(true);
  };

  const handleExportPdf = async () => {
    // 1. Ask for save path
    const activeTab = useTabsStore.getState().getActive();
    const path = await invokeIPC<string | null>('pdf:save-dialog', { filename: activeTab?.name || 'labels' });
    if (!path) return;

    // 2. Close preview and open batch console
    setShowPrintPreview(false);
    setShowBatchConsole(true);
    
    // Update the sheet layout to match what was in the preview
    setSheetLayout({ 
      cols: effectiveCols, 
      rows: effectiveRows,
      page_width_mm: pageW,
      page_height_mm: pageH,
      h_gap_mm: layout.h_gap_mm,
      v_gap_mm: layout.v_gap_mm,
      margin_left_mm: layout.margin_left_mm,
      margin_right_mm: layout.margin_right_mm,
      margin_top_mm: layout.margin_top_mm,
      margin_bottom_mm: layout.margin_bottom_mm
    });

    // 3. Actually trigger the PDF export via IPC
    const { resetProgress, setProgress } = usePrintStore.getState();
    const { sources: srcs, activeSourceId: srcId } = useDataStore.getState();
    const src = srcs.find(s => s.id === srcId);
    const maxRows = src?.rowCount ?? 1;

    resetProgress();
    setProgress({ status: 'running', totalRows: maxRows });

    try {
      const result = await invokeIPC('batch:start', {
        template: toDocument(),
        printer: 'PDF',
        output_path: path,
        copies_per_label: 1,
        start_row: 0,
        end_row: maxRows,
        print_mode: 'pdf',
      });

      if (result?.error) {
        setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: result.error }] });
      } else {
        setProgress({
          status: result?.status === 'failed' ? 'failed' : 'done',
          completedRows: result?.completed_rows ?? maxRows,
          totalRows: result?.total_rows ?? maxRows,
          errorRows: result?.error_rows ?? 0,
          errors: result?.errors ?? [],
        });
      }
    } catch (err: any) {
      setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: err.message }] });
    }
  };

  const handlePagePreset = (name: string) => {
    const preset = PAGE_PRESETS.find(p => p.name === name);
    if (!preset) return;
    setCurrentPage(0);

    if (preset.width === 0) {
      setSheetLayout({
        page_width_mm: label.width_mm, page_height_mm: label.height_mm,
        cols: 1, rows: 1,
        margin_left_mm: 0, margin_right_mm: 0,
        margin_top_mm: 0, margin_bottom_mm: 0,
        h_gap_mm: 0, v_gap_mm: 0,
      });
      setCustomPage(false);
    } else if (preset.width === -1) {
      setCustomPage(true);
    } else {
      setCustomPage(false);
      const ml = layout.margin_left_mm, mt = layout.margin_top_mm;
      const mr = layout.margin_right_mm || 0, mb = layout.margin_bottom_mm || 0;
      const usableW = preset.width - ml - mr;
      const usableH = preset.height - mt - mb;
      const cols = Math.max(1, Math.floor((usableW + layout.h_gap_mm) / (label.width_mm + layout.h_gap_mm)));
      const rows = Math.max(1, Math.floor((usableH + layout.v_gap_mm) / (label.height_mm + layout.v_gap_mm)));
      setSheetLayout({ page_width_mm: preset.width, page_height_mm: preset.height, cols, rows });
    }
  };

  const handleAutoFill = () => {
    setSheetLayout({ cols: fit.cols, rows: fit.rows });
  };

  const currentPresetName = customPage ? 'Custom'
    : isMatchLabel ? 'Match Label Size'
    : PAGE_PRESETS.find(p => p.width > 0 && Math.abs(p.width - pageW) < 1 && Math.abs(p.height - pageH) < 1)?.name || 'Custom';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={() => setShowPrintPreview(false)} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          position: 'relative', zIndex: 1, background: 'var(--bg-primary)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)', width: 960, maxWidth: '95vw',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Print Preview</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Page navigator */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-secondary)', borderRadius: 8, padding: '4px 8px',
              }}>
                <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={() => setCurrentPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, minWidth: 70, textAlign: 'center', color: 'var(--text-primary)' }}>
                  Page {safePage + 1} / {totalPages}
                </span>
                <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={() => setCurrentPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button onClick={() => setShowPrintPreview(false)} className="btn btn--ghost btn--icon" style={{ borderRadius: '50%' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Preview area */}
          <div style={{
            flex: 1, background: 'var(--bg-tertiary)', overflow: 'auto', padding: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {/* The page */}
            <div style={{
              width: pageW * ratio, height: pageH * ratio,
              background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
              position: 'relative', transition: 'width 0.2s, height 0.2s', flexShrink: 0,
              overflow: 'hidden',
            }}>
              {/* Margin indicators */}
              {layout.margin_left_mm > 0 && (
                <div style={{
                  position: 'absolute', left: 0, top: 0,
                  width: layout.margin_left_mm * ratio, height: '100%',
                  background: 'rgba(0,0,0,0.02)', borderRight: '1px dashed rgba(0,0,0,0.08)',
                }} />
              )}
              {layout.margin_top_mm > 0 && (
                <div style={{
                  position: 'absolute', left: 0, top: 0,
                  width: '100%', height: layout.margin_top_mm * ratio,
                  background: 'rgba(0,0,0,0.02)', borderBottom: '1px dashed rgba(0,0,0,0.08)',
                }} />
              )}

              {/* Labels grid — only labels for THIS page, clipped to page */}
              <div key={`page-grid-${safePage}`} style={{
                position: 'absolute',
                left: layout.margin_left_mm * ratio, top: layout.margin_top_mm * ratio,
                display: 'grid',
                gridTemplateColumns: `repeat(${effectiveCols}, ${label.width_mm * ratio}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${label.height_mm * ratio}px)`,
                columnGap: layout.h_gap_mm * ratio, rowGap: layout.v_gap_mm * ratio,
              }}>
                {Array.from({ length: Math.max(0, labelsOnPage) }, (_, i) => {
                  const globalIdx = startIdx + i;
                  return (
                    <LabelPreviewRenderer
                      key={`label-${globalIdx}`}
                      widthMm={label.width_mm}
                      heightMm={label.height_mm}
                      ratio={ratio}
                      rowIndex={globalIdx}
                      backgroundColor={label.background_color}
                      borderRadius={label.shape === 'ellipse' ? '50%' :
                        label.shape === 'round_rect' ? Math.min(4, label.corner_radius_mm * ratio) : 0}
                    />
                  );
                })}
              </div>
            </div>

            {/* Page dots for multi-page */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {Array.from({ length: Math.min(totalPages, 12) }, (_, i) => (
                  <button key={i} onClick={() => setCurrentPage(i)} style={{
                    width: safePage === i ? 18 : 8, height: 8, borderRadius: 4,
                    background: safePage === i ? 'var(--accent-primary)' : 'var(--border-default)',
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s', padding: 0,
                  }} />
                ))}
                {totalPages > 12 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{totalPages - 12} more</span>
                )}
              </div>
            )}
          </div>

          {/* Right controls */}
          <div style={{
            width: 270, minWidth: 270, borderLeft: '1px solid var(--border-subtle)', padding: '16px 16px',
            overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* Page Size */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Page / Paper Size
              </div>
              <select className="select" value={currentPresetName}
                onChange={e => handlePagePreset(e.target.value)} style={{ width: '100%', marginBottom: 6 }}>
                {PAGE_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              {(customPage || currentPresetName === 'Custom') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  <div>
                    <label className="input-label">Width (mm)</label>
                    <input type="number" className="input input--compact" value={pageW}
                      onChange={e => setSheetLayout({ page_width_mm: +e.target.value })} min={10} step={1} />
                  </div>
                  <div>
                    <label className="input-label">Height (mm)</label>
                    <input type="number" className="input input--compact" value={pageH}
                      onChange={e => setSheetLayout({ page_height_mm: +e.target.value })} min={10} step={1} />
                  </div>
                </div>
              )}
            </div>

            {/* Sheet Layout — Columns × Rows */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Sheet Layout
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label className="input-label">Columns</label>
                  <input type="number" className="input input--compact" value={layout.cols}
                    onChange={e => setSheetLayout({ cols: Math.max(1, +e.target.value) })} min={1} max={50} />
                </div>
                <div>
                  <label className="input-label">Rows</label>
                  <input type="number" className="input input--compact" value={layout.rows}
                    onChange={e => setSheetLayout({ rows: Math.max(1, +e.target.value) })} min={1} max={100} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Max that fits: {fit.cols} × {fit.rows}
                {(layout.cols > fit.cols || layout.rows > fit.rows) && (
                  <span style={{ color: '#ef4444', marginLeft: 6 }}>— exceeds page</span>
                )}
              </div>
            </div>

            {/* Layout info */}
            <div style={{
              padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>Labels per page</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{layout.cols} × {layout.rows} = {layout.cols * layout.rows}</span>
              </div>
              {active && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total to print</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{totalLabelsToPrint}</span>
                </div>
              )}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Pages needed</span>
                  <span style={{ fontWeight: 700, color: '#2563eb' }}>{totalPages}</span>
                </div>
              )}
            </div>

            {/* Gaps */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Gaps
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label className="input-label">H Gap (mm)</label>
                  <input type="number" className="input input--compact" value={layout.h_gap_mm}
                    onChange={e => setSheetLayout({ h_gap_mm: +e.target.value })} step={0.5} min={0} max={50} />
                </div>
                <div>
                  <label className="input-label">V Gap (mm)</label>
                  <input type="number" className="input input--compact" value={layout.v_gap_mm}
                    onChange={e => setSheetLayout({ v_gap_mm: +e.target.value })} step={0.5} min={0} max={50} />
                </div>
              </div>
              <button className="btn" onClick={() => setSheetLayout({ h_gap_mm: 0, v_gap_mm: 0 })}
                style={{ width: '100%', fontSize: 11, marginTop: 6, height: 28 }}>
                Remove All Gaps
              </button>
            </div>

            {/* Margins */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Margins
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label className="input-label">Left</label>
                  <input type="number" className="input input--compact" value={layout.margin_left_mm}
                    onChange={e => setSheetLayout({ margin_left_mm: +e.target.value })} step={0.5} min={0} />
                </div>
                <div>
                  <label className="input-label">Right</label>
                  <input type="number" className="input input--compact" value={layout.margin_right_mm}
                    onChange={e => setSheetLayout({ margin_right_mm: +e.target.value })} step={0.5} min={0} />
                </div>
                <div>
                  <label className="input-label">Top</label>
                  <input type="number" className="input input--compact" value={layout.margin_top_mm}
                    onChange={e => setSheetLayout({ margin_top_mm: +e.target.value })} step={0.5} min={0} />
                </div>
                <div>
                  <label className="input-label">Bottom</label>
                  <input type="number" className="input input--compact" value={layout.margin_bottom_mm}
                    onChange={e => setSheetLayout({ margin_bottom_mm: +e.target.value })} step={0.5} min={0} />
                </div>
              </div>
            </div>

            {/* Calibration */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Calibration Offset
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label className="input-label">Left (mm)</label>
                  <input type="number" className="input input--compact" value={settings.position_left_mm}
                    onChange={e => updateSettings({ position_left_mm: +e.target.value })} step={0.5} />
                </div>
                <div>
                  <label className="input-label">Top (mm)</label>
                  <input type="number" className="input input--compact" value={settings.position_top_mm}
                    onChange={e => updateSettings({ position_top_mm: +e.target.value })} step={0.5} />
                </div>
              </div>
            </div>

            {/* Preview zoom */}
            <div>
              <label className="input-label">Preview Zoom</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={() => setPreviewZoom(Math.max(0.3, previewZoom - 0.15))}><Minus size={12} /></button>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {Math.round(previewZoom * 100)}%
                </span>
                <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={() => setPreviewZoom(Math.min(3, previewZoom + 0.15))}><Plus size={12} /></button>
              </div>
            </div>

            {!isVirtualPrinter && (
              <button className="btn" onClick={async () => {
                try { await invokeIPC('printer:openPreferences', { printer: currentPrinter }); } catch {}
              }} style={{ width: '100%', gap: 6 }}>
                <Printer size={14} /> Printer Preferences
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Page {pageW}×{pageH}mm · Label {label.width_mm}×{label.height_mm}mm · {labelsOnPage}/page · {totalPages} page{totalPages !== 1 ? 's' : ''} · Gap {layout.h_gap_mm}×{layout.v_gap_mm}mm
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={handleExportPdf} style={{ gap: 6, height: 32 }}><FileDown size={13} /> PDF</button>
            <button className="btn btn--primary" onClick={handlePrint} style={{ padding: '0 20px', height: 32 }}>Print</button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
