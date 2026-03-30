// src/renderer/hooks/useBarcodeRenderer.ts
// Client-side barcode + QR rendering via bwip-js v4
// ═══════════════════════════════════════════════════════════════════

import * as bwipjs from 'bwip-js';

const SYMBOLOGY_MAP: Record<string, string> = {
  qrcode:     'qrcode',
  code128:    'code128',
  code39:     'code39',
  ean13:      'ean13',
  ean8:       'ean8',
  itf14:      'interleaved2of5',
  datamatrix: 'datamatrix',
  pdf417:     'pdf417',
  gs1_128:    'gs1-128',
};

function getToCanvas(): ((canvas: HTMLCanvasElement, opts: any) => any) | null {
  const lib = bwipjs as any;
  if (typeof lib.toCanvas === 'function') return lib.toCanvas;
  if (lib.default && typeof lib.default.toCanvas === 'function') return lib.default.toCanvas;
  return null;
}

/**
 * Render a barcode or QR code browser-side using bwip-js.
 * Returns a PNG data URL, or null on failure.
 */
export async function renderBarcodeClientSide(
  symbology: string,
  data: string,
  widthPx: number,
  heightPx: number,
): Promise<string | null> {
  if (widthPx < 4 || heightPx < 4 || !data) return null;

  const bcid = SYMBOLOGY_MAP[symbology] || 'code128';
  const isSquare = symbology === 'qrcode' || symbology === 'datamatrix';

  const toCanvas = getToCanvas();
  if (!toCanvas) {
    console.error('[BarcodeRenderer] bwip-js toCanvas not found. Module keys:', Object.keys(bwipjs as any).slice(0, 10));
    return null;
  }

  try {
    const canvas = document.createElement('canvas');

    const opts: Record<string, any> = {
      bcid,
      text: data,
      scale: 3,
    };

    if (!isSquare) {
      opts.height = Math.max(5, heightPx * 0.2646);
      opts.includetext = false;
    }

    toCanvas(canvas, opts);

    const outW = Math.max(1, Math.round(widthPx));
    const outH = Math.max(1, Math.round(heightPx));

    if (isSquare) {
      const dim = Math.min(outW, outH);
      const src = Math.min(canvas.width, canvas.height);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d')!;
      const ox = (out.width - dim) / 2;
      const oy = (out.height - dim) / 2;
      ctx.drawImage(canvas, 0, 0, src, src, ox, oy, dim, dim);
      return out.toDataURL('image/png');
    }

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');

  } catch (err: any) {
    console.warn('[BarcodeRenderer] render error for', bcid, data, ':', err?.message || err);
    return null;
  }
}
