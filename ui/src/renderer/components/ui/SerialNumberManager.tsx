import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataStore } from '../../store/data';
import { SerialNumberConfig } from '../../types/template';
import { X, Hash, Plus, Trash2, ChevronUp, ChevronDown, Binary, Type } from 'lucide-react';

export default function SerialNumberManager() {
  const { 
    isSerialNumberModalOpen, 
    setSerialNumberModalOpen, 
    serialConfigs, 
    setSerialConfig 
  } = useDataStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isSerialNumberModalOpen) return null;

  const configs = Object.values(serialConfigs);
  const active = selectedId ? serialConfigs[selectedId] : null;

  const addSerial = () => {
    const id = `serial_${Date.now()}`;
    const newSerial: SerialNumberConfig = {
      id,
      name: `Serial ${configs.length + 1}`,
      start: 1,
      increment: 1,
      step_type: 'increase',
      digits: 5,
      pad_left: true,
      prefix: '',
      suffix: '',
      type: 'decimal',
      reset_on: 'never',
      current_value: 1,
    };
    setSerialConfig(id, newSerial);
    setSelectedId(id);
  };

  const removeSerial = (id: string) => {
    const newConfigs = { ...serialConfigs };
    delete newConfigs[id];
    // We need a way to batch update or remove. For now setSerialConfig handles one.
    // Let's assume we use the store correctly.
    useDataStore.setState({ serialConfigs: newConfigs });
    if (selectedId === id) setSelectedId(null);
  };

  const updateActive = (updates: Partial<SerialNumberConfig>) => {
    if (!selectedId || !active) return;
    const cfg = { ...active, ...updates };
    if ('start' in updates) cfg.current_value = updates.start!;
    setSerialConfig(selectedId, cfg);
  };

  return createPortal(
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSerialNumberModalOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
        
        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
          style={{ 
            position: 'relative', zIndex: 1, width: 800, height: 600, maxWidth: '95vw', maxHeight: '90vh',
            background: '#fff', borderRadius: 16, display: 'flex', overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)' 
          }}>
          
          {/* Sidebar: List of Serials */}
          <div style={{ width: 260, borderRight: '1px solid #f0f0f2', background: '#fafafb', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Hash size={18} color="#6366f1" /> Serials
              </div>
              <button className="btn btn--icon" onClick={addSerial} style={{ width: 28, height: 28 }}>
                <Plus size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
              {configs.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 12 }}>
                  No serial counters defined.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {configs.map(c => (
                    <div key={c.id} 
                      onClick={() => setSelectedId(c.id)}
                      style={{ 
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        background: selectedId === c.id ? '#fff' : 'transparent',
                        boxShadow: selectedId === c.id ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                        border: `1.5px solid ${selectedId === c.id ? '#1a1a1a' : 'transparent'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: '0.2s'
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === c.id ? '#1a1a1a' : '#666' }}>
                        {c.name}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeSerial(c.id); }} 
                        style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', padding: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main: Configuration */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, color: '#888' }}>
                {active ? `Editing ${active.name}` : 'Select a serial to configure'}
              </div>
              <button onClick={() => setSerialNumberModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
                <X size={20} />
              </button>
            </div>

            {active ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  
                  <div className="form-group">
                    <label className="input-label">Counter Name</label>
                    <input className="input" value={active.name} onChange={e => updateActive({ name: e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Type</label>
                    <select className="select" value={active.type} onChange={e => updateActive({ type: e.target.value as any })}>
                      <option value="decimal">Decimal (10)</option>
                      <option value="hex">Hexadecimal (16)</option>
                      <option value="alpha">Alphabetic (A-Z)</option>
                      <option value="custom">Custom Sequence</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Start Value</label>
                    <input type="number" className="input" value={active.start} onChange={e => updateActive({ start: +e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Step Value</label>
                    <input type="number" className="input" value={active.increment} onChange={e => updateActive({ increment: +e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Step Type</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button className={`btn ${active.step_type === 'increase' ? 'btn--primary' : 'btn--ghost'}`} 
                        onClick={() => updateActive({ step_type: 'increase' })} style={{ flex: 1, gap: 6 }}>
                        <ChevronUp size={14} /> Increase
                      </button>
                      <button className={`btn ${active.step_type === 'decrease' ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => updateActive({ step_type: 'decrease' })} style={{ flex: 1, gap: 6 }}>
                        <ChevronDown size={14} /> Decrease
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Length (Padding)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="number" className="input" value={active.digits} onChange={e => updateActive({ digits: +e.target.value })} style={{ width: 80 }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={active.pad_left} onChange={e => updateActive({ pad_left: e.target.checked })} />
                        Pad with zeros
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Prefix</label>
                    <input className="input" value={active.prefix} onChange={e => updateActive({ prefix: e.target.value })} placeholder="e.g. SN-" />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Suffix</label>
                    <input className="input" value={active.suffix} onChange={e => updateActive({ suffix: e.target.value })} placeholder="e.g. -A" />
                  </div>
                </div>

                {active.type === 'custom' && (
                  <div className="form-group" style={{ marginTop: 24 }}>
                    <label className="input-label">Custom Sequence</label>
                    <textarea className="input" value={active.custom_sequence || ''} 
                      onChange={e => updateActive({ custom_sequence: e.target.value })}
                      style={{ height: 60, fontFamily: 'monospace' }}
                      placeholder="e.g. 0123456789" />
                  </div>
                )}

                {/* Preview Area */}
                <div style={{ marginTop: 40, padding: 24, background: '#f8f9ff', borderRadius: 12, border: '1px solid #e0e4ff' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 12 }}>Preview (Next 5 Values)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[0, 1, 2, 3, 4].map(idx => {
                      const delta = active.step_type === 'decrease' ? -active.increment : active.increment;
                      const nextVal = active.start + (idx * delta);
                      const previewCfg = { ...active, current_value: nextVal };
                      return (
                        <div key={idx} style={{ 
                          padding: '8px 16px', background: '#fff', border: '1px solid #e0e4ff', borderRadius: 8,
                          fontSize: 14, fontWeight: 600, color: '#1a1a1a', boxShadow: '0 2px 4px rgba(99, 102, 241, 0.05)'
                        }}>
                          {formatValue(previewCfg)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', gap: 16 }}>
                <Hash size={48} strokeWidth={1} />
                <div style={{ textAlign: 'center' }}>
                  Select a counter from the list<br/>or click + to create a new one.
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

function formatValue(config: SerialNumberConfig): string {
  let val = config.current_value;
  let text = '';

  if (config.type === 'hex') {
    text = val.toString(16).toUpperCase();
  } else if (config.type === 'alpha') {
    text = String.fromCharCode(65 + (val % 26));
  } else if (config.type === 'custom' && config.custom_sequence) {
    const seq = config.custom_sequence;
    text = seq[val % seq.length] || '';
  } else {
    text = String(val);
  }

  if (config.pad_left && config.digits > 0) {
    text = text.padStart(config.digits, '0');
  }

  return `${config.prefix}${text}${config.suffix}`;
}
