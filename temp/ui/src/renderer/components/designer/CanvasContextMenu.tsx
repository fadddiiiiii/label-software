// src/renderer/components/designer/CanvasContextMenu.tsx — Figma-like Right-Click Menu
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Trash2, ArrowUp, ArrowDown, Lock, Unlock, Pencil,
  FlipHorizontal, FlipVertical, AlignCenterHorizontal,
  MoveUp, MoveDown, Layers, Eye, EyeOff, Clipboard,
} from 'lucide-react';

interface ContextMenuItem {
  icon: React.ElementType;
  label: string;
  hotkey?: string;
  onClick: () => void;
  danger?: boolean;
  separator?: false;
}

interface ContextMenuSeparator {
  separator: true;
}

type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface CanvasContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  onClose: () => void;
  onAction: (action: string, id: string) => void;
  isLocked: boolean;
}

export default function CanvasContextMenu({ x, y, elementId, onClose, onAction, isLocked }: CanvasContextMenuProps) {
  const items: ContextMenuEntry[] = [
    { icon: Copy, label: 'Duplicate', hotkey: '⌘D', onClick: () => onAction('duplicate', elementId) },
    { icon: Clipboard, label: 'Copy Style', hotkey: '⌥⌘C', onClick: () => onAction('copy-style', elementId) },
    { separator: true },
    { icon: MoveUp, label: 'Bring to Front', hotkey: ']', onClick: () => onAction('front', elementId) },
    { icon: ArrowUp, label: 'Bring Forward', hotkey: '⌘]', onClick: () => onAction('up', elementId) },
    { icon: ArrowDown, label: 'Send Backward', hotkey: '⌘[', onClick: () => onAction('down', elementId) },
    { icon: MoveDown, label: 'Send to Back', hotkey: '[', onClick: () => onAction('back', elementId) },
    { separator: true },
    { icon: isLocked ? Unlock : Lock, label: isLocked ? 'Unlock' : 'Lock', hotkey: '⌘L', onClick: () => onAction('lock', elementId) },
    { icon: Pencil, label: 'Rename', onClick: () => onAction('rename', elementId) },
    { separator: true },
    { icon: Trash2, label: 'Delete', hotkey: '⌫', onClick: () => onAction('delete', elementId), danger: true },
  ];

  // Adjust position so menu doesn't clip off-screen
  const menuW = 220, menuH = items.length * 34;
  const adjX = Math.min(x, window.innerWidth - menuW - 8);
  const adjY = Math.min(y, window.innerHeight - menuH - 8);

  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 9000 }} />

      {/* Menu */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -4 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        style={{
          position: 'fixed', left: adjX, top: adjY, zIndex: 9001,
          width: menuW, background: '#fff', borderRadius: 12,
          border: '1px solid #e8e8e8', padding: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          fontFamily: "'Poppins', sans-serif",
        }}>
        {items.map((item, idx) => {
          if ('separator' in item && item.separator) {
            return <div key={idx} style={{ height: 1, background: '#f0f0f0', margin: '4px 8px' }} />;
          }
          const mi = item as ContextMenuItem;
          const Icon = mi.icon;
          const isHovered = hoveredIdx === idx;
          return (
            <button key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => { mi.onClick(); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '7px 10px', border: 'none', borderRadius: 8,
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: isHovered ? '#f5f5f5' : 'transparent',
                color: mi.danger ? '#ef4444' : '#1a1a1a',
                fontFamily: "'Poppins', sans-serif",
                transition: 'background 0.1s ease',
                position: 'relative', overflow: 'hidden',
              }}>
              {/* Animated hover highlight */}
              {isHovered && (
                <motion.div
                  layoutId="ctx-hover"
                  style={{
                    position: 'absolute', inset: 0, background: '#f5f5f5',
                    borderRadius: 8, zIndex: -1,
                  }}
                  transition={{ duration: 0.1 }}
                />
              )}
              <Icon size={15} strokeWidth={1.8} color={mi.danger ? '#ef4444' : '#555'} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{mi.label}</span>
              {mi.hotkey && (
                <span style={{ fontSize: 10, color: '#bbb', fontWeight: 400, letterSpacing: '0.02em' }}>
                  {mi.hotkey}
                </span>
              )}
            </button>
          );
        })}
      </motion.div>
    </>
  );
}
