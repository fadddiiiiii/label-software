// src/renderer/components/home/HomePage.tsx — Premium Photoshop/Figma-like Welcome
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Plus, Settings, FolderOpen, Trash2,
  FileText, Tag, Truck, Package, Diamond, Wine, Circle, Pencil,
  ArrowRight, Sparkles, Layout, Database, Upload,
  FileSpreadsheet, ChevronLeft, ChevronRight, X, Check, AlertCircle,
  Users, Sliders
} from 'lucide-react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { useTabsStore } from '../../store/tabs';
import { useDataStore } from '../../store/data';
import { invokeIPC, loadTemplate } from '../../hooks/useIPC';
import { getRecentFiles, addRecentFile, removeRecentFile, formatRelativeTime, RecentFile } from '../../lib/recentFiles';
import { SettingsContent } from '../settings/SettingsPanel';
import { useSettingsStore } from '../../store/settings';

// ═══════════════════════════════════════════════════════════════════
// Holographic Card
// ═══════════════════════════════════════════════════════════════════

function HolographicCard({ children, onClick, style }: {
  children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const rx = (y - cy) / 10, ry = (cx - x) / 10;
    ref.current.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
    ref.current.style.boxShadow = `0 12px 40px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)`;
    if (glowRef.current) {
      glowRef.current.style.background = `radial-gradient(circle at ${(x/rect.width)*100}% ${(y/rect.height)*100}%, rgba(0,0,0,0.06), transparent 60%)`;
      glowRef.current.style.opacity = '1';
    }
  };
  const handleMouseLeave = () => {
    if (!ref.current) return;
    ref.current.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
    ref.current.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
  };

  return (
      <div ref={ref} onClick={onClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', ...style,
      }}>
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', transition: 'opacity 0.3s ease', borderRadius: 16 }} />
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Custom Blank Card (Magical Transition)
// ═══════════════════════════════════════════════════════════════════

function CustomBlankCard({ onSelect, onSave }: { 
  onSelect: (w: number, h: number) => void,
  onSave?: (w: number, h: number) => void 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [w, setW] = useState(100);
  const [h, setH] = useState(70);

  const handleCreate = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    onSelect(w, h);
    if (onSave) onSave(w, h);
  };

  return (
    <HolographicCard 
      onClick={() => !isExpanded && setIsExpanded(true)} 
      style={{ padding: 0, minHeight: 180, position: 'relative' }}
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}
          >
            <TemplatePreview width={100} height={70} shape="rect" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
              <Pencil size={16} strokeWidth={1.5} color="var(--text-muted)" />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Custom Blank</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Set your own size</div>
          </motion.div>
        ) : (
          <motion.div 
            key="input"
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, textAlign: 'center' }}>Custom Size (mm)</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Width</div>
                <input 
                  type="number" 
                  value={w} 
                  onChange={e => setW(Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px', fontSize: 13, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Height</div>
                <input 
                  type="number" 
                  value={h} 
                  onChange={e => setH(Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px', fontSize: 13, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Create
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </HolographicCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Template Preview Component
// ═══════════════════════════════════════════════════════════════════

function TemplatePreview({ width, height, shape, elements }: { width: number, height: number, shape: string, elements?: any[] }) {
  const containerW = 120;
  const containerH = 80;
  const scale = Math.min((containerW - 20) / width, (containerH - 20) / height);
  const w = width * scale;
  const h = height * scale;

  return (
    <div style={{ width: containerW, height: containerH, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', borderRadius: 12, marginBottom: 16 }}>
      <div style={{ 
        width: w, height: h, background: 'var(--bg-surface)', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        borderRadius: shape === 'ellipse' ? '50%' : 4, 
        position: 'relative', overflow: 'hidden',
        border: '1px solid var(--border-subtle)'
      }}>
        {elements?.map((el, i) => {
          const elX = el.x_mm * scale;
          const elY = el.y_mm * scale;
          const elW = el.width_mm * scale;
          const elH = (el.height_mm || 1) * scale;
          
          let bgColor = '#e0e0e0';
          if (el.type === 'barcode') bgColor = '#555';
          if (el.type === 'qrcode') bgColor = '#333';
          if (el.type === 'line') bgColor = '#888';
          if (el.type === 'rect' && el.fill_color) bgColor = el.fill_color;

          return (
            <div key={i} style={{
              position: 'absolute', 
              left: elX, 
              top: elY, 
              width: elW, 
              height: elH,
              background: bgColor,
              borderRadius: el.type === 'qrcode' ? 1 : 0.5,
              opacity: 0.8,
              transform: `rotate(${el.rotation || 0}deg)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              padding: el.type === 'barcode' ? 1 : 0
            }}>
              {el.type === 'barcode' && [1,2,3,4].map(j => <div key={j} style={{ flex: 1, background: '#fff', opacity: 0.3 }} />)}
            </div>
          );
        })}
        {!elements && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eee', fontSize: 10, fontWeight: 700 }}>
             {width}×{height}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Presets
// ═══════════════════════════════════════════════════════════════════

const STARTER_TEMPLATES = [
  { 
    name: 'Shipping Label', icon: Truck, width: 100, height: 150, desc: 'Professional shipping layout', shape: 'rect' as const,
    elements: [
      { id: 'header_rect', type: 'rect', x_mm: 5, y_mm: 5, width_mm: 90, height_mm: 20, rotation: 0, z_index: 0, locked: false, border_color: '#000000', fill_color: '#f0f0f0', filled: true, border_width: 1 },
      { id: 'header_text', type: 'text', x_mm: 10, y_mm: 8, width_mm: 80, height_mm: 10, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 16, font_weight: 'bold', align: 'center', color: '#000000', value: 'PRIORITY MAIL' },
      { id: 'from_label', type: 'text', x_mm: 5, y_mm: 30, width_mm: 40, height_mm: 5, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 8, font_weight: 'bold', align: 'left', color: '#000000', value: 'FROM:' },
      { id: 'from_text', type: 'text', x_mm: 5, y_mm: 35, width_mm: 40, height_mm: 20, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 10, align: 'left', color: '#000000', value: 'John Doe\n123 Logistics Way\nWarehouse City, ST 12345' },
      { id: 'to_label', type: 'text', x_mm: 10, y_mm: 65, width_mm: 80, height_mm: 8, rotation: 0, z_index: 4, locked: false, font_name: 'Helvetica', font_size: 12, font_weight: 'bold', align: 'left', color: '#000000', value: 'SHIP TO:' },
      { id: 'to_text', type: 'text', x_mm: 10, y_mm: 75, width_mm: 80, height_mm: 30, rotation: 0, z_index: 5, locked: false, font_name: 'Helvetica', font_size: 14, align: 'left', color: '#000000', value: 'Jane Smith\n456 Destination Ave\nCustomer Town, ST 67890' },
      { id: 'tracking_barcode', type: 'barcode', x_mm: 10, y_mm: 115, width_mm: 80, height_mm: 25, rotation: 0, z_index: 6, locked: false, symbology: 'code128', show_text: true, value: 'ZX987654321US' },
    ]
  },
  { 
    name: 'Inventory Tag', icon: Package, width: 100, height: 70, desc: 'Large barcode & SKU', shape: 'rect' as const,
    elements: [
      { id: 'title', type: 'text', x_mm: 5, y_mm: 5, width_mm: 90, height_mm: 10, rotation: 0, z_index: 0, locked: false, font_name: 'Helvetica', font_size: 18, font_weight: 'bold', align: 'center', color: '#000000', value: 'PRODUCT SPECIFICATION' },
      { id: 'line_top', type: 'line', x_mm: 5, y_mm: 16, width_mm: 90, height_mm: 1, rotation: 0, z_index: 1, locked: false, border_color: '#000000', border_width: 2 },
      { id: 'sku_label', type: 'text', x_mm: 5, y_mm: 22, width_mm: 20, height_mm: 6, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 10, font_weight: 'bold', align: 'left', color: '#000000', value: 'SKU:' },
      { id: 'sku_val', type: 'text', x_mm: 25, y_mm: 22, width_mm: 70, height_mm: 6, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 12, align: 'left', color: '#000000', value: 'MOD-LNK-2024' },
      { id: 'desc_label', type: 'text', x_mm: 5, y_mm: 30, width_mm: 20, height_mm: 6, rotation: 0, z_index: 4, locked: false, font_name: 'Helvetica', font_size: 10, font_weight: 'bold', align: 'left', color: '#000000', value: 'DESC:' },
      { id: 'desc_val', type: 'text', x_mm: 25, y_mm: 30, width_mm: 70, height_mm: 10, rotation: 0, z_index: 5, locked: false, font_name: 'Helvetica', font_size: 10, align: 'left', color: '#000000', value: 'High-performance modular link system with advanced connectivity.' },
      { id: 'barcode', type: 'barcode', x_mm: 15, y_mm: 45, width_mm: 70, height_mm: 20, rotation: 0, z_index: 6, locked: false, symbology: 'code128', show_text: true, value: 'P12345678' },
    ]
  },
  { 
    name: 'Asset Tag', icon: Diamond, width: 50, height: 25, desc: 'Compact QR layout', shape: 'rect' as const,
    elements: [
      { id: 'qr', type: 'qrcode', x_mm: 3, y_mm: 3, width_mm: 19, height_mm: 19, rotation: 0, z_index: 0, locked: false, symbology: 'qrcode', show_text: false, value: 'ASSET-BRC-001' },
      { id: 'prop_text', type: 'text', x_mm: 24, y_mm: 5, width_mm: 23, height_mm: 5, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 7, font_weight: 'bold', align: 'left', color: '#000000', value: 'PROPERTY OF' },
      { id: 'org_text', type: 'text', x_mm: 24, y_mm: 10, width_mm: 23, height_mm: 6, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 9, font_weight: 'bold', align: 'left', color: '#1a1a1a', value: 'OMG' },
      { id: 'id_text', type: 'text', x_mm: 24, y_mm: 17, width_mm: 23, height_mm: 4, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 7, align: 'left', color: '#666', value: 'ID: 2024-001' },
    ]
  },
  { 
    name: 'Price Tag', icon: Tag, width: 40, height: 60, desc: 'Vertical product tag', shape: 'rect' as const,
    elements: [
      { id: 'logo', type: 'text', x_mm: 5, y_mm: 5, width_mm: 30, height_mm: 5, rotation: 0, z_index: 0, locked: false, font_name: 'Helvetica', font_size: 10, font_weight: 'bold', align: 'center', color: '#333', value: 'BOUTIQUE' },
      { id: 'line', type: 'line', x_mm: 5, y_mm: 12, width_mm: 30, height_mm: 1, rotation: 0, z_index: 1, locked: false, border_color: '#ccc', border_width: 1 },
      { id: 'name', type: 'text', x_mm: 5, y_mm: 18, width_mm: 30, height_mm: 10, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 12, align: 'center', color: '#000', value: 'Silk Summer Dress' },
      { id: 'price', type: 'text', x_mm: 5, y_mm: 32, width_mm: 30, height_mm: 8, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 16, font_weight: 'bold', align: 'center', color: '#ef4444', value: '$129.00' },
      { id: 'barcode', type: 'barcode', x_mm: 5, y_mm: 45, width_mm: 30, height_mm: 10, rotation: 0, z_index: 4, locked: false, symbology: 'ean13', show_text: true, value: '1234567890123' },
    ]
  },
  { 
    name: 'Visitor Badge', icon: Users, width: 100, height: 70, desc: 'Event / Office ID', shape: 'rect' as const,
    elements: [
      { id: 'header', type: 'rect', x_mm: 0, y_mm: 0, width_mm: 100, height_mm: 12, rotation: 0, z_index: 0, locked: false, fill_color: '#1a1a1a', filled: true },
      { id: 'header_text', type: 'text', x_mm: 10, y_mm: 3, width_mm: 80, height_mm: 6, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 10, font_weight: 'bold', align: 'center', color: '#ffffff', value: 'VISITOR PASS' },
      { id: 'name_label', type: 'text', x_mm: 10, y_mm: 20, width_mm: 80, height_mm: 4, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 8, color: '#888', value: 'NAME' },
      { id: 'name_val', type: 'text', x_mm: 10, y_mm: 25, width_mm: 80, height_mm: 12, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 18, font_weight: 'bold', align: 'left', color: '#000', value: 'RICHARD HENDRICKS' },
      { id: 'company_label', type: 'text', x_mm: 10, y_mm: 38, width_mm: 80, height_mm: 4, rotation: 0, z_index: 4, locked: false, font_name: 'Helvetica', font_size: 8, color: '#888', value: 'COMPANY' },
      { id: 'company_val', type: 'text', x_mm: 10, y_mm: 43, width_mm: 80, height_mm: 8, rotation: 0, z_index: 5, locked: false, font_name: 'Helvetica', font_size: 12, align: 'left', color: '#333', value: 'Pied Piper' },
      { id: 'qr', type: 'qrcode', x_mm: 75, y_mm: 45, width_mm: 20, height_mm: 20, rotation: 0, z_index: 6, locked: false, value: 'VISITOR-882' },
    ]
  },
  { 
    name: 'Boutique Wine', icon: Wine, width: 70, height: 100, desc: 'Elegant vertical label', shape: 'rect' as const,
    elements: [
      { id: 'border', type: 'rect', x_mm: 3, y_mm: 3, width_mm: 64, height_mm: 94, rotation: 0, z_index: 0, locked: false, border_color: '#9c4221', border_width: 2 },
      { id: 'estate', type: 'text', x_mm: 5, y_mm: 15, width_mm: 60, height_mm: 6, rotation: 0, z_index: 1, locked: false, font_name: 'Times New Roman', font_size: 10, align: 'center', color: '#9c4221', value: 'HERITAGE ESTATE' },
      { id: 'varietal', type: 'text', x_mm: 5, y_mm: 28, width_mm: 60, height_mm: 12, rotation: 0, z_index: 2, locked: false, font_name: 'Times New Roman', font_size: 22, font_weight: 'bold', align: 'center', color: '#000', value: 'Cabernet' },
      { id: 'year', type: 'text', x_mm: 5, y_mm: 42, width_mm: 60, height_mm: 6, rotation: 0, z_index: 3, locked: false, font_name: 'Times New Roman', font_size: 14, align: 'center', color: '#000', value: '2024' },
      { id: 'sep', type: 'line', x_mm: 15, y_mm: 55, width_mm: 40, height_mm: 1, rotation: 0, z_index: 4, locked: false, border_color: '#9c4221', border_width: 0.5 },
      { id: 'desc', type: 'text', x_mm: 10, y_mm: 65, width_mm: 50, height_mm: 12, rotation: 0, z_index: 5, locked: false, font_name: 'Times New Roman', font_size: 8, align: 'center', color: '#555', value: 'Hand-picked from our oldest vineyards in the valley. Aged 18 months in French oak.' },
      { id: 'barcode', type: 'barcode', x_mm: 15, y_mm: 85, width_mm: 40, height_mm: 8, rotation: 0, z_index: 6, locked: false, symbology: 'upca', value: '012345678905' },
    ]
  },
  { 
    name: 'Equipment Wrap', icon: Sliders, width: 100, height: 20, desc: 'Cable / Asset wrap', shape: 'rect' as const,
    elements: [
      { id: 'color_strip', type: 'rect', x_mm: 0, y_mm: 0, width_mm: 10, height_mm: 20, rotation: 0, z_index: 0, locked: false, fill_color: '#fbbf24', filled: true },
      { id: 'tag', type: 'text', x_mm: 12, y_mm: 4, width_mm: 60, height_mm: 5, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 10, font_weight: 'bold', align: 'left', color: '#000', value: 'PDU-UNIT-1042-B' },
      { id: 'loc', type: 'text', x_mm: 12, y_mm: 10, width_mm: 60, height_mm: 5, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 8, align: 'left', color: '#666', value: 'RACK 4 // LEVEL 12' },
      { id: 'qr', type: 'qrcode', x_mm: 82, y_mm: 2, width_mm: 16, height_mm: 16, rotation: 0, z_index: 3, locked: false, value: 'ID-1042-B' },
    ]
  },
  { 
    name: 'Retail Price', icon: Tag, width: 40, height: 60, desc: 'Compact retail tag', shape: 'rect' as const,
    elements: [
      { id: 'brand', type: 'text', x_mm: 5, y_mm: 5, width_mm: 30, height_mm: 4, rotation: 0, z_index: 0, locked: false, font_name: 'Helvetica', font_size: 8, font_weight: 'bold', align: 'center', color: '#000', value: 'MODERN WEAR' },
      { id: 'item', type: 'text', x_mm: 5, y_mm: 10, width_mm: 30, height_mm: 10, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 10, align: 'center', color: '#666', value: 'Linen Shirt M' },
      { id: 'price_box', type: 'rect', x_mm: 5, y_mm: 25, width_mm: 30, height_mm: 15, rotation: 0, z_index: 2, locked: false, fill_color: '#000', filled: true },
      { id: 'price_text', type: 'text', x_mm: 5, y_mm: 28, width_mm: 30, height_mm: 10, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 14, font_weight: 'bold', align: 'center', color: '#fff', value: '$45.00' },
      { id: 'barcode', type: 'barcode', x_mm: 5, y_mm: 45, width_mm: 30, height_mm: 10, rotation: 0, z_index: 4, locked: false, symbology: 'ean8', value: '12345670' },
    ]
  },
  { 
    name: 'Address Label', icon: FileText, width: 90, height: 38, desc: 'Standard mailing (3-1/2" × 1-1/2")', shape: 'rect' as const,
    elements: [
      { id: 'ret_text', type: 'text', x_mm: 5, y_mm: 3, width_mm: 40, height_mm: 8, rotation: 0, z_index: 0, locked: false, font_name: 'Helvetica', font_size: 6, align: 'left', color: '#444', value: 'Sender Name\n123 Business Road\nCity, ST 00000' },
      { id: 'to_text', type: 'text', x_mm: 15, y_mm: 15, width_mm: 60, height_mm: 15, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 11, align: 'left', color: '#000', value: 'RECIPIENT NAME\n456 DELIVERY ST APT 12B\nSUNRISE CITY CA 90210' },
      { id: 'imb', type: 'barcode', x_mm: 15, y_mm: 31, width_mm: 60, height_mm: 4, rotation: 0, z_index: 2, locked: false, symbology: 'usps-imb', value: '00123456789012345678' },
    ]
  },
  { 
    name: 'Clinical Specimen', icon: AlertCircle, width: 50, height: 25, desc: 'Lab / Patient ID', shape: 'rect' as const,
    elements: [
      { id: 'id_box', type: 'rect', x_mm: 2, y_mm: 2, width_mm: 46, height_mm: 6, rotation: 0, z_index: 0, locked: false, border_color: '#ef4444', border_width: 1 },
      { id: 'id_text', type: 'text', x_mm: 5, y_mm: 3, width_mm: 40, height_mm: 4, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 8, font_weight: 'bold', align: 'center', color: '#ef4444', value: 'SPECIMEN: #ABC-9912' },
      { id: 'pat_text', type: 'text', x_mm: 3, y_mm: 10, width_mm: 25, height_mm: 4, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica', font_size: 7, align: 'left', color: '#000', value: 'Patient: DOE, JOHN' },
      { id: 'dob_text', type: 'text', x_mm: 3, y_mm: 14, width_mm: 25, height_mm: 4, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 7, align: 'left', color: '#000', value: 'DOB: 1980-05-22' },
      { id: 'barcode', type: 'barcode', x_mm: 30, y_mm: 10, width_mm: 18, height_mm: 12, rotation: 0, z_index: 4, locked: false, symbology: 'code128', value: '9912-X' },
    ]
  },
  { 
    name: 'Thank You', icon: Sparkles, width: 60, height: 60, desc: 'Round gift sticker', shape: 'ellipse' as const,
    elements: [
      { id: 'circle', type: 'rect', x_mm: 0, y_mm: 0, width_mm: 60, height_mm: 60, rotation: 0, z_index: 0, locked: false, fill_color: '#fff5f5', filled: true, border_color: '#ffc9c9', border_width: 0.5 },
      { id: 'heart', type: 'text', x_mm: 20, y_mm: 12, width_mm: 20, height_mm: 10, rotation: 0, z_index: 1, locked: false, font_name: 'Helvetica', font_size: 24, align: 'center', color: '#ff4d4d', value: '❤' },
      { id: 'thankyou', type: 'text', x_mm: 5, y_mm: 25, width_mm: 50, height_mm: 12, rotation: 0, z_index: 2, locked: false, font_name: 'Helvetica Neue', font_size: 14, font_weight: 'bold', align: 'center', color: '#333', value: 'THANK YOU' },
      { id: 'from', type: 'text', x_mm: 5, y_mm: 40, width_mm: 50, height_mm: 6, rotation: 0, z_index: 3, locked: false, font_name: 'Helvetica', font_size: 9, align: 'center', color: '#888', value: 'FOR YOUR ORDER' },
    ]
  },
];

const BLANK_PRESETS = [
  { name: 'A4 Page', icon: FileText, width: 210, height: 297, desc: '210 × 297 mm', shape: 'rect' as const },
  { name: 'Standard Label', icon: Package, width: 100, height: 70, desc: '100 × 70 mm', shape: 'rect' as const },
  { name: 'Shipping Box', icon: Truck, width: 100, height: 150, desc: '100 × 150 mm', shape: 'rect' as const },
  { name: 'Small Tag', icon: Tag, width: 50, height: 25, desc: '50 × 25 mm', shape: 'rect' as const },
  { name: 'Square Sticker', icon: Circle, width: 50, height: 50, desc: '50 × 50 mm', shape: 'rect' as const },
  { name: 'Round Sticker', icon: Circle, width: 60, height: 60, desc: '60 mm circle', shape: 'ellipse' as const },
];

// ═══════════════════════════════════════════════════════════════════
// Inline CSV Import for Data Page
// ═══════════════════════════════════════════════════════════════════

function DataImportDropzone({ onImport }: { onImport: () => void }) {
  const { addSource } = useDataStore();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string, name: string, internalPath?: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (!lines.length) throw new Error('File is empty');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1, 1001).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      return headers.reduce((acc, h, i) => { acc[h] = vals[i] || ''; return acc; }, {} as any);
    });
    addSource({
      id: `ds_${Date.now().toString(36)}`,
      type: 'csv',
      path: name,
      name,
      columns: headers.map(n => ({ name: n, dtype: 'string' })),
      rowCount: lines.length - 1,
      rows,
      internalPath,
    });
    onImport();
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();
      const internalRes = await (window as any).electron.ipcRenderer.invoke('data:save-internal', { fileName: file.name, content: text });
      
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        parseCSV(text, file.name, internalRes.ok ? internalRes.internalPath : undefined);
      } else if (ext === 'json') {
        const json = JSON.parse(text);
        const records = Array.isArray(json) ? json : json.data || json.records || [];
        if (!records.length) throw new Error('No rows found in JSON');
        const headers = Object.keys(records[0]);
        const internalRes = await (window as any).electron.ipcRenderer.invoke('data:save-internal', { fileName: file.name, content: text });
        
        addSource({
          id: `ds_${Date.now().toString(36)}`,
          type: 'csv',
          path: file.name,
          name: file.name,
          columns: headers.map(n => ({ name: n, dtype: typeof records[0][n] })),
          rowCount: records.length,
          rows: records.slice(0, 1000),
          internalPath: internalRes.ok ? internalRes.internalPath : undefined,
        });
        onImport();
      } else if (ext === 'xlsx' || ext === 'xls') {
        // Excel support in HomePage data manager
        const openRes = await (window as any).electron.ipcRenderer.invoke('data:open', {
          path: internalRes.ok ? internalRes.internalPath : (file as any).path || file.name,
          type: ext,
        });
        if (openRes && !openRes.error) {
          addSource({
            id: `ds_${Date.now().toString(36)}`,
            type: 'excel',
            path: (file as any).path || file.name,
            name: file.name,
            columns: openRes.columns,
            rowCount: openRes.row_count,
            rows: openRes.rows,
            internalPath: internalRes.ok ? internalRes.internalPath : undefined,
          });
          onImport();
        } else {
          throw new Error('Excel parsing failed. Ensure OMG engine is ready.');
        }
      } else {
        throw new Error(`Unsupported file type: .${ext}. Use CSV, Excel, or JSON.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, color: '#b91c1c', fontSize: 13 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      <label
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 160, border: `2px dashed ${dragActive ? 'var(--accent-primary)' : 'var(--border-default)'}`, borderRadius: 14,
          background: dragActive ? 'var(--bg-hover)' : 'var(--bg-surface)', cursor: 'pointer', transition: 'all 0.2s ease',
        }}>
        <input ref={fileInputRef} type="file" accept=".csv,.json,.txt,.tsv" style={{ display: 'none' }}
          onChange={e => { if (e.target.files) processFile(e.target.files[0]); }} />
        <div style={{ width: 48, height: 48, borderRadius: 14, background: dragActive ? 'var(--accent-primary)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, transition: 'background 0.2s' }}>
          <Upload size={22} color={dragActive ? 'var(--text-inverse)' : 'var(--text-secondary)'} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {loading ? 'Importing…' : 'Drop a file or click to browse'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>CSV, Excel, and JSON files supported</div>
      </label>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function HomePage({ onOpenDesigner }: { onOpenDesigner: () => void }) {
  const { newTemplate, setLabel, setElements } = useCanvasStoreCompat();
  const { sources, removeSource, setActiveSource, activeSourceId, currentPreviewRow, setPreviewRow, reloadSources } = useDataStore();
  

  // Auto-reload data sources on mount
  useEffect(() => {
    reloadSources();
  }, []);

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [activeTab, setActiveTab] = useState<'recent' | 'templates' | 'data' | 'settings'>('recent');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [customPresets, setCustomPresets] = useState<any[]>([]);

  // Settings state
  const [settings, setSettings] = useState({
    theme: 'system', language: 'en', units: 'mm',
    dpi: '300', gridSize: '5', snapToGrid: true, showRulers: true, autoSave: '5',
    defaultPrinter: 'Microsoft Print to PDF', defaultSymbology: 'code128',
    hwAcceleration: true, devMode: false,
  });
  const updateSetting = (key: keyof typeof settings, val: any) => setSettings(prev => ({ ...prev, [key]: val }));

  // Load real recent files and custom presets
  useEffect(() => {
    getRecentFiles().then(setRecentFiles);
    invokeIPC<any[]>('app:get-presets').then(setCustomPresets);
  }, []);

  

  const handleDeleteRecent = async (path: string) => {
    await removeRecentFile(path);
    const updated = await getRecentFiles();
    setRecentFiles(updated);
    setDeleteConfirm(null);
  };

  const handleSavePreset = async (width: number, height: number) => {
    const updated = await invokeIPC<any[]>('app:add-preset', {
      name: `Custom ${width}×${height}`,
      width,
      height,
      shape: 'rect',
      desc: `${width}×${height} mm`
    });
    setCustomPresets(updated);
  };

  const handleDeletePreset = async (id: string) => {
    const updated = await invokeIPC<any[]>('app:remove-preset', { id });
    setCustomPresets(updated);
  };

  const handlePreset = async (p: any) => {
    try {
      await useTabsStore.getState().openTab({ type: 'preset', preset: p });
      onOpenDesigner();
    } catch (err) {
      console.error('Failed to open preset:', err);
    }
  };

  const handleOpenFile = async () => {
    const path = await invokeIPC<string | null>('template:open-dialog');
    if (!path) return;
    try {
      await useTabsStore.getState().openTab({ type: 'file', path });
      onOpenDesigner();
    } catch (err) { console.error(err); }
  };

  const handleOpenRecent = async (file: RecentFile) => {
    try {
      await useTabsStore.getState().openTab({ type: 'file', path: file.path });
      // addRecentFile(file) is now handled by the tab store itself
      onOpenDesigner();
    } catch (err) {
      console.error('Failed to open recent file:', err);
    }
  };

  const activeSource = sources.find(s => s.id === (selectedSource || activeSourceId));

  const NAV_ITEMS = [
    { key: 'recent' as const, icon: Clock, label: 'Recent' },
    { key: 'templates' as const, icon: Layout, label: 'New Template' },
    { key: 'data' as const, icon: Database, label: 'Data Manager' },
    { key: 'settings' as const, icon: Settings, label: 'Settings' },
  
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', fontFamily: "'Poppins', sans-serif", background: 'var(--bg-primary)' }}>

      {/* ═══ Sidebar ══════════════════════════════════ */}
      <motion.div
        animate={{ width: sidebarOpen ? 240 : 68 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, padding: '24px 0' }}>

        {/* Brand */}
        <div style={{ padding: '0 16px', marginBottom: 36, display: 'flex', alignItems: 'center', gap: 10, height: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={14} color="var(--text-inverse)" strokeWidth={2.5} />
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>OMG</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>v1.0.0</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button key={item.key} onClick={() => setActiveTab(item.key)} style={{
                display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                background: active ? 'var(--bg-hover)' : 'transparent', transition: 'all 0.15s ease',
                fontFamily: "'Poppins', sans-serif", flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.5} color={active ? 'var(--text-primary)' : 'var(--text-muted)'} />
                </div>
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: '20px' }}>
                      {item.label}
                      {item.key === 'data' && sources.length > 0 && (
                        <span style={{ marginLeft: 8, background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, verticalAlign: 'middle' }}>
                          {sources.length}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>

        {/* Open File */}
        <div style={{ padding: '0 8px' }}>
          <button onClick={handleOpenFile} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            border: '1px solid var(--border-default)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-surface)', width: '100%',
            fontFamily: "'Poppins', sans-serif", overflow: 'hidden', whiteSpace: 'nowrap', transition: 'all 0.15s ease',
          }}>
            <FolderOpen size={18} strokeWidth={1.5} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Open File…</motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.div>

      {/* ═══ Main Content ════════════════════════════════ */}
      <div style={{
        flex: 1,
        overflow: activeTab === 'settings' ? 'hidden' : 'auto',
        padding: activeTab === 'settings' ? 0 : '40px 48px',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* ── RECENT ──────────────────────────────────── */}
        {activeTab === 'recent' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Welcome back</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>Pick up where you left off, or start something new.</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 36 }}>
              <button onClick={() => setActiveTab('templates')} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontFamily: "'Poppins'",
              }}>
                <Plus size={16} strokeWidth={2.5} /> New Template
              </button>

              <button onClick={handleOpenFile} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                fontSize: 13, fontWeight: 600, border: '1.5px solid var(--border-default)', borderRadius: 10, cursor: 'pointer',
                background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: "'Poppins'",
                transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <FolderOpen size={16} strokeWidth={1.5} color="var(--text-muted)" /> Open Template
              </button>
            </div>

            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Recent Files
            </h3>

            {recentFiles.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 24, marginBottom: 24,
                  background: 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>No recent files yet</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.6, marginBottom: 28 }}>Templates you save or open will automatically appear here for quick access.</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setActiveTab('templates')} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                    fontSize: 13, fontWeight: 600, border: '1.5px solid var(--border-default)', borderRadius: 10,
                    cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: "'Poppins'",
                    transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <Plus size={14} strokeWidth={2.5} /> Create your first template
                  </button>
                  <button onClick={handleOpenFile} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                    fontSize: 13, fontWeight: 600, border: '1.5px solid var(--border-default)', borderRadius: 10,
                    cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: "'Poppins'",
                    transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <FolderOpen size={14} strokeWidth={1.5} color="var(--text-muted)" /> Open existing template
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {recentFiles.slice(0, useSettingsStore.getState().recentFilesCount || 20).map(file => (
                  <HolographicCard key={file.path} onClick={() => handleOpenRecent(file)}>
                    <div style={{ height: 120, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{
                        width: Math.min(100, (file.width || 100) * 0.6),
                        height: Math.min(70, (file.height || 70) * 0.4),
                        background: 'var(--bg-surface)', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8,
                      }}>
                        <div style={{ width: '70%', height: 3, background: 'var(--text-primary)', borderRadius: 1 }} />
                        <div style={{ width: '50%', height: 2, background: 'var(--text-muted)', borderRadius: 1 }} />
                        <div style={{ width: 18, height: 18, background: 'var(--bg-elevated)', borderRadius: 2, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, padding: 2, marginTop: 2 }}>
                          {[1,0,1,0,1,0,1,0,1].map((v,i) => <div key={i} style={{ background: v ? 'var(--text-muted)' : 'transparent', borderRadius: 0.5 }} />)}
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={16} color="var(--text-secondary)" />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatRelativeTime(file.modified)}
                          {file.elementCount !== undefined ? ` · ${file.elementCount} elements` : ''}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(file.path === deleteConfirm ? null : file.path); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, opacity: 0.3, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}>
                        {deleteConfirm === file.path ? (
                          <span onClick={e => { e.stopPropagation(); handleDeleteRecent(file.path); }}
                            style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, fontFamily: "'Poppins'" }}>Confirm?</span>
                        ) : (
                          <Trash2 size={14} color="#1a1a1a" />
                        )}
                      </button>
                    </div>
                  </HolographicCard>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── TEMPLATES ──────────────────────────────── */}
        {activeTab === 'templates' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em', marginBottom: 8 }}>Create New</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 36 }}>Choose a starter design or start with a blank layout.</p>
            
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
              Starter Designs
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 48 }}>
              {STARTER_TEMPLATES.map(preset => {
                return (
                  <HolographicCard key={preset.name} onClick={() => handlePreset(preset)} style={{ padding: 0 }}>
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <TemplatePreview width={preset.width} height={preset.height} shape={preset.shape} elements={preset.elements} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{preset.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{preset.desc}</div>
                      </div>
                    </div>
                  </HolographicCard>
                );
              })}
            </div>

            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
              Blank Formats
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {BLANK_PRESETS.map(preset => {
                const Icon = preset.icon;
                return (
                  <HolographicCard key={preset.name} onClick={() => handlePreset(preset)} style={{ padding: 0 }}>
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <TemplatePreview width={preset.width} height={preset.height} shape={preset.shape} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
                        <Icon size={16} strokeWidth={1.5} color="var(--text-muted)" />
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{preset.name}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{preset.desc}</div>
                    </div>
                  </HolographicCard>
                );
              })}
              <CustomBlankCard 
                onSelect={(w, h) => handlePreset({ name: 'Custom Blank', width: w, height: h, shape: 'rect' })} 
                onSave={handleSavePreset}
              />
            </div>

            {customPresets.length > 0 && (
              <>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 48, marginBottom: 20 }}>
                  My Formats
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {customPresets.map(preset => (
                    <HolographicCard key={preset.id} onClick={() => handlePreset(preset)} style={{ padding: 0 }}>
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id); }}
                          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: 4, borderRadius: 6, transition: 'color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                        >
                          <Trash2 size={12} />
                        </button>
                        <TemplatePreview width={preset.width} height={preset.height} shape={preset.shape} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
                          <Pencil size={15} strokeWidth={1.5} color="var(--text-muted)" />
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{preset.name}</div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{preset.desc}</div>
                      </div>
                    </HolographicCard>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── DATA MANAGER ───────────────────────────── */}
        {activeTab === 'data' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Data Manager</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Manage your data sources. Import once, use everywhere in the designer.</p>
              </div>
              <button onClick={() => setShowImport(!showImport)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontFamily: "'Poppins'",
              }}>
                <Plus size={16} strokeWidth={2.5} /> Add Data Source
              </button>
            </div>

            {/* Import dropzone (toggleable) */}
            <AnimatePresence>
              {showImport && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden', marginBottom: 24 }}>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, marginTop: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Import Data Source</div>
                      <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4 }}>
                        <X size={18} />
                      </button>
                    </div>
                    <DataImportDropzone onImport={() => setShowImport(false)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {sources.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 24, marginBottom: 24,
                  background: 'linear-gradient(135deg, #f0f0f2 0%, #e8e8ea 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>No data sources yet</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.6, marginBottom: 28 }}>Import a CSV, Excel, or JSON file and bind its columns directly to label elements for batch printing.</div>
                <button onClick={() => setShowImport(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                  fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer',
                  background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontFamily: "'Poppins'",
                  transition: 'all 0.15s', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  <Upload size={14} strokeWidth={2} /> Import your first file
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start', marginTop: 24 }}>
                {/* Source List */}
                <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Sources ({sources.length})
                  </div>
                  {sources.map(source => (
                    <div key={source.id} onClick={() => setSelectedSource(source.id)}
                      style={{
                        padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                        background: (selectedSource || activeSourceId) === source.id ? 'var(--bg-hover)' : 'transparent',
                        transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileSpreadsheet size={18} color="var(--text-secondary)" strokeWidth={1.5} />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {source.name || source.path}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {(source.rowCount || 0).toLocaleString()} rows · {(source.columns || []).length} columns
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeSource(source.id); if (selectedSource === source.id) setSelectedSource(null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: 0.3, transition: 'opacity 0.15s', borderRadius: 6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}>
                        <Trash2 size={14} color="#ef4444" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Source Preview */}
                {activeSource ? (
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    {/* Header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{activeSource.name || activeSource.path}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {(activeSource.rowCount || 0).toLocaleString()} rows · {(activeSource.columns || []).length} columns
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {/* Row preview navigator */}
                        {activeSource.rows && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f5f7', padding: '6px 12px', borderRadius: 20 }}>
                            <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Row</span>
                            <button style={{ background: 'none', border: 'none', cursor: currentPreviewRow === 0 ? 'default' : 'pointer', opacity: currentPreviewRow === 0 ? 0.3 : 1, display: 'flex' }}
                              onClick={() => setPreviewRow(Math.max(0, currentPreviewRow - 1))} disabled={currentPreviewRow === 0}>
                              <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>{currentPreviewRow + 1}</span>
                            <button style={{ background: 'none', border: 'none', cursor: currentPreviewRow >= (activeSource.rows.length - 1) ? 'default' : 'pointer', opacity: currentPreviewRow >= (activeSource.rows.length - 1) ? 0.3 : 1, display: 'flex' }}
                              onClick={() => setPreviewRow(Math.min(activeSource.rows!.length - 1, currentPreviewRow + 1))} disabled={currentPreviewRow >= (activeSource.rows.length - 1)}>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                        <button onClick={() => { setActiveSource(activeSource.id); onOpenDesigner(); }} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                          fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
                          background: 'var(--accent-primary)', color: 'var(--text-inverse)', fontFamily: "'Poppins'",
                        }}>
                          Use in Designer <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Column chips */}
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(activeSource.columns || []).map(c => (
                        <span key={c.name} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 500 }}>
                          {c.name}
                        </span>
                      ))}
                    </div>

                    {/* Data preview table */}
                    {activeSource.rows && activeSource.rows.length > 0 ? (
                      <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                          <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                            <tr>
                              <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600, width: 40, borderBottom: '1px solid var(--border-subtle)' }}>#</th>
                              {(activeSource.columns || []).map(col => (
                                <th key={col.name} style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{col.name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(activeSource.rows || []).map((row, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: i === currentPreviewRow ? 'var(--bg-hover)' : 'transparent' }}>
                                <td style={{ padding: '9px 16px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                                 {activeSource.columns?.map(col => (
                                  <td key={col.name} style={{ padding: '9px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row[col.name] || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {activeSource.rowCount > activeSource.rows.length && (
                          <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#aaa', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                            Showing {activeSource.rows.length} of {activeSource.rowCount.toLocaleString()} rows
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>
                        <p>Row data not available.</p>
                        <p style={{ marginTop: 4 }}>Re-import the file to load full data.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Database size={48} strokeWidth={1} style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>Select a source to preview</div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── SETTINGS ───────────────────────────────── */}
        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
            style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <SettingsContent />
          </motion.div>
        )}

  
      </div>
    </div>
  );
}
