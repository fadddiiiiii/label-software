// src/renderer/components/batch/PrintSettingsDialog.tsx — Full Print Settings
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Printer, Settings } from 'lucide-react';
import { usePrintStore } from '../../store/print';
import { useDataStore } from '../../store/data';
import { invokeIPC } from '../../hooks/useIPC';

export default function PrintSettingsDialog() {
  const {
    showPrintSettings, setShowPrintSettings,
    printers, selectedPrinter, setSelectedPrinter, setPrinters,
    settings, updateSettings, setShowBatchConsole,
  } = usePrintStore();
  const { sources, activeSourceId } = useDataStore();
  const active = sources.find(s => s.id === activeSourceId);

  useEffect(() => {
    if (showPrintSettings) {
      invokeIPC<string[]>('printers:list').then(list => {
        setPrinters(list);
        // Apply default printer from settings
        const { useSettingsStore: sStore } = require('../../store/settings');
        const s = sStore.getState();
        if (s.defaultPrinter && s.defaultPrinter !== 'System Default' && list.includes(s.defaultPrinter)) {
          setSelectedPrinter(s.defaultPrinter);
        }
        // Apply default offsets
        if (settings.position_left_mm === 0 && settings.position_top_mm === 0) {
          updateSettings({ position_left_mm: s.labelOffsetX || 0, position_top_mm: s.labelOffsetY || 0 });
        }
      }).catch(() => {});
    }
  }, [showPrintSettings]);

  if (!showPrintSettings) return null;

  const isVirtualPrinter = /^pdf$/i.test(selectedPrinter.trim()) || selectedPrinter.toLowerCase().includes('save as pdf');

  const openPrinterPreferences = async () => {
    try {
      await invokeIPC('printer:openPreferences', { printer: selectedPrinter });
    } catch {
      // Silently fail — button is hidden for unsupported printers
    }
  };

  const handlePrint = () => {
    setShowPrintSettings(false);
    setShowBatchConsole(true);
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={() => setShowPrintSettings(false)} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          position: 'relative', zIndex: 1, background: 'var(--bg-primary)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)', width: 560, maxWidth: '95vw',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings size={18} color="var(--text-inverse)" />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Print Settings</h3>
          </div>
          <button onClick={() => setShowPrintSettings(false)} className="btn btn--ghost btn--icon" style={{ borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Printer selection */}
          <div style={{ display: 'grid', gridTemplateColumns: isVirtualPrinter ? '1fr' : '1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label className="input-label">Printer</label>
              <select className="select" value={selectedPrinter}
                onChange={e => setSelectedPrinter(e.target.value)} style={{ width: '100%' }}>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {!isVirtualPrinter && (
              <button className="btn" onClick={openPrinterPreferences} style={{ height: 36, gap: 6 }}>
                <Printer size={14} /> Printer Settings
              </button>
            )}
          </div>

          {/* Copies & count */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="input-label">Print Copies</label>
              <input type="number" className="input" value={settings.copies}
                onChange={e => updateSettings({ copies: Math.max(1, +e.target.value) })}
                min={1} max={999} style={{ width: '100%' }} />
              <span style={{ fontSize: 10, color: '#999' }}>Physical copies of each label</span>
            </div>
            <div>
              <label className="input-label">Print Count</label>
              <input type="number" className="input" value={settings.print_count}
                onChange={e => updateSettings({ print_count: Math.max(1, +e.target.value) })}
                min={1} disabled={settings.use_datasource_count}
                style={{ width: '100%', opacity: settings.use_datasource_count ? 0.5 : 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666', marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.use_datasource_count}
                  onChange={e => updateSettings({ use_datasource_count: e.target.checked })} />
                Use datasource count
              </label>
            </div>
          </div>

          {/* Row selection */}
          {active && (
            <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Row Selection
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="rowSel" checked={settings.all_rows}
                    onChange={() => updateSettings({ all_rows: true })} />
                  All Rows ({active.rowCount})
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="rowSel" checked={!settings.all_rows}
                    onChange={() => updateSettings({ all_rows: false })} />
                  Custom
                </label>
              </div>
              {!settings.all_rows && (
                <div>
                  <label className="input-label">Rows (e.g. 2,4,5-8)</label>
                  <input className="input" value={settings.custom_rows}
                    onChange={e => updateSettings({ custom_rows: e.target.value })}
                    placeholder="1,3,5-10" style={{ width: '100%' }} />
                </div>
              )}
            </div>
          )}

          {/* Each Label Print Count */}
          {active && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" checked={settings.each_label_print_count}
                  onChange={e => updateSettings({ each_label_print_count: e.target.checked })} />
                Each Label Print Count (from datasource column)
              </label>
              {settings.each_label_print_count && (
                <select className="select" value={settings.each_label_count_column}
                  onChange={e => updateSettings({ each_label_count_column: e.target.value })}
                  style={{ marginTop: 8 }}>
                  <option value="">Select column...</option>
                  {active.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Position adjust */}
          <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Position Adjust (Calibration)
            </div>
            <div className="input-row">
              <div>
                <label className="input-label">Left Offset (mm)</label>
                <input type="number" className="input input--compact" value={settings.position_left_mm}
                  onChange={e => updateSettings({ position_left_mm: +e.target.value })} step={0.5} />
              </div>
              <div>
                <label className="input-label">Top Offset (mm)</label>
                <input type="number" className="input input--compact" value={settings.position_top_mm}
                  onChange={e => updateSettings({ position_top_mm: +e.target.value })} step={0.5} />
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.show_progress}
                onChange={e => updateSettings({ show_progress: e.target.checked })} />
              Show printing progress bar
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.update_serial}
                onChange={e => updateSettings({ update_serial: e.target.checked })} />
              Update serial value after printing
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.save_print_log}
                onChange={e => updateSettings({ save_print_log: e.target.checked })} />
              Save print log
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)',
          display: 'flex', justifyContent: 'flex-end', gap: 12,
        }}>
          <button className="btn" onClick={() => setShowPrintSettings(false)}>Cancel</button>
          <button className="btn btn--primary" onClick={handlePrint} style={{ padding: '0 24px' }}>
            Print
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
