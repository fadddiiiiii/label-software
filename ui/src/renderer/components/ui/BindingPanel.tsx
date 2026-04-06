// src/renderer/components/ui/BindingPanel.tsx — Field Binding Configuration (Full Feature Set)
import React from 'react';
import { Upload, X, Hash } from 'lucide-react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { useDataStore, FieldBinding } from '../../store/data';
import { DATE_TIME_FORMATS, SerialNumberConfig } from '../../types/template';

const BINDING_TYPES = [
  { value: 'database', label: '📊 Database Column' },
  { value: 'keyboard', label: '⌨️ Keyboard Input' },
  { value: 'serial', label: '🔢 Serial Number' },
  { value: 'date', label: '📅 Date/Time' },
  { value: 'fixed', label: '📝 Fixed Text' },
  { value: 'programming', label: '⚙️ Programming (Expression)' },
];

const DEFAULT_SERIAL: SerialNumberConfig = {
  id: '', name: 'New Serial', start: 1, increment: 1, step_type: 'increase', digits: 5, pad_left: true, prefix: '', suffix: '', type: 'decimal', reset_on: 'never', current_value: 1,
};

export default function BindingPanel() {
  const { selectedId, elements } = useCanvasStoreCompat();
  const { sources, bindings, addBinding, updateBinding, removeBinding, activeSourceId,
    setSerialConfig, getSerialConfig, serialConfigs, setSerialNumberModalOpen, resolveBindingValue } = useDataStore();
  const elem = elements.find(e => e.id === selectedId);
  const binding = bindings.find(b => b.fieldId === selectedId);
  const active = sources.find(s => s.id === activeSourceId);

  if (!elem) {
    return (
      <div className="panel-section">
        <div className="panel-section__title">Binding</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3)' }}>
          Select an element to configure its data binding.
        </div>
      </div>
    );
  }

  if (!['text', 'barcode', 'qrcode'].includes(elem.type)) return null;

  const setBinding = (updates: Partial<FieldBinding>) => {
    if (binding) {
      updateBinding(elem.id, updates);
    } else {
      addBinding({ fieldId: elem.id, type: 'database', ...updates });
    }
  };

  const configs = Object.values(serialConfigs);
  const serial = binding?.serialId ? serialConfigs[binding.serialId] : (binding?.serialConfig || DEFAULT_SERIAL);

  const updateSerial = (updates: Partial<SerialNumberConfig>) => {
    if (binding?.serialId) {
      setSerialConfig(binding.serialId, { ...serial, ...updates });
    } else {
      const cfg = { ...serial, ...updates };
      setBinding({ serialConfig: cfg });
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section__title">Binding</div>

      <div style={{ marginBottom: 'var(--space-2)' }}>
        <label className="input-label">Source Type</label>
        <select className="select" value={binding?.type ?? ''}
          onChange={e => {
            if (!e.target.value) { removeBinding(elem.id); return; }
            setBinding({ type: e.target.value as any });
          }}>
          <option value="">— No Binding (Static) —</option>
          {BINDING_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Database binding */}
      {binding?.type === 'database' && (
        <div>
          {active ? (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <label className="input-label">Column</label>
              <select className="select" value={binding.column || ''}
                onChange={e => setBinding({ column: e.target.value, sourceId: active.id })}>
                <option value="">— Select Column —</option>
                {active.columns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-warning)' }}>
              ⚠️ Connect a data source first.
            </div>
          )}
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <label className="input-label">Formula (optional)</label>
            <input className="input input--compact" value={binding.formula || ''}
              onChange={e => setBinding({ formula: e.target.value })}
              placeholder="e.g. upper(column_name)" />
          </div>
        </div>
      )}

      {/* Keyboard binding */}
      {binding?.type === 'keyboard' && (
        <div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <label className="input-label">Prompt Label</label>
            <input className="input input--compact" value={binding.promptLabel || ''}
              onChange={e => setBinding({ promptLabel: e.target.value })}
              placeholder="e.g. Enter Lot Number" />
          </div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <label className="input-label">Default Value</label>
            <input className="input input--compact" value={binding.defaultValue || ''}
              onChange={e => setBinding({ defaultValue: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={binding.resetPerJob || false}
                onChange={e => setBinding({ resetPerJob: e.target.checked })} />
              Reset per job
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={binding.resetPerRow || false}
                onChange={e => setBinding({ resetPerRow: e.target.checked })} />
              Reset per row
            </label>
          </div>
        </div>
      )}

      {/* Serial binding */}
      {binding?.type === 'serial' && (
        <div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <label className="input-label">Select Counter</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="select" value={binding.serialId || ''}
                onChange={e => setBinding({ serialId: e.target.value })}>
                <option value="">— Use Local Counter —</option>
                {configs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn btn--icon" onClick={() => setSerialNumberModalOpen(true)} title="Manage Counters">
                <Hash size={14} />
              </button>
            </div>
          </div>

          {!binding.serialId ? (
            <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-2)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
              <div className="input-row" style={{ marginBottom: 8 }}>
                <div>
                  <label className="input-label">Start Value</label>
                  <input type="number" className="input input--compact" value={serial?.start ?? 1}
                    onChange={e => updateSerial({ start: +e.target.value, current_value: +e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Increment</label>
                  <input type="number" className="input input--compact" value={serial?.increment ?? 1}
                    onChange={e => updateSerial({ increment: +e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80 }}>
                  <label className="input-label">Length</label>
                  <input type="number" className="input input--compact" value={serial?.digits || 5} 
                    onChange={e => updateSerial({ digits: +e.target.value })} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginTop: 14 }}>
                  <input type="checkbox" checked={serial?.pad_left ?? true} 
                    onChange={e => updateSerial({ pad_left: e.target.checked })} />
                  Pad with zeros
                </label>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                💡 Tip: Use global counters for shared numbering.
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8f9ff', padding: 'var(--space-2)', borderRadius: 8, border: '1px solid #e0e4ff' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', marginBottom: 4 }}>Connected: {serial?.name || 'Unknown Counter'}</div>
              <div style={{ fontSize: 10, color: '#666' }}>
                Type: {serial?.type || '—'} | Step: {serial?.increment || '—'} ({serial?.step_type || '—'})
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#888', marginTop: 8, padding: '6px 10px', background: '#f5f5f7', borderRadius: 6 }}>
            Preview: <strong>
              {(binding.serialId || binding.serialConfig) ? resolveBindingValue(elem.id) : '—'}
            </strong>
          </div>
        </div>
      )}

      {/* Date/Time binding - all 12 formats */}
      {binding?.type === 'date' && (
        <div>
          <label className="input-label">Date/Time Format</label>
          <select className="select" value={binding.dateFormatId || 'DT-03'}
            onChange={e => {
              const fmt = DATE_TIME_FORMATS.find(f => f.id === e.target.value);
              setBinding({ dateFormatId: e.target.value, formatStr: fmt?.format || 'YYYY-MM-DD' });
            }}>
            {DATE_TIME_FORMATS.map(f => (
              <option key={f.id} value={f.id}>{f.id}: {f.example}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6, padding: '6px 10px', background: '#f5f5f7', borderRadius: 6 }}>
            Format: <code>{binding.formatStr || 'YYYY-MM-DD'}</code>
          </div>
        </div>
      )}

      {/* Fixed text binding */}
      {binding?.type === 'fixed' && (
        <div>
          <label className="input-label">Fixed Value</label>
          <input className="input" value={binding.fixedValue || ''}
            onChange={e => setBinding({ fixedValue: e.target.value })}
            placeholder="Enter fixed text..." />
        </div>
      )}

      {/* Programming / expression binding */}
      {binding?.type === 'programming' && (
        <div>
          <label className="input-label">Expression</label>
          <input className="input" value={binding.expression || ''}
            onChange={e => setBinding({ expression: e.target.value })}
            placeholder='e.g. [PartNo] + "-" + [Qty]' />
          <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
            Use [ColumnName] to reference datasource columns
          </div>
        </div>
      )}

      {binding && (
        <button className="btn btn--ghost" style={{ marginTop: 'var(--space-2)', color: 'var(--accent-error)', fontSize: 'var(--text-xs)' }}
          onClick={() => removeBinding(elem.id)}>
          ✕ Remove Binding
        </button>
      )}
    </div>
  );
}
