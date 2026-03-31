// src/renderer/components/ui/LayersPanel.tsx — Figma-like Layers Panel
import React, { useState } from 'react';
import { useCanvasStoreCompat } from '../../store/canvas';
import { Eye, EyeOff, Lock, Unlock, Copy, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import CanvasContextMenu from '../designer/CanvasContextMenu';

const TYPE_ICONS: Record<string, string> = {
  text: 'T',
  barcode: '⊞',
  qrcode: '◫',
  image: '🖼',
  rect: '□',
  line: '─',
};

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  barcode: 'Barcode',
  qrcode: 'QR Code',
  image: 'Image',
  rect: 'Shape',
  line: 'Line',
};

export default function LayersPanel() {
  const { elements, selectedId, select, reorderElement, removeElement, updateElement, duplicateElement } = useCanvasStoreCompat();
  const [collapsed, setCollapsed] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const sorted = [...elements].sort((a, b) => b.z_index - a.z_index);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== targetId) {
      const draggedIdx = sorted.findIndex(el => el.id === draggedId);
      const targetIdx = sorted.findIndex(el => el.id === targetId);
      if (draggedIdx < targetIdx) {
        reorderElement(draggedId, 'down');
      } else {
        reorderElement(draggedId, 'up');
      }
    }
    setDragOverId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleCtxAction = (action: string, id: string) => {
    switch (action) {
      case 'duplicate': duplicateElement(id); break;
      case 'delete': removeElement(id); break;
      case 'up': reorderElement(id, 'up'); break;
      case 'down': reorderElement(id, 'down'); break;
      case 'front': {
        const maxZ = Math.max(...elements.map(e => e.z_index), 0);
        updateElement(id, { z_index: maxZ + 1 });
        break;
      }
      case 'back': updateElement(id, { z_index: 0 }); break;
      case 'lock': {
        const el = elements.find(e => e.id === id);
        if (el) updateElement(id, { locked: !el.locked });
        break;
      }
      case 'rename': setRenaming(id); break;
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--space-2)', padding: '0 var(--space-1)',
      }}>
        <button onClick={() => setCollapsed(!collapsed)} 
          style={{
            background: 'none', border: 'none', cursor: 'pointer', 
            color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-sans)', padding: 0,
          }}>
          <span style={{ fontSize: 8, transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
          Layers ({elements.length})
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sorted.length === 0 ? (
            <div style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              textAlign: 'center', padding: '16px 8px',
            }}>
              No elements on the canvas.
            </div>
          ) : (
            sorted.map((elem, idx) => {
              const isSelected = elem.id === selectedId;
              const isDragOver = elem.id === dragOverId;
              return (
              <div key={elem.id}
                draggable
                onDragStart={e => handleDragStart(e, elem.id)}
                onDragOver={e => handleDragOver(e, elem.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => handleDrop(e, elem.id)}
                onContextMenu={e => handleContextMenu(e, elem.id)}
                onClick={() => select(elem.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  background: isSelected ? 'var(--bg-active)' : isDragOver ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.1s ease',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Visibility & Lock Toggles */}
                <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
                  <span className="layer-action-icon" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, 
                    borderRadius: 4, cursor: 'pointer', color: elem.hidden ? '#888' : '#bbb',
                    opacity: elem.hidden || isSelected ? 1 : 0.4,
                    transition: 'opacity 0.2s, background 0.2s, color 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1a1a1a'; e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = elem.hidden ? '#888' : '#bbb'; e.currentTarget.style.background = 'transparent'; }}
                    onClick={e => { e.stopPropagation(); updateElement(elem.id, { hidden: !elem.hidden }); }}>
                    {elem.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </span>

                  <span className="layer-action-icon" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, 
                    borderRadius: 4, cursor: 'pointer', color: elem.locked ? '#888' : '#bbb',
                    opacity: elem.locked || isSelected ? 1 : 0.4,
                    transition: 'opacity 0.2s, background 0.2s, color 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1a1a1a'; e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = elem.locked ? '#888' : '#bbb'; e.currentTarget.style.background = 'transparent'; }}
                    onClick={e => { e.stopPropagation(); updateElement(elem.id, { locked: !elem.locked }); }}>
                    {elem.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </span>
                </div>

                {/* Type icon */}
                <span style={{
                  width: 18, height: 18, borderRadius: 3,
                  background: 'var(--bg-elevated)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
                  flexShrink: 0,
                }}>
                  {TYPE_ICONS[elem.type] || '?'}
                </span>

                {/* Name */}
                {renaming === elem.id ? (
                  <input autoFocus
                    defaultValue={(elem as any).name || elem.value || TYPE_LABELS[elem.type]}
                    onBlur={e => { updateElement(elem.id, { name: e.target.value } as any); setRenaming(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      flex: 1, border: '1px solid var(--accent-primary)', borderRadius: 3, padding: '1px 4px',
                      fontSize: 'var(--text-xs)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)', outline: 'none',
                    }}
                  />
                ) : (
                  <span onDoubleClick={() => setRenaming(elem.id)} style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isSelected ? 500 : 400,
                  }}>
                    {(elem as any).name || elem.value || TYPE_LABELS[elem.type]}
                  </span>
                )}

                {/* Z-index indicator */}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 12, textAlign: 'right' }}>
                  {sorted.length - idx}
                </span>
              </div>
              );
            })
          )}
        </div>
      )}

      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x} y={contextMenu.y} elementId={contextMenu.id}
          onClose={closeContextMenu}
          onAction={handleCtxAction}
          isLocked={elements.find(e => e.id === contextMenu.id)?.locked ?? false}
        />
      )}
    </div>
  );
}
