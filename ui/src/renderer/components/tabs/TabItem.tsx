// src/renderer/components/tabs/TabItem.tsx — Single Tab Chip
import React, { useRef, useEffect, useState } from 'react';
import type { TabMeta, TabId } from '../../types/tabs';
import styles from './TabItem.module.css';

interface TabItemProps {
  tab: TabMeta;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onRenameCommit: (name: string) => void;
}

export function TabItem({
  tab, isActive, onClick, onClose, onContextMenu,
  draggable, onDragStart, onDrop, onDragOver, onDragEnter, onDragLeave,
  onRenameCommit,
}: TabItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [renameVal, setRenameVal] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab.isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [tab.isRenaming]);

  const cls = [
    styles.tab,
    isActive ? styles.active : '',
    isDragging ? styles.dragging : '',
    isDropTarget ? styles.dropTarget : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      data-tabid={tab.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={e => { e.stopPropagation(); onContextMenu(e); }}
      draggable={draggable}
      onDragStart={e => { setIsDragging(true); onDragStart(e); }}
      onDragEnd={() => setIsDragging(false)}
      onDrop={e => { setIsDropTarget(false); onDrop(e); }}
      onDragOver={e => { onDragOver(e); }}
      onDragEnter={e => { setIsDropTarget(true); onDragEnter(e); }}
      onDragLeave={e => { setIsDropTarget(false); onDragLeave(e); }}
    >
      {/* Thumbnail or placeholder */}
      {tab.thumbnail
        ? <img className={styles.thumbnail} src={tab.thumbnail} alt="" />
        : <div className={styles.thumbPlaceholder} />}

      {/* Dirty indicator */}
      {tab.saveState === 'unsaved' && !isActive && (
        <span className={styles.dirtyDot} title="Unsaved" />
      )}

      {/* Name or rename input */}
      {tab.isRenaming ? (
        <input
          ref={inputRef}
          className={styles.nameInput}
          value={renameVal}
          onChange={e => setRenameVal(e.target.value)}
          onBlur={() => onRenameCommit(renameVal)}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameCommit(renameVal);
            if (e.key === 'Escape') onRenameCommit(tab.name);
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className={styles.name}>{tab.name}</span>
      )}

      {/* Dirty dot for active tab (inside, after name) */}
      {tab.saveState === 'unsaved' && isActive && (
        <span className={styles.dirtyDot} title="Unsaved" />
      )}

      {/* Close button */}
      <button
        className={styles.closeBtn}
        onClick={e => { e.stopPropagation(); onClose(); }}
        title="Close tab"
        aria-label="Close tab"
      >
        ×
      </button>
    </div>
  );
}
