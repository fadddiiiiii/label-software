// src/renderer/components/batch/BatchConsole.tsx — Print Job Console
import React, { useEffect, useState } from 'react';
import { usePrintStore } from '../../store/print';
import { useDataStore } from '../../store/data';
import { useCanvasStoreCompat } from '../../store/canvas';
import { useTabsStore } from '../../store/tabs';
import { useSettingsStore } from '../../store/settings';
import { invokeIPC } from '../../hooks/useIPC';

export default function BatchConsole() {
  const {
    printers, selectedPrinter, setSelectedPrinter, setPrinters,
    copiesPerLabel, setCopiesPerLabel,
    printRange, setPrintRange, customRange, setCustomRange,
    progress, setProgress, resetProgress,
    showBatchConsole, setShowBatchConsole, setShowKeyboardInput,
    showKeyboardInput, keyboardValues
  } = usePrintStore();

  const { sources, bindings, activeSourceId, serialConfigs, setSerialConfig, updateBinding } = useDataStore();
  const { toDocument, elements } = useCanvasStoreCompat();
  const active = sources.find(s => s.id === activeSourceId);
  
  const defaultSerialConfig: any = { start: 1, current_value: 1, increment: 1, step_type: 'increase', digits: 5, pad_left: false, type: 'numeric', reset_on: 'never' };
  const serialBinding = bindings.find(b => b.type === 'serial' && elements.some(e => e.id === b.fieldId));
  const primarySerialConfig = serialBinding ? (serialBinding.serialId ? serialConfigs[serialBinding.serialId] : (serialBinding.serialConfig || defaultSerialConfig)) : null;

  // Extra print count for serial labels when there's no data source
  const [printCount, setPrintCount] = useState(1);

  // Track whether we're waiting for keyboard input to complete
  const [pendingKeyboard, setPendingKeyboard] = useState(false);


  const handlePrinterChange = (name: string) => {
    setSelectedPrinter(name);
  };

  // Fetch printers and apply defaults on mount
  useEffect(() => {
    const s = useSettingsStore.getState();
    invokeIPC<string[]>('printers:list').then(list => {
      setPrinters(list);
      let initialPrinter = list.length > 0 ? list[0] : '';
      if (s.defaultPrinter && s.defaultPrinter !== 'System Default' && list.includes(s.defaultPrinter)) {
        initialPrinter = s.defaultPrinter;
      }
      if (initialPrinter) {
        setSelectedPrinter(initialPrinter);
      }
    }).catch(() => { });
    if (s.copiesPerLabel > 0) setCopiesPerLabel(s.copiesPerLabel);
  }, []);

  // When keyboard modal closes after user submitted values, trigger the actual print
  useEffect(() => {
    if (pendingKeyboard && !showKeyboardInput) {
      setPendingKeyboard(false);
      startBatch();
    }
  }, [showKeyboardInput, pendingKeyboard]);

  if (!showBatchConsole) return null;

  const percent = progress.totalRows > 0
    ? ((progress.completedRows + progress.errorRows) / progress.totalRows * 100).toFixed(1)
    : 0;

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const handleSerialStartChange = (val: number) => {
    if (!serialBinding || !primarySerialConfig) return;
    if (serialBinding.serialId) {
      setSerialConfig(serialBinding.serialId, { ...primarySerialConfig, start: val, current_value: val });
    } else {
      updateBinding(serialBinding.fieldId, { serialConfig: { ...primarySerialConfig, start: val, current_value: val } });
    }
  };

  const handleSerialEndChange = (val: number) => {
    if (!primarySerialConfig) return;
    const start = primarySerialConfig.start || 1;
    const inc = primarySerialConfig.increment || 1;
    if (val < start) {
       setPrintCount(1);
    } else {
       const count = Math.floor((val - start) / inc) + 1;
       setPrintCount(Math.max(1, count));
    }
  };

  const getRowRange = () => {
    const maxRows = active?.rowCount ?? 0;
    if (maxRows === 0) {
      // No data source — print dynamic labels based on standalone print count
      return { startRow: 0, endRow: printCount, totalToPrint: printCount };
    }
    const startRow = printRange === 'custom' ? Math.max(0, customRange.start - 1) : 0;
    const endRow = printRange === 'custom' ? Math.min(maxRows, customRange.end) : maxRows;
    const totalToPrint = Math.max(0, endRow - startRow);
    return { startRow, endRow, totalToPrint };
  };

  const handlePrint = async () => {
    const kbBindings = bindings.filter(b => b.type === 'keyboard');
    if (kbBindings.length > 0) {
      setPendingKeyboard(true);
      setShowKeyboardInput(true);
      return;
    }
    startBatch();
  };

  const startBatch = async () => {
    const { startRow, endRow, totalToPrint } = getRowRange();
    if (totalToPrint <= 0) return;

    resetProgress();
    setProgress({ status: 'running', totalRows: totalToPrint });

    try {
      const result = await invokeIPC('batch:start', {
        template: toDocument(),
        printer: selectedPrinter,
        copies_per_label: copiesPerLabel,
        start_row: startRow,
        end_row: endRow,
        print_mode: 'pdf',
        keyboard_values: keyboardValues,
      });
      console.log('[Batch] result:', result);
      if (result?.error) {
        setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: result.error }] });
      } else {
        setProgress({
          status: result?.status === 'failed' ? 'failed' : 'done',
          completedRows: result?.completed_rows ?? totalToPrint,
          totalRows: result?.total_rows ?? totalToPrint,
          errorRows: result?.error_rows ?? 0,
          errors: result?.errors ?? [],
        });
      }
    } catch (err: any) {
      setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: err.message }] });
    }
  };

  const exportPdf = async () => {
    const { startRow, endRow, totalToPrint } = getRowRange();
    if (totalToPrint <= 0) return;

    const activeTab = useTabsStore.getState().getActive();
    const path = await invokeIPC<string | null>('pdf:save-dialog', { filename: activeTab?.name || 'labels' });
    if (!path) return;

    resetProgress();
    setProgress({ status: 'running', totalRows: totalToPrint });

    try {
      const result = await invokeIPC('batch:start', {
        template: toDocument(),
        printer: 'PDF',
        output_path: path,
        copies_per_label: copiesPerLabel,
        start_row: startRow,
        end_row: endRow,
        keyboard_values: keyboardValues,
      });
      console.log('[PDF Export] result:', result);
      if (result?.error) {
        setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: result.error }] });
      } else {
        setProgress({
          status: result?.status === 'failed' ? 'failed' : 'done',
          completedRows: result?.completed_rows ?? totalToPrint,
          totalRows: result?.total_rows ?? totalToPrint,
          errorRows: result?.error_rows ?? 0,
          errors: result?.errors ?? [],
        });
      }
    } catch (err: any) {
      setProgress({ status: 'failed', errors: [{ rowIndex: 0, message: err.message }] });
    }
  };

  const statusColor = {
    idle: 'var(--text-muted)',
    running: 'var(--accent-secondary)',
    paused: 'var(--accent-warning)',
    done: 'var(--accent-success)',
    partial: 'var(--accent-warning)',
    failed: 'var(--accent-error)',
    cancelled: 'var(--text-muted)',
  };

  const maxRows = active?.rowCount ?? 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: '12px',
        width: '560px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px var(--border-subtle)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)'
        }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Print Console</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {active ? `Bound to ${active.path.split('/').pop()} (${maxRows} rows)` : 'No data source connected.'}
            </div>
          </div>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => setShowBatchConsole(false)}
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            {/* Printer Selection */}
            <div>
              <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>Target Printer</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="select"
                  value={selectedPrinter}
                  onChange={e => handlePrinterChange(e.target.value)}
                  style={{ flex: 1, height: 36 }}
                >
                  {printers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  className="btn btn--secondary"
                  onClick={() => invokeIPC('printer:openPreferences', { printer: selectedPrinter })}
                  style={{ height: 36, padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                  title="Open native OS printer properties (speed, darkness, etc.)"
                >
                  Printer Settings
                </button>
              </div>
            </div>

            {/* Copies per label */}
            <div>
              <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>Copies per label</label>
              <input
                type="number" className="input" value={copiesPerLabel}
                onChange={e => setCopiesPerLabel(+e.target.value)} min={1} max={999}
                style={{ width: '100%', height: 36 }}
              />
            </div>

          </div>

          {/* Print Range */}
          <div>
            {active ? (
              <>
                <label className="input-label" style={{ marginBottom: 8, display: 'block' }}>Print Range</label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio" name="printRange"
                      checked={printRange === 'all'}
                      onChange={() => setPrintRange('all')}
                    />
                    All Rows ({maxRows})
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio" name="printRange"
                      checked={printRange === 'custom'}
                      onChange={() => setPrintRange('custom')}
                    />
                    Custom Range
                  </label>

                  {printRange === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                      <input
                        type="number" className="input" value={customRange.start}
                        onChange={e => setCustomRange(+e.target.value, customRange.end)}
                        min={1} max={customRange.end}
                        style={{ width: 60, height: 28, fontSize: 13 }}
                      />
                      <span style={{ color: 'var(--text-muted)' }}>to</span>
                      <input
                        type="number" className="input" value={customRange.end}
                        onChange={e => setCustomRange(customRange.start, +e.target.value)}
                        min={customRange.start} max={maxRows}
                        style={{ width: 60, height: 28, fontSize: 13 }}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : primarySerialConfig ? (
              <>
                <label className="input-label" style={{ marginBottom: 8, display: 'block' }}>Serial Sequence Range</label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>From:</span>
                    <input 
                      type="number" className="input" value={primarySerialConfig.start || 1}
                      onChange={e => handleSerialStartChange(e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                      style={{ width: 100, height: 36, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>To:</span>
                    <input 
                      type="number" className="input" 
                      value={(primarySerialConfig.start || 1) + (printCount - 1) * (primarySerialConfig.increment || 1)}
                      onChange={e => handleSerialEndChange(e.target.value === '' ? 1 : parseInt(e.target.value) || 1)}
                      style={{ width: 100, height: 36, fontSize: 13 }}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: 8 }}>
                    Total Labels: <strong>{printCount}</strong>
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Updates the start value of your counter and automatically calculates the right quantity.
                </div>
              </>
            ) : (
              <>
                <label className="input-label" style={{ marginBottom: 8, display: 'block' }}>Print Count</label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <input 
                    type="number" className="input" value={printCount}
                    onChange={e => setPrintCount(Math.max(1, +e.target.value))}
                    min={1} max={99999}
                    style={{ width: 120, height: 36, fontSize: 13 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Number of labels to generate.
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Progress bar area */}
          {progress.status !== 'idle' && (
            <div style={{
              marginTop: '4px', padding: '16px',
              background: 'var(--bg-secondary)', borderRadius: '8px',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 8 }}>
                <span style={{ color: statusColor[progress.status], fontWeight: 600 }}>
                  {progress.status.toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {progress.status === 'done' && selectedPrinter !== 'PDF'
                    ? `Successfully sent ${progress.totalRows} labels to ${selectedPrinter}`
                    : `${progress.completedRows} of ${progress.totalRows} labels ${progress.status === 'done' ? 'rendered' : 'rendering'} (${percent}%)`
                  }
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{formatTime(progress.elapsedMs)}</span>
              </div>
              <div style={{
                height: 6, background: 'var(--border-default)', borderRadius: 3, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${percent}%`,
                  background: progress.status === 'failed' ? 'var(--accent-error)'
                    : progress.status === 'done' ? 'var(--accent-success)'
                      : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                  transition: 'width 0.3s ease',
                }} />
              </div>

              {progress.status === 'done' && selectedPrinter !== 'PDF' && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                  fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '14px' }}>ℹ️</span>
                  <span>
                    Your labels are now in the <strong>{selectedPrinter}</strong> system queue.
                    If they don't print, please check your OS "Devices and Printers" settings.
                  </span>
                </div>
              )}

              {progress.errors.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 80, overflow: 'auto', fontSize: '12px', color: 'var(--accent-error)' }}>
                  {progress.errors.map((err, i) => (
                    <div key={i}>Row {err.rowIndex}: {err.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px', background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'flex-end', gap: '12px'
        }}>
          <button className="btn" onClick={exportPdf} disabled={progress.status === 'running'}>
            Export as PDF
          </button>
          <button
            className="btn btn--primary"
            onClick={handlePrint}
            disabled={progress.status === 'running'}
            style={{ padding: '0 24px' }}
          >
            {progress.status === 'running' ? 'Printing...' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
