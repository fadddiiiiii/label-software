// src/renderer/components/template-lib/TemplateLibrary.tsx — Template Library Panel
import React, { useState } from 'react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { invokeIPC, loadTemplate } from '../../hooks/useIPC';
import { TemplateDocument, DEFAULT_LABEL_CONFIG, DEFAULT_SHEET_LAYOUT } from '../../types/template';
import { FilePlus2, FolderOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TemplatePreset {
  name: string;
  icon: string;
  width: number;
  height: number;
  desc: string;
}

const PRESETS: TemplatePreset[] = [
  { name: 'Standard', icon: '📦', width: 100, height: 70, desc: '100 × 70 mm' },
  { name: 'Address', icon: '✉️', width: 89, height: 36, desc: '89 × 36 mm' },
  { name: 'Shipping', icon: '🚚', width: 100, height: 150, desc: '100 × 150 mm' },
  { name: 'Product', icon: '🏷', width: 50, height: 25, desc: '50 × 25 mm' },
  { name: 'Jewellery', icon: '💎', width: 30, height: 10, desc: '30 × 10 mm' },
  { name: 'Wine Bottle', icon: '🍷', width: 90, height: 120, desc: '90 × 120 mm' },
  { name: 'Round', icon: '⭕', width: 60, height: 60, desc: '60 × 60 mm round' },
  { name: 'A4 Full', icon: '📄', width: 210, height: 297, desc: '210 × 297 mm' },
];

export default function TemplateLibrary() {
  const { newTemplate, setLabel, loadTemplate: loadDoc, setFilePath } = useCanvasStoreCompat();
  const [showPresets, setShowPresets] = useState(false);

  const handlePreset = (preset: TemplatePreset) => {
    newTemplate();
    setLabel({
      width_mm: preset.width,
      height_mm: preset.height,
      shape: preset.name === 'Round' ? 'ellipse' : 'rect',
    });
    setShowPresets(false);
  };

  const handleOpen = async () => {
    const path = await invokeIPC<string | null>('template:open-dialog');
    if (!path) return;
    try {
      const doc = await loadTemplate(path);
      loadDoc(doc);
      setFilePath(path);
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  };

  return (
    <div className="panel-section" style={{ borderBottom: 'none', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#888', textTransform: 'uppercase' }}>
          File
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <motion.button 
            whileHover={{ scale: 1.05, backgroundColor: '#f0f0f0' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowPresets(!showPresets)} 
            style={{ 
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid #ebebeb', background: showPresets ? '#e0e0e0' : '#fff', cursor: 'pointer',
              color: '#1a1a1a'
            }}
            title="New from Preset"
          >
            <FilePlus2 size={16} strokeWidth={2} />
          </motion.button>
          
          <motion.button 
            whileHover={{ scale: 1.05, backgroundColor: '#f0f0f0' }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOpen} 
            style={{ 
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid #ebebeb', background: '#fff', cursor: 'pointer',
              color: '#1a1a1a'
            }}
            title="Open File"
          >
            <FolderOpen size={16} strokeWidth={2} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showPresets && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, overflow: 'hidden' }}
          >
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => handlePreset(p)}
                style={{ 
                  padding: '8px 6px', textAlign: 'center', background: '#fff',
                  border: '1px solid #ebebeb', borderRadius: 8, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 10, color: '#1a1a1a' }}>{p.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
