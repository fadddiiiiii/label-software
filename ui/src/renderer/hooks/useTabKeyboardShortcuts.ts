// src/renderer/hooks/useTabKeyboardShortcuts.ts — Tab Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════════
import { useEffect } from 'react';
import { useTabsStore } from '../store/tabs';
import { undoCanvas, redoCanvas } from '../store/canvas';

export function useTabKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      console.log('Tab Shortcut handler triggered:', e.key, 'meta:', meta);
      if (!meta) return;

      // Let browser/Electron system shortcuts pass through (reload, devtools)
      const k = e.key.toLowerCase();
      if (k === 'r' || k === 'f5' || (k === 'i' && e.shiftKey && e.altKey) || k === 'f12') return;

      const { tabs, activeId, switchTab, closeTab, closeAll, openTab, duplicateTab } = useTabsStore.getState();
      const activeIdx = tabs.findIndex(t => t.id === activeId);

      // ⌘W — close active tab
      if (e.key === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeId) closeTab(activeId);
        return;
      }

      // ⌘⇧W — close all tabs
      if (e.key === 'w' && e.shiftKey) {
        e.preventDefault();
        closeAll();
        return;
      }

      // ⌘Tab — cycle forward
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (tabs.length === 0) return;
        const nextIdx = (activeIdx + 1) % tabs.length;
        switchTab(tabs[nextIdx].id);
        return;
      }

      // ⌘⇧Tab — cycle backward
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        if (tabs.length === 0) return;
        const prevIdx = (activeIdx - 1 + tabs.length) % tabs.length;
        switchTab(tabs[prevIdx].id);
        return;
      }

      // ⌘D — duplicate active tab
      if (e.key === 'd' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeId) duplicateTab(activeId);
        return;
      }

      // ⌘T — new tab
      if (e.key === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openTab({ type: 'new' });
        return;
      }

      // ⌘1–⌘9 — jump to tab by position
      const numKey = parseInt(e.key, 10);
      if (!isNaN(numKey) && numKey >= 1 && numKey <= 9) {
        e.preventDefault();
        const target = tabs[numKey - 1];
        if (target) switchTab(target.id);
        return;
      }

      // ⌘Z — undo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoCanvas();
        return;
      }

      // ⌘⇧Z or ⌘Y — redo
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoCanvas();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
