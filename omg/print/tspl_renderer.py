# FILE: omg/print/tspl_renderer.py
# TSPL2 Renderer — Native Toshiba/TSC Label Printer Code Generator
# ═══════════════════════════════════════════════════════════════════
# Translates OMG CanvasElements into TSPL2 commands for Toshiba B-FV4
# and other TSC/Toshiba thermal printers.
#
# TSPL2 Reference (key commands):
#   SIZE w mm, h mm          — label dimensions
#   GAP g mm, 0              — inter-label gap
#   CLS                      — clear image buffer
#   TEXT x,y,"font",rot,xm,ym,"data"  — scalable text
#   BARCODE x,y,"sym",h,readable,rot,narrow,wide,"data"
#   QRCODE x,y,ecc,cellw,mode,rot,model,mask,"data"
#   BOX x1,y1,x2,y2,thick   — rectangle outline
#   PRINT qty                — fire print
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Dict, List
import math
from loguru import logger
from omg.core.template_engine import TemplateDocument, CanvasElement, SheetLayout


class TsplRenderer:
    """Renders a single label or sheet of labels as raw TSPL2 commands."""

    def __init__(self, template: TemplateDocument, dpi: int = 203):
        self.template = template
        self.dpi = dpi
        # Dots per mm: 203 DPI = 8 dots/mm
        self.dpmm = 8 if dpi == 203 else (dpi / 25.4)

    def _mm2dots(self, mm: float) -> int:
        return int(round(mm * self.dpmm))

    def _pt2dots(self, pt: float) -> int:
        """Convert font points to dots."""
        return int(round(pt * (self.dpi / 72.0)))

    def render(self, row_data: Dict[str, str]) -> bytes:
        """Render a single label to TSPL2 bytes."""
        lines: List[str] = []

        # Label dimensions
        w_mm = self.template.label.width_mm
        h_mm = self.template.label.height_mm
        lines.append(f"SIZE {w_mm:.1f} mm, {h_mm:.1f} mm")

        # Gap between labels (default 3mm for die-cut, 0 for continuous)
        gap_mm = getattr(self.template.label, 'gap_mm', 3.0)
        lines.append(f"GAP {gap_mm:.1f} mm, 0 mm")

        # Print direction (1 = normal)
        lines.append("DIRECTION 1,0")

        # Clear the image buffer
        lines.append("CLS")

        # Draw all elements sorted by z-index
        sorted_elements = sorted(self.template.elements, key=lambda e: e.z_index)
        for elem in sorted_elements:
            val = row_data.get(elem.id, elem.value)
            try:
                self._dispatch_draw(lines, elem, val)
            except Exception as e:
                logger.error(f"TSPL render error on {elem.id}: {e}")

        # Print 1 copy
        lines.append("PRINT 1,1")

        tspl_str = "\r\n".join(lines) + "\r\n"
        return tspl_str.encode("utf-8")

    def render_sheet(self, label_values_list: list[Dict[str, str]],
                     layout: SheetLayout) -> bytes:
        """Render multiple labels — TSPL printers use continuous media,
        so we just concatenate individual label commands."""
        chunks = []
        for row_data in label_values_list:
            chunks.append(self.render(row_data))
        return b''.join(chunks)

    # ── Element dispatch ─────────────────────────────────────────────

    def _dispatch_draw(self, lines: List[str], elem: CanvasElement, value: str):
        if getattr(elem, 'hidden', False) or getattr(elem, 'do_not_print', False):
            return

        x = self._mm2dots(elem.x_mm)
        y = self._mm2dots(elem.y_mm)
        w = self._mm2dots(elem.width_mm)
        h = self._mm2dots(elem.height_mm)

        # Rotation: TSPL uses 0, 90, 180, 270
        rotation = int(getattr(elem, 'rotation', 0.0)) % 360
        # Snap to nearest 90°
        rot = round(rotation / 90) * 90
        if rot == 360:
            rot = 0

        if elem.type == "text":
            self._draw_text(lines, elem, value, x, y, w, h, rot)
        elif elem.type == "rect":
            self._draw_rect(lines, elem, x, y, w, h)
        elif elem.type == "line":
            self._draw_line(lines, elem, x, y, w, h)
        elif elem.type == "barcode":
            self._draw_barcode(lines, elem, value, x, y, w, h, rot)
        elif elem.type == "qrcode":
            self._draw_qrcode(lines, elem, value, x, y, w, h, rot)
        elif elem.type == "circle":
            self._draw_circle(lines, elem, x, y, w, h)

    # ── Text ─────────────────────────────────────────────────────────

    def _draw_text(self, lines: List[str], elem: CanvasElement, value: str,
                   x: int, y: int, w: int, h: int, rot: int):
        if not value:
            return

        text = str(value).replace('"', "'")  # Escape double quotes

        # Font size in dots
        font_h = self._pt2dots(float(elem.font_size))
        font_w = int(font_h * 0.55)  # Approximate width ratio

        # TSPL TEXT command uses built-in fonts or Windows TTF
        # For scalable text, use the BLOCK command or the built-in fonts
        # Built-in font "0" is 12x20, "1" is 8x12 dot matrix
        # For better quality, use the scalable font approach:

        # Determine font magnification based on desired size
        # Base font "3" is ~12pt equivalent, scale from there
        base_size = 16  # dots for base font
        x_mul = max(1, min(10, round(font_h / base_size)))
        y_mul = x_mul

        # Use TSPL TEXT command with built-in font "3" (OCR-B, scalable)
        # TEXT x,y,"font",rotation,x-mul,y-mul,"content"
        lines.append(f'TEXT {x},{y},"3",{rot},{x_mul},{y_mul},"{text}"')

    # ── Barcode ──────────────────────────────────────────────────────

    def _draw_barcode(self, lines: List[str], elem: CanvasElement, value: str,
                      x: int, y: int, w: int, h: int, rot: int):
        sym = elem.symbology or "code128"
        bc_data = str(value) if value else "12345"

        show_text = getattr(elem, 'show_text', True)
        readable = 1 if show_text else 0

        # Map OMG symbology names to TSPL symbology codes
        tspl_sym = self._map_barcode_symbology(sym)

        # Bar width (narrow/wide) — narrow=2, wide=4 is a good default for 203dpi
        narrow = 2
        wide = 5

        # Barcode height in dots
        bar_h = h
        if show_text:
            bar_h = max(h - self._pt2dots(12), self._mm2dots(5))

        # BARCODE x,y,"symbology",height,readable,rotation,narrow,wide,"content"
        lines.append(
            f'BARCODE {x},{y},"{tspl_sym}",{bar_h},{readable},{rot},{narrow},{wide},"{bc_data}"'
        )

    def _map_barcode_symbology(self, sym: str) -> str:
        """Map OMG symbology names to TSPL2 symbology codes."""
        mapping = {
            "code128": "128",
            "code128a": "128",
            "code128b": "128",
            "code128c": "128",
            "code39": "39",
            "ean13": "EAN13",
            "ean8": "EAN8",
            "upca": "UPCA",
            "upce": "UPCE",
            "itf": "ITF14",
            "itf14": "ITF14",
            "codabar": "CODA",
            "code93": "93",
            "msi": "MSI",
            "plessey": "PLESSEY",
            "code11": "CODE11",
        }
        return mapping.get(sym.lower(), "128")

    # ── QR Code ──────────────────────────────────────────────────────

    def _draw_qrcode(self, lines: List[str], elem: CanvasElement, value: str,
                     x: int, y: int, w: int, h: int, rot: int):
        qr_data = str(value) if value else "https://omg.com"

        # Cell width: controls the size of each QR module
        # Larger cell_width = larger QR code
        # Target: make QR fit within the element width
        # Typical cell widths: 2-10
        cell_width = max(2, min(10, w // 33))

        # QRCODE x,y,ECC level,cell width,mode,rotation,model,mask,"data"
        # ECC: L=Low, M=Medium, Q=Quality, H=High
        # Mode: A=Auto
        # Model: M2 (recommended)
        lines.append(
            f'QRCODE {x},{y},H,{cell_width},A,{rot},M2,S7,"{qr_data}"'
        )

    # ── Rectangle ────────────────────────────────────────────────────

    def _draw_rect(self, lines: List[str], elem: CanvasElement,
                   x: int, y: int, w: int, h: int):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 0.5)))

        fill_color = getattr(elem, 'fill_color', "#FFFFFF")
        is_filled = getattr(elem, 'filled', False) and fill_color.upper() in ["#000000", "BLACK"]

        # BOX x1,y1,x2,y2,line_thickness[,radius]
        x2 = x + w
        y2 = y + h

        if is_filled:
            # Use BLOCK or BAR for filled rectangle
            # BAR x,y,width,height
            lines.append(f"BAR {x},{y},{w},{h}")
        else:
            lines.append(f"BOX {x},{y},{x2},{y2},{thickness}")

    # ── Line ─────────────────────────────────────────────────────────

    def _draw_line(self, lines: List[str], elem: CanvasElement,
                   x: int, y: int, w: int, h: int):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 0.5)))

        # BAR command draws a filled rectangle — use for lines
        if h < w:
            # Horizontal line
            lines.append(f"BAR {x},{y},{w},{thickness}")
        else:
            # Vertical line
            lines.append(f"BAR {x},{y},{thickness},{h}")

    # ── Circle ───────────────────────────────────────────────────────

    def _draw_circle(self, lines: List[str], elem: CanvasElement,
                     x: int, y: int, w: int, h: int):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 0.5)))
        diameter = min(w, h)

        # TSPL2 CIRCLE command: CIRCLE x,y,diameter,thickness
        # Center the circle within the bounding box
        cx = x + (w - diameter) // 2
        cy = y + (h - diameter) // 2
        lines.append(f"CIRCLE {cx},{cy},{diameter},{thickness}")
