// src/renderer/utils/thumbnail.ts — Tab Thumbnail Generation
// ═══════════════════════════════════════════════════════════════════
// Renders a tiny 48×34px base64 PNG of the label for the tab icon.
// Called after save, lazily on first tab creation.
import type { Tab } from '../types/tabs';

const THUMB_W = 48;
const THUMB_H = 34;

export async function generateThumbnail(tab: Tab): Promise<string> {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const { width_mm, height_mm, background_color, shape } = tab.label;
  const scale = Math.min(THUMB_W / width_mm, THUMB_H / height_mm) * 0.85;
  const lw = width_mm * scale;
  const lh = height_mm * scale;
  const ox = (THUMB_W - lw) / 2;
  const oy = (THUMB_H - lh) / 2;

  // Canvas background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  // Label fill
  ctx.fillStyle = background_color || '#FFFFFF';
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 0.5;

  if (shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(ox + lw / 2, oy + lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  } else if (shape === 'round_rect') {
    const r = Math.min(2, lw * 0.08);
    ctx.beginPath();
    (ctx as any).roundRect?.(ox, oy, lw, lh, r) ?? ctx.rect(ox, oy, lw, lh);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.fillRect(ox, oy, lw, lh);
    ctx.strokeRect(ox, oy, lw, lh);
  }

  // Render simplified elements
  const MM = scale * (96 / 25.4);
  for (const el of tab.elements.slice(0, 30)) {
    if (el.type === 'text') {
      ctx.fillStyle = el.color || '#333';
      ctx.font = `${Math.max(1, (el.font_size || 4) * MM * 0.35)}px sans-serif`;
      ctx.fillText(el.value || '', ox + el.x_mm * MM, oy + (el.y_mm + el.height_mm / 2) * MM, el.width_mm * MM);
    } else if (el.type === 'barcode' || el.type === 'qrcode') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(ox + el.x_mm * MM, oy + el.y_mm * MM, el.width_mm * MM, el.height_mm * MM);
    } else if (el.type === 'rect') {
      if (el.fill_color && el.fill_color !== 'none' && el.filled) {
        ctx.fillStyle = el.fill_color;
        ctx.fillRect(ox + el.x_mm * MM, oy + el.y_mm * MM, el.width_mm * MM, el.height_mm * MM);
      }
      if (el.border_color) {
        ctx.strokeStyle = el.border_color;
        ctx.lineWidth = (el.border_width || 0.5) * scale;
        ctx.strokeRect(ox + el.x_mm * MM, oy + el.y_mm * MM, el.width_mm * MM, el.height_mm * MM);
      }
    } else if (el.type === 'line') {
      ctx.strokeStyle = el.border_color || '#000';
      ctx.lineWidth = (el.border_width || 0.5) * scale;
      ctx.beginPath();
      ctx.moveTo(ox + el.x_mm * MM, oy + el.y_mm * MM);
      ctx.lineTo(ox + (el.x_mm + el.width_mm) * MM, oy + (el.y_mm + el.height_mm) * MM);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}
