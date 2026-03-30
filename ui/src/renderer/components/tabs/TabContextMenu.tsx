// src/renderer/components/tabs/TabContextMenu.tsx — Right-click Tab Menu
import React from 'react';
import { createPortal } from 'react-dom';
import type { TabId } from '../../types/tabs';
import { useTabsStore } from '../../store/tabs';
import styles from './TabContextMenu.module.css';

interface TabContextMenuProps {
  tabId: TabId;
  x: number;
  y: number;
  onClose: () => void;
}

export function TabContextMenu({ tabId, x, y, onClose }: TabContextMenuProps) {
  const { closeTab, closeOthers, closeAll, closeSaved, duplicateTab, startRenaming, tabs, activeId } = useTabsStore();
  const tab = tabs.find(t => t.id === tabId);

  const run = (fn: () => void) => { onClose(); fn(); };

  const handleSave = async () => {
    onClose();
    if (!tab) return;
    try {
      const res = await (window as any).electron?.ipcRenderer?.invoke('template:saveTab', {
        tab,
        path: tab.filePath,
      });
      if (res?.ok && res.path) {
        useTabsStore.getState().markSaved(tabId, res.path);
      }
    } catch { /* IPC not available */ }
  };

  const handleSaveAs = async () => {
    onClose();
    if (!tab) return;
    try {
      const res = await (window as any).electron?.ipcRenderer?.invoke('template:saveTab', {
        tab,
        path: null, // triggers Save As dialog
      });
      if (res?.ok && res.path) {
        useTabsStore.getState().markSaved(tabId, res.path);
      }
    } catch { /* IPC not available */ }
  };

  const handleReveal = async () => {
    onClose();
    if (tab?.filePath) {
      try {
        await (window as any).electron?.ipcRenderer?.invoke('shell:showInFolder', tab.filePath);
      } catch { /* IPC not avail */ }
    }
  };

  const handleCopyPath = () => {
    onClose();
    if (tab?.filePath) navigator.clipboard.writeText(tab.filePath);
  };

  // Position clamped to viewport
  const menuStyle: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 320),
  };

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div className={styles.menu} style={menuStyle}>
        <button className={styles.item} onClick={() => run(() => closeTab(tabId))}>
          Close Tab <span className={styles.shortcut}>⌘W</span>
        </button>
        <button className={styles.item} onClick={() => run(() => closeOthers(tabId))}>
          Close Other Tabs <span className={styles.shortcut}>⌥⌘W</span>
        </button>
        <button className={styles.item} onClick={() => run(() => closeAll())}>
          Close All Tabs <span className={styles.shortcut}>⇧⌘W</span>
        </button>
        <button className={styles.item} onClick={() => run(() => closeSaved())}>
          Close Saved Tabs
        </button>

        <div className={styles.separator} />

        <button className={styles.item} onClick={() => run(() => duplicateTab(tabId))}>
          Duplicate Tab <span className={styles.shortcut}>⌘D</span>
        </button>
        <button className={styles.item} onClick={() => run(() => startRenaming(tabId))}>
          Rename… <span className={styles.shortcut}>F2</span>
        </button>

        <div className={styles.separator} />

        <button className={styles.item} onClick={handleSave}>
          Save <span className={styles.shortcut}>⌘S</span>
        </button>
        <button className={styles.item} onClick={handleSaveAs}>
          Save As… <span className={styles.shortcut}>⇧⌘S</span>
        </button>

        <div className={styles.separator} />

        <button
          className={styles.item}
          onClick={handleReveal}
          style={{ opacity: tab?.filePath ? 1 : 0.4, pointerEvents: tab?.filePath ? 'auto' : 'none' }}
        >
          Reveal in Finder
        </button>
        <button
          className={styles.item}
          onClick={handleCopyPath}
          style={{ opacity: tab?.filePath ? 1 : 0.4, pointerEvents: tab?.filePath ? 'auto' : 'none' }}
        >
          Copy File Path
        </button>
      </div>
    </>,
    document.body
  );
}
