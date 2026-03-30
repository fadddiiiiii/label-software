import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStoreCompat } from '../../store/canvas';
import { useDataStore } from '../../store/data';
import { Alignment, LabelShape, LabelConfig, SheetLayout, OverflowMode, LineStyle } from '../../types/template';
import { Alert } from './alert';
import BindingPanel from './BindingPanel';
import { LabelPreviewRenderer } from '../batch/LabelPreviewRenderer';
import { TriangleAlert, Layers, Maximize2, X, Copy, ArrowUp, ArrowDown, Trash2, ImagePlus,
  AlignLeft, AlignCenter, AlignRight, Hash,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  Lock, Unlock, EyeOff, Strikethrough, Underline, FlipHorizontal, Type, Italic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FONTS = [
  'Helvetica', 'Arial', 'Courier', 'Times-Roman', 'Inter', 'Lato', 'Montserrat',
  'Nunito', 'Open Sans', 'Oswald', 'Poppins', 'Raleway', 'Roboto'
];

const WEIGHTS = [
  { label: 'Thin (100)', value: '100' }, { label: 'Extra Light (200)', value: '200' },
  { label: 'Light (300)', value: '300' }, { label: 'Normal (400)', value: '400' },
  { label: 'Medium (500)', value: '500' }, { label: 'Semi Bold (600)', value: '600' },
  { label: 'Bold (700)', value: '700' }, { label: 'Extra Bold (800)', value: '800' },
  { label: 'Black (900)', value: '900' },
];

function SheetPreview({ label, layout, setSheetLayout, onClose }: {
  label: LabelConfig; layout: SheetLayout; setSheetLayout: (u: Partial<SheetLayout>) => void; onClose: () => void;
}) {
  const pageSizes = [
    { name: 'A4 (Portrait)', width: 210, height: 297 },
    { name: 'A4 (Landscape)', width: 297, height: 210 },
    { name: 'A5 (Portrait)', width: 148, height: 210 },
    { name: 'A5 (Landscape)', width: 210, height: 148 },
    { name: 'A3 (Portrait)', width: 297, height: 420 },
    { name: 'A3 (Landscape)', width: 420, height: 297 },
    { name: 'Letter (Portrait)', width: 215.9, height: 279.4 },
    { name: 'Letter (Landscape)', width: 279.4, height: 215.9 },
  ];

  const pw = layout.page_width_mm || 210;
  const ph = layout.page_height_mm || 297;
  const currentSizeName = pageSizes.find(p => Math.abs(p.width - pw) < 1 && Math.abs(p.height - ph) < 1)?.name || 'Custom';

  const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = pageSizes.find(p => p.name === e.target.value);
    if (size) {
      const lw = label.width_mm || 1;
      const lh = label.height_mm || 1;
      const hg = layout.h_gap_mm || 0;
      const vg = layout.v_gap_mm || 0;
      const ml = layout.margin_left_mm || 5;
      const mt = layout.margin_top_mm || 5;
      const availableW = size.width - ml * 2;
      const availableH = size.height - mt * 2;
      const newCols = Math.max(1, Math.floor((availableW + hg) / (lw + hg)));
      const newRows = Math.max(1, Math.floor((availableH + vg) / (lh + vg)));
      setSheetLayout({ page_width_mm: size.width, page_height_mm: size.height, cols: newCols, rows: newRows });
    }
  };

  const maxSize = 600;
  const ratio = Math.min(maxSize / pw, maxSize / ph);
  const scaledPw = pw * ratio;
  const scaledPh = ph * ratio;
  const scaledMl = (layout.margin_left_mm || 5) * ratio;
  const scaledMt = (layout.margin_top_mm || 5) * ratio;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, background: '#fff', padding: '12px 24px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Page Size:</label>
            <select className="select" value={currentSizeName} onChange={handleSizeChange} style={{ minWidth: 160 }}>
              {pageSizes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, borderLeft: '1px solid #eee' }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              <strong>{layout.cols * layout.rows}</strong> labels per sheet
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{ position: 'absolute', top: -12, right: -48, background: '#fff', border: 'none', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} />
        </button>
        <div style={{ width: scaledPw, height: scaledPh, background: '#fff', boxShadow: '0 12px 48px rgba(0,0,0,0.2)', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: scaledMl, top: scaledMt,
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
            gap: `${layout.v_gap_mm * ratio}px ${layout.h_gap_mm * ratio}px`,
            width: (layout.cols * label.width_mm + (layout.cols > 1 ? layout.cols - 1 : 0) * layout.h_gap_mm) * ratio,
            height: (layout.rows * label.height_mm + (layout.rows > 1 ? layout.rows - 1 : 0) * layout.v_gap_mm) * ratio,
          }}>
            {Array.from({ length: layout.cols * layout.rows }).map((_, i) => (
              <LabelPreviewRenderer
                key={i}
                widthMm={label.width_mm}
                heightMm={label.height_mm}
                ratio={ratio}
                rowIndex={i}
                backgroundColor={label.background_color}
                borderRadius={label.shape === 'ellipse' ? '50%' : label.shape === 'round_rect' ? 4 : 0}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

export default function PropertiesPanel() {
  const { elements, selectedId, updateElement, removeElement, duplicateElement, reorderElement, label, setLabel, sheetLayout, setSheetLayout } = useCanvasStoreCompat();
  const { bindings } = useDataStore();
  const [showModal, setShowModal] = useState(false);
  const elem = elements.find(e => e.id === selectedId);

  if (!elem) {
    return (
      <div className="animate-in" style={{ height: '100%', overflowY: 'auto' }}>
        <div style={{ padding: '40px 20px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, 4, -4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 56, height: 56, borderRadius: 16, background: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
            <Layers size={28} color="#ffffff" strokeWidth={1.5} />
          </motion.div>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>Settings</p>
          <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Select an element to edit properties</p>
        </div>

        {/* Label Size */}
        <div className="panel-section">
          <div className="panel-section__title">Label Size</div>
          <div className="input-row">
            <div>
              <label className="input-label">Width (mm)</label>
              <input type="number" className="input input--compact" value={label.width_mm}
                onChange={e => setLabel({ width_mm: +e.target.value })} min={5} step={1} />
            </div>
            <div>
              <label className="input-label">Height (mm)</label>
              <input type="number" className="input input--compact" value={label.height_mm}
                onChange={e => setLabel({ height_mm: +e.target.value })} min={5} step={1} />
            </div>
          </div>
          <div className="input-row">
            <div>
              <label className="input-label">DPI</label>
              <select className="select" value={label.dpi} onChange={e => setLabel({ dpi: +e.target.value })}>
                <option value={150}>150</option><option value={200}>200</option>
                <option value={300}>300</option><option value={600}>600</option>
              </select>
            </div>
            <div>
              <label className="input-label">Shape</label>
              <select className="select" value={label.shape}
                onChange={e => setLabel({ shape: e.target.value as LabelShape })}>
                <option value="rect">Rectangle</option>
                <option value="round_rect">Rounded</option>
                <option value="ellipse">Ellipse</option>
              </select>
            </div>
          </div>
          {label.shape === 'round_rect' && (
            <div>
              <label className="input-label">Corner Radius (mm)</label>
              <input type="number" className="input input--compact" value={label.corner_radius_mm ?? 0}
                onChange={e => setLabel({ corner_radius_mm: +e.target.value })} min={0} step={0.5} />
            </div>
          )}
          <div>
            <label className="input-label">Background</label>
            <div className="color-input">
              <div className="color-input__swatch">
                <input type="color" value={label.background_color} onChange={e => setLabel({ background_color: e.target.value })} />
              </div>
              <input className="input input--compact" value={label.background_color}
                onChange={e => setLabel({ background_color: e.target.value })}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
            </div>
          </div>
        </div>

        {/* Sheet Layout */}
        <div className="panel-section">
          <div className="panel-section__title">Sheet Layout</div>
          <div className="input-row">
            <div>
              <label className="input-label">Columns</label>
              <input type="number" className="input input--compact" value={sheetLayout.cols}
                onChange={e => setSheetLayout({ cols: +e.target.value })} min={1} max={10} />
            </div>
            <div>
              <label className="input-label">Rows</label>
              <input type="number" className="input input--compact" value={sheetLayout.rows}
                onChange={e => setSheetLayout({ rows: +e.target.value })} min={1} max={20} />
            </div>
          </div>
          <div className="input-row">
            <div>
              <label className="input-label">H Gap (mm)</label>
              <input type="number" className="input input--compact" value={sheetLayout.h_gap_mm}
                onChange={e => setSheetLayout({ h_gap_mm: +e.target.value })} min={0} step={0.5} />
            </div>
            <div>
              <label className="input-label">V Gap (mm)</label>
              <input type="number" className="input input--compact" value={sheetLayout.v_gap_mm}
                onChange={e => setSheetLayout({ v_gap_mm: +e.target.value })} min={0} step={0.5} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, textAlign: 'center', fontWeight: 500 }}>
            {sheetLayout.cols * sheetLayout.rows} labels per print sheet
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn--secondary"
            style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Maximize2 size={14} /> Expand Preview
          </button>
        </div>

        <AnimatePresence>
          {showModal && <SheetPreview label={label} layout={sheetLayout} setSheetLayout={setSheetLayout} onClose={() => setShowModal(false)} />}
        </AnimatePresence>
      </div>
    );
  }

  const update = (updates: Record<string, any>) => updateElement(elem.id, updates);

  const alignTo = (axis: string) => {
    const lw = label.width_mm;
    const lh = label.height_mm;
    const ew = elem.width_mm;
    const eh = elem.height_mm;
    switch (axis) {
      case 'left': update({ x_mm: 0 }); break;
      case 'hcenter': update({ x_mm: (lw - ew) / 2 }); break;
      case 'right': update({ x_mm: lw - ew }); break;
      case 'top': update({ y_mm: 0 }); break;
      case 'vcenter': update({ y_mm: (lh - eh) / 2 }); break;
      case 'bottom': update({ y_mm: lh - eh }); break;
    }
  };

  return (
    <div className="animate-in" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="panel-section" style={{ borderBottom: '1px solid #ebebeb', paddingBottom: 20, marginBottom: 16 }}>
        <div className="panel-section__title" style={{ textAlign: 'center', marginBottom: 4, fontSize: 13, color: '#999', letterSpacing: '0.05em' }}>
          {elem.type.toUpperCase()}
        </div>
        {elem.name && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginBottom: 12 }}>{elem.name}</div>
        )}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button className="btn btn--ghost btn--icon" onClick={() => duplicateElement(elem.id)} data-tooltip-bottom="Duplicate">
            <Copy size={18} strokeWidth={2} color="#1a1a1a" />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => reorderElement(elem.id, 'up')} data-tooltip-bottom="Bring Forward">
            <ArrowUp size={18} strokeWidth={2} color="#1a1a1a" />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => reorderElement(elem.id, 'down')} data-tooltip-bottom="Send Back">
            <ArrowDown size={18} strokeWidth={2} color="#1a1a1a" />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => removeElement(elem.id)} data-tooltip-bottom="Delete">
            <Trash2 size={18} strokeWidth={2} color="#ef4444" />
          </button>
        </div>
      </div>

      {/* Position */}
      <div className="panel-section">
        <div className="panel-section__title">Position</div>
        <div className="input-row">
          <div>
            <label className="input-label">X (mm)</label>
            <input type="number" className="input input--compact" value={elem.x_mm}
              onChange={e => update({ x_mm: +e.target.value })} step={0.5} />
          </div>
          <div>
            <label className="input-label">Y (mm)</label>
            <input type="number" className="input input--compact" value={elem.y_mm}
              onChange={e => update({ y_mm: +e.target.value })} step={0.5} />
          </div>
        </div>
        <div className="input-row">
          <div>
            <label className="input-label">Width (mm)</label>
            <input type="number" className="input input--compact" value={elem.width_mm}
              onChange={e => update({ width_mm: +e.target.value })} min={1} step={0.5} />
          </div>
          <div>
            <label className="input-label">Height (mm)</label>
            <input type="number" className="input input--compact" value={elem.height_mm}
              onChange={e => update({ height_mm: +e.target.value })} min={1} step={0.5} />
          </div>
        </div>
        <div className="input-row">
          <div>
            <label className="input-label">Angle (°)</label>
            <input type="number" className="input input--compact" value={Math.round(elem.rotation || 0)}
              onChange={e => update({ rotation: +e.target.value })} step={1} />
          </div>
          <div>
            <label className="input-label">Opacity (%)</label>
            <input type="number" className="input input--compact" value={elem.opacity ?? 100}
              onChange={e => update({ opacity: +e.target.value })} min={0} max={100} step={5} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
            <input type="checkbox" checked={elem.locked} onChange={e => update({ locked: e.target.checked })} />
            {elem.locked ? <Lock size={12} /> : <Unlock size={12} />} Locked
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
            <input type="checkbox" checked={elem.do_not_print} onChange={e => update({ do_not_print: e.target.checked })} />
            <EyeOff size={12} /> Do Not Print
          </label>
        </div>

        {/* Align to Canvas */}
        <div style={{ marginTop: 12 }}>
          <label className="input-label" style={{ marginBottom: 6 }}>Align to Canvas</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('left')} title="Left"><AlignStartVertical size={13} /></button>
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('hcenter')} title="Center H"><AlignCenterVertical size={13} /></button>
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('right')} title="Right"><AlignEndVertical size={13} /></button>
            <div style={{ width: 1, background: '#e0e0e0', margin: '0 2px' }} />
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('top')} title="Top"><AlignStartHorizontal size={13} /></button>
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('vcenter')} title="Center V"><AlignCenterHorizontal size={13} /></button>
            <button className="btn btn--ghost btn--icon" style={{ flex: 1, height: 28 }} onClick={() => alignTo('bottom')} title="Bottom"><AlignEndHorizontal size={13} /></button>
          </div>
        </div>
      </div>

      {/* Text Properties */}
      {(elem.type === 'text' || elem.type === 'barcode' || elem.type === 'qrcode') && (
        <div className="panel-section">
          <div className="panel-section__title">Content</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="input-label" style={{ marginBottom: 0 }}>
                {elem.type === 'text' ? 'Value' : 'Data to Encode'}
              </label>
              <button 
                className="btn btn--ghost btn--compact" 
                style={{ fontSize: 10, height: 20, padding: '0 8px', color: '#6366f1' }}
                onClick={() => {
                  const el = document.getElementById('binding-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Hash size={10} style={{ marginRight: 4 }} /> 
                {bindings.some(b => b.fieldId === elem.id) ? 'Change Binding' : 'Connect Serial/Data'}
              </button>
            </div>
            <input className="input" value={elem.value ?? ''} onChange={e => update({ value: e.target.value })}
              placeholder={elem.type === 'qrcode' ? 'e.g. https://omg.com' : 'e.g. 12345678'} />
            {bindings.some(b => b.fieldId === elem.id) && (
               <div style={{ marginTop: 4, fontSize: 10, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: '#6366f1' }} />
                  Linked to {bindings.find(b => b.fieldId === elem.id)?.type === 'serial' ? 'Serial Number' : 'Data Source'}
               </div>
            )}
          </div>

          {elem.type === 'text' && (
            <>
              <div className="input-row">
                <div>
                  <label className="input-label">Font</label>
                  <select className="select" value={elem.font_name || 'Helvetica'} onChange={e => update({ font_name: e.target.value })}>
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Weight</label>
                  <select className="select" value={elem.font_weight || '400'} onChange={e => update({ font_weight: e.target.value })}>
                    {WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="input-row">
                <div>
                  <label className="input-label">Size</label>
                  <input type="number" className="input input--compact" value={elem.font_size ?? 12}
                    onChange={e => update({ font_size: +e.target.value })} min={4} max={200} />
                </div>
                <div>
                  <label className="input-label">Align</label>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 2, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    <button className={`btn btn--icon ${elem.align === 'left' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => update({ align: 'left' })} style={{ minWidth: 28, height: 28 }}><AlignLeft size={14} /></button>
                    <button className={`btn btn--icon ${elem.align === 'center' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => update({ align: 'center' })} style={{ minWidth: 28, height: 28 }}><AlignCenter size={14} /></button>
                    <button className={`btn btn--icon ${elem.align === 'right' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => update({ align: 'right' })} style={{ minWidth: 28, height: 28 }}><AlignRight size={14} /></button>
                  </div>
                </div>
              </div>
              <div className="input-row">
                <div>
                  <label className="input-label">V-Align</label>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 2, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    {(['top', 'middle', 'bottom'] as const).map(va => (
                      <button key={va} className={`btn btn--icon ${(elem.vertical_align || 'top') === va ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => update({ vertical_align: va })}
                        style={{ minWidth: 28, height: 28, fontSize: 13, fontWeight: 600 }}>
                        {va[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="input-label">Overflow</label>
                  <select className="select" value={elem.overflow_mode || 'shrink'}
                    onChange={e => update({ overflow_mode: e.target.value })}>
                    <option value="shrink">Auto Shrink</option>
                    <option value="wrap">Wrap Only</option>
                    <option value="strict">Strict (Error)</option>
                    <option value="expand">Expand</option>
                  </select>
                </div>
              </div>

              {/* Text decorations & effects */}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 8 }}>
                <button className={`btn btn--icon ${elem.font_italic ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ font_italic: !elem.font_italic })} style={{ minWidth: 28, height: 28 }}
                  title="Italic"><Italic size={14} /></button>
                <button className={`btn btn--icon ${elem.underline ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ underline: !elem.underline })} style={{ minWidth: 28, height: 28 }}
                  title="Underline"><Underline size={14} /></button>
                <button className={`btn btn--icon ${elem.strikeout ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ strikeout: !elem.strikeout })} style={{ minWidth: 28, height: 28 }}
                  title="Strikeout"><Strikethrough size={14} /></button>
                <button className={`btn btn--icon ${elem.inverse ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ inverse: !elem.inverse })} style={{ minWidth: 28, height: 28 }}
                  title="Inverse"><Type size={14} /></button>
                <button className={`btn btn--icon ${elem.mirror ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ mirror: !elem.mirror })} style={{ minWidth: 28, height: 28 }}
                  title="Mirror"><FlipHorizontal size={14} /></button>
                <button className={`btn btn--icon ${elem.justify ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => update({ justify: !elem.justify })} style={{ minWidth: 28, height: 28 }}
                  title="Justify"><AlignCenter size={14} /></button>
              </div>

              {/* Spacing */}
              <div className="input-row">
                <div>
                  <label className="input-label">Char Space (mm)</label>
                  <input type="number" className="input input--compact" value={elem.char_spacing_mm ?? 0}
                    onChange={e => update({ char_spacing_mm: +e.target.value })} min={0} step={0.1} />
                </div>
                <div>
                  <label className="input-label">Line Space (mm)</label>
                  <input type="number" className="input input--compact" value={elem.line_spacing_mm ?? 0}
                    onChange={e => update({ line_spacing_mm: +e.target.value })} min={0} step={0.1} />
                </div>
              </div>

              {/* Min font size for shrink mode */}
              {(elem.overflow_mode === 'shrink') && (
                <div>
                  <label className="input-label">Min Font Size (mm)</label>
                  <input type="number" className="input input--compact" value={elem.min_font_size_mm ?? 1.0}
                    onChange={e => update({ min_font_size_mm: +e.target.value })} min={0.5} step={0.25} />
                </div>
              )}

              {/* Color */}
              <div className="input-row">
                <div>
                  <label className="input-label">Color</label>
                  <div className="color-input">
                    <div className="color-input__swatch">
                      <input type="color" value={elem.color || '#000000'} onChange={e => update({ color: e.target.value })} />
                    </div>
                    <input className="input input--compact" value={elem.color || '#000000'}
                      onChange={e => update({ color: e.target.value })}
                      style={{ flex: 1, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} />
                  </div>
                </div>
                <div>
                  <label className="input-label">Background</label>
                  <div className="color-input">
                    <div className="color-input__swatch">
                      <input type="color" value={elem.background_color === 'transparent' ? '#ffffff' : elem.background_color}
                        onChange={e => update({ background_color: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Border */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={elem.border_enabled} onChange={e => update({ border_enabled: e.target.checked })} />
                Show Border
              </label>
            </>
          )}

          {/* Barcode/QR settings */}
          {(elem.type === 'barcode' || elem.type === 'qrcode') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {(!elem.value && !bindings.some(b => b.fieldId === elem.id)) && (
                <Alert layout="row" variant="warning" icon={<TriangleAlert size={16} strokeWidth={2} />}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>Barcode data is missing!</p>
                </Alert>
              )}
              <div>
                <label className="input-label">Symbology</label>
                <select className="select" value={elem.symbology || (elem.type === 'qrcode' ? 'qrcode' : 'code128')} onChange={e => update({ symbology: e.target.value })}>
                  <option value="code128">Code 128</option><option value="code39">Code 39</option>
                  <option value="ean13">EAN-13</option><option value="ean8">EAN-8</option>
                  <option value="itf14">ITF-14</option><option value="qrcode">QR Code</option>
                  <option value="datamatrix">DataMatrix</option><option value="pdf417">PDF417</option>
                  <option value="gs1_128">GS1-128</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.show_text} onChange={e => update({ show_text: e.target.checked })} />
                  Show Text
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.text_on_top} onChange={e => update({ text_on_top: e.target.checked })} />
                  Text on Top
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.auto_font_scale} onChange={e => update({ auto_font_scale: e.target.checked })} />
                  Auto Scale
                </label>
              </div>
              {!elem.auto_font_scale && (
                <div>
                  <label className="input-label">Text Font Size (mm)</label>
                  <input type="number" className="input input--compact" value={elem.text_font_size_mm ?? 2.5}
                    onChange={e => update({ text_font_size_mm: +e.target.value })} min={0.5} step={0.25} />
                </div>
              )}
              <div className="input-row">
                <div>
                  <label className="input-label">Text Font</label>
                  <select className="select" value={elem.text_font_name || 'Helvetica'} onChange={e => update({ text_font_name: e.target.value })}>
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Text Align</label>
                  <select className="select" value={elem.text_anchor || 'center'} onChange={e => update({ text_anchor: e.target.value })}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                </div>
              </div>
              <div className="input-row">
                <div>
                  <label className="input-label">Rotation</label>
                  <select className="select" value={elem.barcode_rotation || 0} onChange={e => update({ barcode_rotation: +e.target.value })}>
                    <option value={0}>0°</option><option value={90}>90°</option>
                    <option value={180}>180°</option><option value={270}>270°</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Text Margin (mm)</label>
                  <input type="number" className="input input--compact" value={elem.barcode_text_margin_mm ?? 1.0}
                    onChange={e => update({ barcode_text_margin_mm: +e.target.value })} min={-10} max={20} step={0.5} />
                </div>
              </div>
              <div className="input-row">
                <div>
                  <label className="input-label">X Dim (mil)</label>
                  <input type="number" className="input input--compact" value={elem.x_dimension_mil ?? 13.33}
                    onChange={e => update({ x_dimension_mil: +e.target.value })} min={1} step={0.5} />
                </div>
                <div style={{ flex: 1 }}></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.text_font_bold} onChange={e => update({ text_font_bold: e.target.checked })} />
                  Bold
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.text_font_italic} onChange={e => update({ text_font_italic: e.target.checked })} />
                  Italic
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.lock_bar_size} onChange={e => update({ lock_bar_size: e.target.checked })} />
                  Lock Size
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={elem.user_input} onChange={e => update({ user_input: e.target.checked })} />
                  User Input
                </label>
              </div>
              {elem.text_format !== undefined && (
                <div>
                  <label className="input-label">Text Format Mask</label>
                  <input className="input input--compact" value={elem.text_format ?? ''}
                    onChange={e => update({ text_format: e.target.value })}
                    placeholder="e.g. ###-###-###" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image Upload */}
      {elem.type === 'image' && (
        <div className="panel-section">
          <div className="panel-section__title">Image</div>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: 100, border: '1px dashed #ccc', borderRadius: 8, background: '#fcfcfc',
            cursor: 'pointer', transition: 'all 0.2s', marginTop: 8
          }}>
            <ImagePlus size={24} color="#888" style={{ marginBottom: 8 }} />
            <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>Click to Upload</span>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/bmp" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  if (ev.target?.result && typeof ev.target.result === 'string') {
                    const b64 = ev.target.result;
                    const img = new Image();
                    img.onload = () => {
                      const aspect = img.naturalHeight / img.naturalWidth;
                      update({ value: b64, height_mm: elem.width_mm * aspect });
                    };
                    img.src = b64;
                  }
                };
                reader.readAsDataURL(file);
              }} />
          </label>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={elem.maintain_aspect_ratio}
                onChange={e => update({ maintain_aspect_ratio: e.target.checked })} />
              Maintain Aspect Ratio
            </label>
            <div>
              <label className="input-label">Fit Mode</label>
              <select className="select" value={elem.image_fit_mode || 'fit'}
                onChange={e => update({ image_fit_mode: e.target.value })}>
                <option value="stretch">Stretch</option>
                <option value="fit">Fit</option>
                <option value="tile">Tile</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={elem.monochrome}
                onChange={e => update({ monochrome: e.target.checked })} />
              Monochrome (B&W)
            </label>
          </div>
        </div>
      )}

      {/* Shape / Line Properties */}
      {(elem.type === 'rect' || elem.type === 'line' || elem.type === 'circle') && (
        <div className="panel-section">
          <div className="panel-section__title">Style</div>
          <div className="input-row">
            <div>
              <label className="input-label">Stroke Color</label>
              <div className="color-input">
                <div className="color-input__swatch">
                  <input type="color" value={elem.border_color || '#000000'} onChange={e => update({ border_color: e.target.value })} />
                </div>
              </div>
            </div>
            <div>
              <label className="input-label">Width (mm)</label>
              <input type="number" className="input input--compact" value={elem.border_width ?? 1}
                onChange={e => update({ border_width: +e.target.value })} min={0} max={10} step={0.5} />
            </div>
          </div>
          <div className="input-row">
            <div>
              <label className="input-label">Style</label>
              <select className="select" value={elem.line_style || 'solid'}
                onChange={e => update({ line_style: e.target.value })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="dash-dot">Dash-Dot</option>
              </select>
            </div>
            {elem.type === 'line' && (
              <div>
                <label className="input-label">Cap</label>
                <select className="select" value={elem.line_cap || 'square'}
                  onChange={e => update({ line_cap: e.target.value })}>
                  <option value="square">Square</option>
                  <option value="round">Round</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
            )}
          </div>
          {elem.type === 'rect' && (
            <div>
              <label className="input-label">Corner Radius (mm)</label>
              <input type="number" className="input input--compact" value={elem.corner_radius_mm ?? 0}
                onChange={e => update({ corner_radius_mm: +e.target.value })} min={0} max={50} step={0.5} />
            </div>
          )}
          {(elem.type === 'rect' || elem.type === 'circle') && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={elem.filled} onChange={e => update({ filled: e.target.checked })} /> Filled
              </label>
              {elem.filled && (
                <div>
                  <label className="input-label">Fill Color</label>
                  <div className="color-input">
                    <div className="color-input__swatch">
                      <input type="color" value={elem.fill_color || '#ffffff'} onChange={e => update({ fill_color: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Binding */}
      {(elem.type === 'text' || elem.type === 'barcode' || elem.type === 'qrcode') && (
        <div id="binding-section">
          <BindingPanel />
        </div>
      )}
    </div>
  );
}
