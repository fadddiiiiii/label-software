import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataStore } from '../../store/data';
import { Upload, X, ChevronLeft, ChevronRight, Database, FileText, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';
import DataImportModal from './DataImportModal';

export default function DataSourcePanel() {
  const { sources, activeSourceId, setActiveSource, removeSource, currentPreviewRow, setPreviewRow, isDataSourceModalOpen, setDataSourceModalOpen, refreshSource } = useDataStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const active = sources.find(s => s.id === activeSourceId);

  const handleRefresh = async () => {
    if (!activeSourceId) return;
    setIsRefreshing(true);
    setRefreshStatus('idle');
    setErrorMsg(null);
    try {
      const res = await refreshSource(activeSourceId);
      if (res.ok) {
        setRefreshStatus('success');
        setTimeout(() => setRefreshStatus('idle'), 2000);
      } else {
        setRefreshStatus('error');
        setErrorMsg(res.error || 'Refresh failed');
      }
    } catch (err: any) {
      setRefreshStatus('error');
      setErrorMsg(err.message || 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isDataSourceModalOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDataSourceModalOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
        <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
          style={{ position: 'relative', zIndex: 1, width: 800, maxWidth: '95vw', background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, color: '#1a1a1a', letterSpacing: '-0.02em' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                <Database size={24} strokeWidth={2.5} />
              </div>
              Data Sources
            </div>
            <button onClick={() => setDataSourceModalOpen(false)} style={{ background: '#f5f5f7', border: 'none', cursor: 'pointer', width: 36, height: 36, color: '#999', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#eee'; e.currentTarget.style.color = '#666'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f7'; e.currentTarget.style.color = '#999'; }}>
              <X size={20} />
            </button>
          </div>

          <p style={{ fontSize: 14, color: '#888', marginBottom: 0 }}>Manage and bind external data to your label elements.</p>

          <button className="btn" onClick={() => setIsModalOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 0', fontSize: 15, fontWeight: 600, background: '#1a1a1a', color: '#fff',
              border: 'none', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <Upload size={18} strokeWidth={2.5} />
            Connect New Source
          </button>

          <DataImportModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

          {sources.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              padding: '60px 0', border: '2px dashed #f0f0f2', borderRadius: 16, background: '#fafafb'
            }}>
              <div style={{ color: '#ddd' }}>
                <Database size={48} strokeWidth={1} />
              </div>
              <div style={{ fontSize: 14, color: '#aaa', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                No records connected yet. Load a <b>CSV</b>, <b>Excel</b> or <b>JSON</b> file to start batching.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Refined Source Tabs */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {sources.map(s => {
                  const isActive = s.id === activeSourceId;
                  return (
                    <div key={s.id}
                      style={{
                        position: 'relative', display: 'flex', alignItems: 'center',
                        background: isActive ? '#f5f5f7' : '#fff',
                        border: `2px solid ${isActive ? '#1a1a1a' : '#ebebeb'}`,
                        borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                        overflow: 'hidden'
                      }}
                      onClick={() => setActiveSource(s.id)}>
                      
                      <div style={{
                        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 13, fontWeight: 600, color: isActive ? '#1a1a1a' : '#888'
                      }}>
                        <div style={{ opacity: isActive ? 1 : 0.5 }}>
                          <FileText size={16} />
                        </div>
                        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(s.path || '').split(/[/\\]/).pop() || s.name || 'Untitled'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', paddingRight: 6 }}>
                        {isActive ? (
                          <button
                            title="Deselect"
                            onClick={e => { e.stopPropagation(); setActiveSource(''); }}
                            style={{
                              background: 'none', border: 'none', padding: 8, borderRadius: 8,
                              color: '#aaa', cursor: 'pointer', display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#e2e2e5'; e.currentTarget.style.color = '#666'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#aaa'; }}>
                            <X size={16} />
                          </button>
                        ) : (
                          <button
                            title="Remove source"
                            onClick={e => { e.stopPropagation(); removeSource(s.id); }}
                            style={{
                              background: 'none', border: 'none', padding: 8, borderRadius: 8,
                              color: '#ddd', cursor: 'pointer', display: 'flex', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ddd'; }}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active source details area */}
              {active && (
                <div style={{
                  background: '#1a1a1a', borderRadius: 16, padding: 24,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.15)', color: '#fff'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Data Composition
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                        {active.rowCount} Rows <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 8px' }}>•</span> {active.columns.length} Columns
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Refresh Button */}
                      <div style={{ position: 'relative' }}>
                        <button onClick={handleRefresh} disabled={isRefreshing}
                          style={{
                            background: refreshStatus === 'success' ? '#22c55e' : (refreshStatus === 'error' ? '#ef4444' : 'rgba(255,255,255,0.08)'), 
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                            padding: '8px 12px', color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { if(!isRefreshing) e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                          onMouseLeave={e => { if(!isRefreshing) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}>
                          {refreshStatus === 'success' ? <CheckCircle2 size={16} /> : <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
                          {refreshStatus === 'success' ? 'Updated' : (refreshStatus === 'error' ? 'Retry' : 'Refresh')}
                        </button>
                        {errorMsg && (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                            background: '#ef4444', color: '#fff', padding: '6px 12px',
                            borderRadius: 6, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10,
                            animation: 'fadeInDown 0.2s ease-out'
                          }}>
                            {errorMsg}
                          </div>
                        )}
                      </div>

                      {/* Elevated Navigator */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)',
                        padding: '6px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        <button style={{
                          background: 'none', border: 'none', cursor: currentPreviewRow === 0 ? 'default' : 'pointer',
                          padding: 6, borderRadius: 8, color: '#fff', opacity: currentPreviewRow === 0 ? 0.2 : 1, transition: '0.2s'
                        }}
                          onMouseEnter={e => { if (currentPreviewRow > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          onClick={() => setPreviewRow(Math.max(0, currentPreviewRow - 1))} disabled={currentPreviewRow === 0}>
                          <ChevronLeft size={18} />
                        </button>
                        <div style={{ minWidth: 50, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>
                          {currentPreviewRow + 1} <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/ {active.rowCount}</span>
                        </div>
                        <button style={{
                          background: 'none', border: 'none', cursor: currentPreviewRow >= active.rowCount - 1 ? 'default' : 'pointer',
                          padding: 6, borderRadius: 8, color: '#fff', opacity: currentPreviewRow >= active.rowCount - 1 ? 0.2 : 1, transition: '0.2s'
                        }}
                          onMouseEnter={e => { if (currentPreviewRow < active.rowCount - 1) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          onClick={() => setPreviewRow(Math.min(active.rowCount - 1, currentPreviewRow + 1))} disabled={currentPreviewRow >= active.rowCount - 1}>
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Datatable Table Preview */}
                  <div style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column'
                  }}>
                    <div style={{ overflowX: 'auto', maxHeight: 320 }}>
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: 12 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#222', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <tr>
                            <th style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, width: 45, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>#</th>
                            {active.columns.map(c => (
                              <th key={c.name} style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.8)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(active.rows || []).map((row, i) => {
                            const isSelected = i === currentPreviewRow;
                            return (
                              <tr key={i} onClick={() => setPreviewRow(i)}
                                style={{ 
                                  background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                  cursor: 'pointer', transition: 'all 0.1s'
                                }}
                                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                                <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{i + 1}</td>
                                {active.columns.map(c => (
                                  <td key={c.name} style={{ padding: '10px 14px', color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row[c.name] || <span style={{ fontStyle: 'italic', opacity: 0.2 }}>empty</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {active.rowCount > 1000 && (
                      <div style={{ padding: '10px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                        Showing first 1000 rows. Scroll to see all records.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
