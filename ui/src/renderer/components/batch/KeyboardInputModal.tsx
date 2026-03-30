// src/renderer/components/batch/KeyboardInputModal.tsx — GAP-02 Keyboard Input Modal
import React, { useState } from 'react';
import { usePrintStore } from '../../store/print';
import { useDataStore } from '../../store/data';

export default function KeyboardInputModal() {
  const { showKeyboardInput, setShowKeyboardInput, setKeyboardValue, keyboardValues } = usePrintStore();
  const { bindings } = useDataStore();

  const kbBindings = bindings.filter(b => b.type === 'keyboard');

  if (!showKeyboardInput || kbBindings.length === 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowKeyboardInput(false);
    // Values are already stored via onChange — proceed with printing
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)',
        minWidth: 400, maxWidth: 500, boxShadow: 'var(--shadow-lg)',
        animation: 'fadeIn var(--transition-normal) both',
      }}>
        <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
          ⌨️ Enter Print Values
        </h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          These values will be applied to every label in this print job.
        </p>

        {kbBindings.map(b => (
          <div key={b.fieldId} style={{ marginBottom: 'var(--space-3)' }}>
            <label className="input-label">{b.promptLabel || b.fieldId}</label>
            <input className="input" value={keyboardValues[b.fieldId] ?? b.defaultValue ?? ''}
              onChange={e => setKeyboardValue(b.fieldId, e.target.value)}
              placeholder={b.promptLabel || `Enter ${b.fieldId}`}
              autoFocus={kbBindings.indexOf(b) === 0} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button type="button" className="btn" onClick={() => setShowKeyboardInput(false)}>Cancel</button>
          <button type="submit" className="btn btn--primary">✓ Continue Print</button>
        </div>
      </form>
    </div>
  );
}
