// src/renderer/components/tabs/TabBar.tsx — Tab Bar Container
import React, { useRef, useState, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs';
import { useShallow } from 'zustand/react/shallow';
import { TabItem } from './TabItem';
import { TabContextMenu } from './TabContextMenu';
import type { TabId, Tab } from '../../types/tabs';
import styles from './TabBar.module.css';

export function TabBar() {
  // IMPORTANT: Do NOT use s.getMeta() as a selector — it calls .map() and returns
  // a brand-new array every invocation, failing Zustand's === check → infinite loop.
  // Instead, select raw s.tabs with useShallow so Zustand does a shallow comparison
  // of the array members (by reference) rather than always treating them as changed.
  const tabs = useTabsStore(useShallow((s): Tab[] => s.tabs));
  const activeId = useTabsStore(s => s.activeId);
  const openTab = useTabsStore(s => s.openTab);
  const switchTab = useTabsStore(s => s.switchTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const reorder = useTabsStore(s => s.reorderTab);
  const renameTab = useTabsStore(s => s.renameTab);

  const stripRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: TabId; x: number; y: number } | null>(null);

  const scrollActiveIntoView = useCallback((id: TabId) => {
    const el = stripRef.current?.querySelector(`[data-tabid="${id}"]`) as HTMLElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  const onDragStart = (e: React.DragEvent, id: TabId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/tabid', id);
  };

  const onDrop = (e: React.DragEvent, targetId: TabId) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/tabid');
    if (!fromId || fromId === targetId) return;
    const fromIdx = tabs.findIndex((t: Tab) => t.id === fromId);
    const toIdx = tabs.findIndex((t: Tab) => t.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) reorder(fromIdx, toIdx);
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDragEnter = (e: React.DragEvent) => e.preventDefault();
  const onDragLeave = (e: React.DragEvent) => e.preventDefault();

  const scrollLeft = () => { if (stripRef.current) stripRef.current.scrollLeft -= 180; };
  const scrollRight = () => { if (stripRef.current) stripRef.current.scrollLeft += 180; };

  return (
    <div className={styles.tabBar}>
      <button className={styles.scrollBtn} onClick={scrollLeft} aria-label="Scroll tabs left">‹</button>

      <div ref={stripRef} className={styles.strip}>
        {tabs.map((tab: Tab) => (
          <TabItem
            key={tab.id}
            tab={{
              id: tab.id,
              name: tab.name,
              filePath: tab.filePath,
              saveState: tab.saveState,
              thumbnail: tab.thumbnail,
              isRenaming: tab.isRenaming,
              configW: tab.label.width_mm,
              configH: tab.label.height_mm,
            }}
            isActive={tab.id === activeId}
            onClick={() => { switchTab(tab.id); scrollActiveIntoView(tab.id); }}
            onClose={() => closeTab(tab.id)}
            onContextMenu={e => {
              e.preventDefault();
              setCtxMenu({ id: tab.id, x: e.clientX, y: e.clientY });
            }}
            draggable
            onDragStart={e => onDragStart(e, tab.id)}
            onDrop={e => onDrop(e, tab.id)}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onRenameCommit={name => renameTab(tab.id, name)}
          />
        ))}
      </div>

      <button className={styles.scrollBtn} onClick={scrollRight} aria-label="Scroll tabs right">›</button>

      <button
        className={styles.newTab}
        onClick={() => openTab({ type: 'new' })}
        aria-label="New tab"
        title="New tab"
      >
        +
      </button>

      {ctxMenu && (
        <TabContextMenu
          tabId={ctxMenu.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
