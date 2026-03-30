import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileSpreadsheet, AlertCircle, Database, Check } from 'lucide-react';
import { useDataStore } from '../../store/data';
import { invokeIPC } from '../../hooks/useIPC';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DataImportModal({ isOpen, onClose }: DataImportModalProps) {
  const { addSource } = useDataStore();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stagedFile, setStagedFile] = useState<{
    name: string;
    path: string;
    type: 'csv' | 'excel';
    columns: { name: string; dtype: string }[];
    rows: any[];
    rowCount: number;
    internalPath?: string;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TEXT_FORMATS = ['csv', 'tsv', 'txt', 'json'];

  const processFile = async (file: File) => {
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const sourcePath = (file as any).path || file.name;
      let internalPath: string | undefined;
      let columns: { name: string; dtype: string }[] = [];
      let rows: any[] = [];
      let rowCount = 0;

      if (TEXT_FORMATS.includes(ext)) {
        // ── Client-side parsing (no engine needed) ─────────────────────────
        const text = await file.text();

        if (ext === 'json') {
          const json = JSON.parse(text);
          const records: any[] = Array.isArray(json) ? json : json.data || json.records || [];
          if (!records.length) throw new Error('No rows found in JSON file');
          columns = Object.keys(records[0]).map((name: string) => ({ name, dtype: 'string' }));
          rows = records.filter((r: any) => Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== ""));
          rowCount = rows.length;
        } else {
          // CSV / TSV / TXT — PapaParse auto-detects delimiter
          const results = Papa.parse<Record<string, unknown>>(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false, // keep everything as strings for safety
          });
          if (results.errors.length > 0 && results.data.length === 0) {
            throw new Error(`Parse error: ${results.errors[0].message}`);
          }
          const fields = results.meta.fields || [];
          columns = fields.map((name: string) => ({ name, dtype: 'string' }));
          rows    = results.data.filter((r: any) => Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== ""));
          rowCount = rows.length;
        }

        // Persist internally (non-fatal) — removed since rows are now persisted in store

      } else if (['xlsx', 'xls'].includes(ext)) {
        // ── Client-side Excel parsing via SheetJS ────────
        const arrayBuf = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuf, { type: 'array', cellDates: true, cellNF: false, cellText: false });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // Use header: 1 to get all raw data, then map to ensures strings and headers are correctly handled
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        if (rawRows.length < 1) throw new Error('Excel file appears to be empty.');

        const headers = (rawRows[0] || []).map(h => String(h || '').trim());
        if (headers.length === 0) throw new Error('No headers found in first row of Excel.');

        const dataRows = rawRows.slice(1);
        columns = headers.map(name => ({ name, dtype: 'string' }));
        
        // Map rows to objects using headers as keys and filter empty ones
        rows = dataRows
          .filter(row => row.some(v => v !== null && v !== undefined && String(v).trim() !== ""))
          .map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
              const val = row[i];
              obj[h] = val === undefined || val === null ? '' : String(val);
            });
            return obj;
          });
        
        rowCount = rows.length;

      } else if (['db', 'sqlite', 'sqlite3'].includes(ext)) {
        // ── SQLite still uses Python engine (true database) ─────────────────
        const openRes = await (window as any).electron.ipcRenderer.invoke('data:open', {
          path: sourcePath,
          type: ext,
        });

        if (openRes?.columns && openRes.columns.length > 0) {
          columns  = openRes.columns;
          rows     = openRes.rows ?? [];
          rowCount = openRes.row_count ?? rows.length;
        } else {
          let msg = openRes?.error || 'Engine offline or file could not be read.';
          let diag = '';
          try {
            const status = await (window as any).electron.ipcRenderer.invoke('engine:get-status');
            if (status?.status) diag = `\n\nDiagnostics: ${status.status}`;
          } catch { /* ignore */ }
          throw new Error(`${msg}${diag}`);
        }
      } else {
        throw new Error(`Unsupported file type ".${ext}". Please use CSV, Excel, JSON, TXT, TSV, or SQLite.`);
      }

      if (columns.length === 0) {
        throw new Error('No columns detected. Is the file empty or malformed?');
      }

      setStagedFile({
        name: file.name,
        path: sourcePath,
        type: (['xlsx', 'xls'].includes(ext)) ? 'excel' : 'csv',
        columns,
        rows,
        rowCount,
        internalPath,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleImport = () => {
    if (!stagedFile) return;
    addSource({
      id: `ds_${Date.now().toString(36)}`,
      type: stagedFile.type,
      path: stagedFile.path,
      name: stagedFile.name,
      columns: stagedFile.columns,
      rowCount: stagedFile.rowCount,
      rows: stagedFile.rows,
      internalPath: stagedFile.internalPath,
    });
    handleClose();
  };

  const handleClose = () => {
    setStagedFile(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif"
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              width: '100%', maxWidth: 800, background: '#fff', borderRadius: 20,
              boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)',
              display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
              maxHeight: '90vh'
            }}>
            
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={20} color="#fff" />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>Connect Data Source</h2>
                  <p style={{ fontSize: 13, color: '#888', margin: '2px 0 0 0' }}>Import any structured data file to bind to your labels.</p>
                </div>
              </div>
              <button onClick={handleClose} style={{ background: '#f5f5f5', border: 'none', width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', transition: 'background 0.2s' }}>
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: 32, overflowY: 'auto', flex: 1, background: '#fafafa' }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, color: '#b91c1c' }}>
                  <AlertCircle size={20} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{error}</span>
                </div>
              )}

              {!stagedFile ? (
                /* Upload Dropzone */
                <label
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: 280, border: `2px dashed ${dragActive ? '#1a1a1a' : '#e0e0e0'}`, borderRadius: 16,
                    background: dragActive ? '#fafafa' : '#fff', cursor: 'pointer', transition: 'all 0.2s ease',
                  }}>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json,.txt,.tsv,.db,.sqlite,.sqlite3" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) processFile(e.target.files[0]); }} />
                  <motion.div animate={{ y: dragActive ? -10 : 0 }} style={{
                    width: 64, height: 64, borderRadius: 20, background: dragActive ? '#1a1a1a' : '#f5f5f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, transition: 'background 0.2s'
                  }}>
                    <Upload size={28} color={dragActive ? '#fff' : '#1a1a1a'} strokeWidth={1.5} />
                  </motion.div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 }}>
                    Click to browse or drag file here
                  </div>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    CSV, Excel, JSON, TXT, TSV, and SQLite supported.
                  </div>
                </label>
              ) : (
                /* Data Preview */
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FileSpreadsheet size={20} color="#1a1a1a" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{stagedFile.name}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{stagedFile.rowCount} rows • {stagedFile.columns.length} columns</div>
                      </div>
                    </div>
                    <button onClick={() => setStagedFile(null)} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' }}>
                      Change File
                    </button>
                  </div>

                  {/* Table Preview */}
                  <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead style={{ background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
                          <tr>
                            <th style={{ padding: '12px 16px', color: '#888', fontWeight: 600, width: 40 }}>#</th>
                            {stagedFile.columns.map((col, i) => (
                              <th key={i} style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {col.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stagedFile.rows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '10px 16px', color: '#999' }}>{i + 1}</td>
                              {stagedFile.columns.map((col, j) => (
                                <td key={j} style={{ padding: '10px 16px', color: '#444', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {row[col.name]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {stagedFile.rowCount > 1000 && (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: '#888', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                        Showing first 1000 rows. Scroll to see all records.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {stagedFile && (
              <div style={{ padding: '20px 32px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#fff' }}>
                <button onClick={handleClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e0e0e0', background: '#fff', color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleImport} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  <Check size={16} strokeWidth={3} /> Import Data
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
