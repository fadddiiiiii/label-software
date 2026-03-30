// src/renderer/components/designer/NewLabelDialog.tsx — Full New Label Setup Dialog
import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, Settings2 } from 'lucide-react';
import { LabelConfig, SheetLayout, LabelShape, DEFAULT_LABEL_CONFIG, DEFAULT_SHEET_LAYOUT } from '../../types/template';

interface NewLabelDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (label: LabelConfig, sheet: SheetLayout) => void;
  initialLabel?: LabelConfig;
  initialSheet?: SheetLayout;
}

const PAGE_SIZES = [
  { name: 'A4 (Portrait)', width: 210, height: 297 },
  { name: 'A4 (Landscape)', width: 297, height: 210 },
  { name: 'A5 (Portrait)', width: 148, height: 210 },
  { name: 'A5 (Landscape)', width: 210, height: 148 },
  { name: 'A3 (Portrait)', width: 297, height: 420 },
  { name: 'A3 (Landscape)', width: 420, height: 297 },
  { name: 'Letter (Portrait)', width: 215.9, height: 279.4 },
  { name: 'Letter (Landscape)', width: 279.4, height: 215.9 },
  { name: 'Legal (Portrait)', width: 215.9, height: 355.6 },
  { name: 'Custom', width: 0, height: 0 },
];

const NumInput = ({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) => (
  <div>
    <label className="input-label">{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="number" className="input input--compact" value={value}
        onChange={e => onChange(+e.target.value)} min={min} max={max} step={step || 0.5}
        style={{ flex: 1 }} />
      {suffix && <span style={{ fontSize: 10, color: '#999' }}>{suffix}</span>}
    </div>
  </div>
);

export default function NewLabelDialog({ open, onClose, onApply, initialLabel, initialSheet }: NewLabelDialogProps) {
  const [tab, setTab] = useState<'label' | 'shape'>('label');
  const [label, setLabel] = useState<LabelConfig>(initialLabel || { ...DEFAULT_LABEL_CONFIG });
  const [sheet, setSheet] = useState<SheetLayout>(initialSheet || { ...DEFAULT_SHEET_LAYOUT });
  const [customPaper, setCustomPaper] = useState(false);

  const patchLabel = useCallback((p: Partial<LabelConfig>) => setLabel(l => ({ ...l, ...p })), []);
  const patchSheet = useCallback((p: Partial<SheetLayout>) => setSheet(s => ({ ...s, ...p })), []);

  const currentPageSize = useMemo(() =>
    PAGE_SIZES.find(p => Math.abs(p.width - sheet.page_width_mm) < 1 && Math.abs(p.height - sheet.page_height_mm) < 1)?.name || 'Custom',
    [sheet.page_width_mm, sheet.page_height_mm]);

  const handlePageSizeChange = (name: string) => {
    const ps = PAGE_SIZES.find(p => p.name === name);
    if (ps && ps.width > 0) {
      setCustomPaper(false);
      patchSheet({ page_width_mm: ps.width, page_height_mm: ps.height });
    } else {
      setCustomPaper(true);
    }
  };

  const totalLabels = sheet.cols * sheet.rows;
  const labelsFit = useMemo(() => {
    const usableW = sheet.page_width_mm - sheet.margin_left_mm - sheet.margin_right_mm;
    const usableH = sheet.page_height_mm - sheet.margin_top_mm - sheet.margin_bottom_mm;
    const needW = sheet.cols * label.width_mm + Math.max(0, sheet.cols - 1) * sheet.h_gap_mm;
    const needH = sheet.rows * label.height_mm + Math.max(0, sheet.rows - 1) * sheet.v_gap_mm;
    return needW <= usableW + 0.1 && needH <= usableH + 0.1;
  }, [label, sheet]);

  const handleApply = () => {
    onApply(label, sheet);
    onClose();
  };

  if (!open) return null;

  const previewScale = 0.8;
  const maxPreviewH = 320;
  const ratio = Math.min(380 / sheet.page_width_mm, maxPreviewH / sheet.page_height_mm) * previewScale;

  return createPortal(
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={onClose} />
        <motion.div initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          style={{
            position: 'relative', zIndex: 1, background: '#fff', borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)', width: 860, maxWidth: '95vw',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 24px', borderBottom: '1px solid #eee',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={18} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#1a1a1a' }}>New Label</h3>
                <p style={{ fontSize: 11, color: '#999', margin: 0 }}>Configure label dimensions, layout, and shape</p>
              </div>
            </div>
            <button onClick={onClose} className="btn btn--ghost btn--icon" style={{ borderRadius: '50%' }}>
              <X size={18} />
            </button>
          </div>

          {/* Tab buttons */}
          <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '0 24px' }}>
            {(['label', 'shape'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '12px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none',
                  cursor: 'pointer', color: tab === t ? '#1a1a1a' : '#999',
                  borderBottom: tab === t ? '2px solid #1a1a1a' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}>
                {t === 'label' ? 'Label Settings' : 'Shape / Printing Order'}
              </button>
            ))}
          </div>

          {/* Body: preview + settings */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: Live Preview */}
            <div style={{
              width: 400, minWidth: 400, background: '#f8f8fa', padding: 24,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRight: '1px solid #eee',
            }}>
              <div style={{
                width: sheet.page_width_mm * ratio, height: sheet.page_height_mm * ratio,
                background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                position: 'relative', borderRadius: 2,
              }}>
                {/* Margins shown as gray overlay */}
                <div style={{
                  position: 'absolute',
                  left: sheet.margin_left_mm * ratio, top: sheet.margin_top_mm * ratio,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${sheet.cols}, ${label.width_mm * ratio}px)`,
                  gridTemplateRows: `repeat(${sheet.rows}, ${label.height_mm * ratio}px)`,
                  columnGap: sheet.h_gap_mm * ratio, rowGap: sheet.v_gap_mm * ratio,
                }}>
                  {Array.from({ length: totalLabels }, (_, i) => {
                    const borderRadius = label.shape === 'ellipse' ? '50%' :
                      label.shape === 'round_rect' ? Math.min(4, label.corner_radius_mm * ratio) : 0;
                    return (
                      <div key={i} style={{
                        width: label.width_mm * ratio, height: label.height_mm * ratio,
                        background: label.background_color, border: '1px solid #d0d0d0',
                        borderRadius, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: Math.max(8, Math.min(14, label.width_mm * ratio * 0.15)),
                        color: '#bbb', fontWeight: 700,
                      }}>
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Error / info */}
              {!labelsFit && (
                <div style={{
                  marginTop: 12, padding: '8px 16px', background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, fontSize: 11, color: '#dc2626', fontWeight: 600, textAlign: 'center',
                }}>
                  Labels exceed paper bounds. Adjust dimensions.
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 11, color: '#999', textAlign: 'center' }}>
                Paper: {sheet.page_width_mm} × {sheet.page_height_mm} mm &nbsp;|&nbsp;
                Label: {label.width_mm} × {label.height_mm} mm &nbsp;|&nbsp;
                {totalLabels} per sheet
              </div>
            </div>

            {/* Right: Settings form */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              {tab === 'label' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Paper size */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Paper Size
                    </div>
                    <select className="select" value={currentPageSize}
                      onChange={e => handlePageSizeChange(e.target.value)} style={{ marginBottom: 8 }}>
                      {PAGE_SIZES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                    {(customPaper || currentPageSize === 'Custom') && (
                      <div className="input-row" style={{ marginTop: 8 }}>
                        <NumInput label="Paper Width" value={sheet.page_width_mm} onChange={v => patchSheet({ page_width_mm: v })} min={10} suffix="mm" />
                        <NumInput label="Paper Height" value={sheet.page_height_mm} onChange={v => patchSheet({ page_height_mm: v })} min={10} suffix="mm" />
                      </div>
                    )}
                  </div>

                  {/* Label dimensions */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Label Dimensions
                    </div>
                    <div className="input-row">
                      <NumInput label="Width" value={label.width_mm} onChange={v => patchLabel({ width_mm: v })} min={5} suffix="mm" />
                      <NumInput label="Height" value={label.height_mm} onChange={v => patchLabel({ height_mm: v })} min={5} suffix="mm" />
                    </div>
                    <div className="input-row">
                      <NumInput label="Columns" value={sheet.cols} onChange={v => patchSheet({ cols: Math.max(1, Math.round(v)) })} min={1} max={20} step={1} />
                      <NumInput label="Rows" value={sheet.rows} onChange={v => patchSheet({ rows: Math.max(1, Math.round(v)) })} min={1} max={50} step={1} />
                    </div>
                  </div>

                  {/* Gaps */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Gaps Between Labels
                    </div>
                    <div className="input-row">
                      <NumInput label="Horizontal Gap" value={sheet.h_gap_mm} onChange={v => patchSheet({ h_gap_mm: v })} min={0} suffix="mm" />
                      <NumInput label="Vertical Gap" value={sheet.v_gap_mm} onChange={v => patchSheet({ v_gap_mm: v })} min={0} suffix="mm" />
                    </div>
                  </div>

                  {/* Margins */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Sheet Margins
                    </div>
                    <div className="input-row">
                      <NumInput label="Left" value={sheet.margin_left_mm} onChange={v => patchSheet({ margin_left_mm: v })} min={0} suffix="mm" />
                      <NumInput label="Right" value={sheet.margin_right_mm} onChange={v => patchSheet({ margin_right_mm: v })} min={0} suffix="mm" />
                    </div>
                    <div className="input-row">
                      <NumInput label="Top" value={sheet.margin_top_mm} onChange={v => patchSheet({ margin_top_mm: v })} min={0} suffix="mm" />
                      <NumInput label="Bottom" value={sheet.margin_bottom_mm} onChange={v => patchSheet({ margin_bottom_mm: v })} min={0} suffix="mm" />
                    </div>
                  </div>

                  {/* DPI */}
                  <div>
                    <label className="input-label">Resolution (DPI)</label>
                    <select className="select" value={label.dpi}
                      onChange={e => patchLabel({ dpi: +e.target.value })}>
                      <option value={150}>150 DPI</option>
                      <option value={200}>200 DPI</option>
                      <option value={300}>300 DPI (Default)</option>
                      <option value={600}>600 DPI</option>
                    </select>
                  </div>
                </div>
              )}

              {tab === 'shape' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Label shape */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Label Shape
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([['rect', 'Rectangle'], ['round_rect', 'Rounded'], ['ellipse', 'Ellipse']] as const).map(([val, lbl]) => (
                        <button key={val} onClick={() => patchLabel({ shape: val })}
                          style={{
                            flex: 1, padding: '12px 8px', borderRadius: 10,
                            border: label.shape === val ? '2px solid #1a1a1a' : '1px solid #e0e0e0',
                            background: label.shape === val ? '#f5f5f7' : '#fff',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            color: label.shape === val ? '#1a1a1a' : '#888',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          }}>
                          <div style={{
                            width: 40, height: 28,
                            border: '2px solid currentColor',
                            borderRadius: val === 'ellipse' ? '50%' : val === 'round_rect' ? 6 : 2,
                          }} />
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {label.shape === 'round_rect' && (
                      <div style={{ marginTop: 12 }}>
                        <NumInput label="Corner Radius" value={label.corner_radius_mm}
                          onChange={v => patchLabel({ corner_radius_mm: v })} min={0} max={20} suffix="mm" />
                      </div>
                    )}
                    {label.shape === 'ellipse' && (
                      <div style={{ marginTop: 12 }}>
                        <NumInput label="Hole Diameter (for donut labels)"
                          value={label.hole_diameter_mm}
                          onChange={v => patchLabel({ hole_diameter_mm: v })} min={0} suffix="mm" />
                      </div>
                    )}
                  </div>

                  {/* Label order */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Printing Order
                    </div>
                    <div className="input-row">
                      <div>
                        <label className="input-label">Start Corner</label>
                        <select className="select" value={label.start_corner}
                          onChange={e => patchLabel({ start_corner: e.target.value as any })}>
                          <option value="top-left">Top Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Primary Direction</label>
                        <select className="select" value={label.primary_direction}
                          onChange={e => patchLabel({ primary_direction: e.target.value as any })}>
                          <option value="horizontal">Horizontal</option>
                          <option value="vertical">Vertical</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Relocation / offset */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Relocation Offset
                    </div>
                    <div className="input-row">
                      <NumInput label="Left Offset" value={label.relocation_left_mm}
                        onChange={v => patchLabel({ relocation_left_mm: v })} suffix="mm" />
                      <NumInput label="Top Offset" value={label.relocation_top_mm}
                        onChange={v => patchLabel({ relocation_top_mm: v })} suffix="mm" />
                    </div>
                  </div>

                  {/* Print angle */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Print Direction
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[0, 90, 180, 270].map(angle => (
                        <button key={angle} onClick={() => patchLabel({ print_angle: angle })}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 8,
                            border: label.print_angle === angle ? '2px solid #1a1a1a' : '1px solid #e0e0e0',
                            background: label.print_angle === angle ? '#f5f5f7' : '#fff',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            color: label.print_angle === angle ? '#1a1a1a' : '#888',
                          }}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background */}
                  <div>
                    <label className="input-label">Background Color</label>
                    <div className="color-input">
                      <div className="color-input__swatch">
                        <input type="color" value={label.background_color}
                          onChange={e => patchLabel({ background_color: e.target.value })} />
                      </div>
                      <input className="input input--compact" value={label.background_color}
                        onChange={e => patchLabel({ background_color: e.target.value })}
                        style={{ flex: 1, fontFamily: 'var(--font-mono)' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px', borderTop: '1px solid #eee', background: '#fafafa',
            display: 'flex', justifyContent: 'flex-end', gap: 12,
          }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={handleApply}
              style={{ padding: '0 24px' }}>
              Apply
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
