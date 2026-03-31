// src/renderer/components/ui/Toolbox.tsx — Left Sidebar Tool Panel
import React from 'react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { ElementType } from '../../types/template';
import { Type, ScanBarcode, QrCode, Image as ImageIcon, Square, Circle, Minus, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const TOOLS: { type: ElementType; icon: React.ReactNode; label: string }[] = [
  { type: 'text', icon: <Type size={18} strokeWidth={2} />, label: 'Text' },
  { type: 'barcode', icon: <ScanBarcode size={18} strokeWidth={2} />, label: 'Barcode' },
  { type: 'qrcode', icon: <QrCode size={18} strokeWidth={2} />, label: 'QR Code' },
  { type: 'image', icon: <ImageIcon size={18} strokeWidth={2} />, label: 'Image' },
  { type: 'rect', icon: <Square size={18} strokeWidth={2} />, label: 'Rect' },
  { type: 'circle', icon: <Circle size={18} strokeWidth={2} />, label: 'Circle' },
  { type: 'line', icon: <Minus size={18} strokeWidth={2} />, label: 'Line' },
];

export default function Toolbox() {
  const { addElement } = useCanvasStoreCompat();

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
      {/* ── Insert Elements ─────────────────────────── */}
      <div className="panel-section" style={{ borderBottom: 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
          Elements
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {TOOLS.map(t => (
            <motion.button 
              whileHover={{ scale: 1.02, backgroundColor: '#f5f5f5' }}
              whileTap={{ scale: 0.98 }}
              key={t.type} 
              onClick={() => addElement(t.type)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '16px 8px', borderRadius: 12, border: '1px solid #ebebeb',
                background: '#fff', cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s',
                color: '#1a1a1a'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#d0d0d0'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#ebebeb'}
            >
              <div style={{ color: '#1a1a1a' }}>{t.icon}</div>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{t.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
      
    </div>
  );
}
