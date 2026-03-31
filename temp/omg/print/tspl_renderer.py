# FILE: omg/print/tspl_renderer.py
# TSPL2 Renderer — Native Toshiba/TSC Label Printer Code Generator
# ═══════════════════════════════════════════════════════════════════
# Translates OMG CanvasElements into TSPL2 commands for Toshiba B-FV4,
# B-EV4, B-SA400, TSC TTP/TE series, and compatible thermal printers.
#
# Generates production-quality TSPL2 matching real .prn output from
# BarTender, NiceLabel, and TSC native software.
#
# TSPL2 Reference (key commands):
#   SIZE w mm, h mm          — label dimensions
#   GAP g mm, 0 mm           — inter-label gap (die-cut)
#   SPEED n                  — print speed 1-6 ips
#   DENSITY n                — darkness 0-15
#   DIRECTION d,0            — 0=normal, 1=mirrored
#   REFERENCE x,y            — origin offset
#   OFFSET n mm              — vertical offset
#   SET RIBBON ON|OFF        — thermal transfer vs direct thermal
#   SET PEEL OFF|ON          — peel-off mode
#   SET CUTTER OFF|ON        — cutter mode
#   SET TEAR ON|OFF          — tear-off mode
#   CLS                      — clear image buffer
#   CODEPAGE n               — character encoding (1252=Windows Latin-1)
#   TEXT x,y,"font",rot,xm,ym,"data"
#   BARCODE x,y,"sym",h,readable,rot,narrow,wide,"data"
#   QRCODE x,y,ecc,cellw,mode,rot,model,mask,"data"
#   BOX x1,y1,x2,y2,thick   — rectangle outline
#   BAR x,y,w,h              — filled bar/line
#   CIRCLE x,y,diameter,thick
#   PRINT qty,copies          — fire print
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Dict, List, Optional
import math
from loguru import logger
from omg.core.template_engine import TemplateDocument, CanvasElement, SheetLayout


class TsplRenderer:
    """Renders a single label or sheet of labels as raw TSPL2 commands.

    Generates production-quality output compatible with all TSC/Toshiba
    thermal printers. Includes full printer configuration preamble
    (SPEED, DENSITY, RIBBON, media handling) matching real .prn files.
    """

    def __init__(self, template: TemplateDocument, dpi: int = 203,
                 speed: int = 4, density: int = 8,
                 ribbon: bool = True, codepage: int = 1252,
                 direction: int = 0):
        self.template = template
        self.dpi = dpi
        # Dots per mm: 203 DPI = 8 dots/mm, 300 DPI = 11.81 dots/mm
        self.dpmm = 8 if dpi == 203 else (dpi / 25.4)
        self.speed = max(1, min(6, speed))
        self.density = max(0, min(15, density))
        self.ribbon = ribbon
        self.codepage = codepage
        self.direction = direction

    def _mm2dots(self, mm: float) -> int:
        return int(round(mm * self.dpmm))

    def _pt2dots(self, pt: float) -> int:
        """Convert font points to dots."""
        return int(round(pt * (self.dpi / 72.0)))

    def render(self, row_data: Dict[str, str]) -> bytes:
        """Render a single label to TSPL2 bytes.

        Generates a complete, self-contained TSPL2 job that any
        TSC/Toshiba printer can execute directly.
        """
        lines: List[str] = []

        # ── Printer configuration preamble ────────────────────────
        w_mm = self.template.label.width_mm
        h_mm = self.template.label.height_mm
        lines.append(f"SIZE {w_mm:.1f} mm, {h_mm:.1f} mm")

        gap_mm = getattr(self.template.label, 'gap_mm', 3.0)
        lines.append(f"GAP {gap_mm:.1f} mm, 0 mm")

        lines.append(f"SPEED {self.speed}")
        lines.append(f"DENSITY {self.density}")
        lines.append(f"SET RIBBON {'ON' if self.ribbon else 'OFF'}")
        lines.append(f"DIRECTION {self.direction},0")
        lines.append("REFERENCE 0,0")
        lines.append("OFFSET 0 mm")
        lines.append("SET PEEL OFF")
        lines.append("SET CUTTER OFF")
        lines.append("SET PARTIAL_CUTTER OFF")
        lines.append("SET TEAR ON")

        # ── Clear buffer and set encoding ─────────────────────────
        lines.append("CLS")
        lines.append(f"CODEPAGE {self.codepage}")

        # ── Draw all elements sorted by z-index ───────────────────
        sorted_elements = sorted(self.template.elements, key=lambda e: e.z_index)
        for elem in sorted_elements:
            val = row_data.get(elem.id, elem.value)
            try:
                self._dispatch_draw(lines, elem, val)
            except Exception as e:
                logger.error(f"TSPL render error on {elem.id}: {e}")

        # ── Fire print ────────────────────────────────────────────
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

        # TSPL built-in scalable fonts (matching real .prn files):
        #   "1" = 8x12 dot matrix    "2" = 12x20 dot matrix
        #   "3" = 16x24 dot matrix   "4" = 24x32 dot matrix
        #   "5" = 32x48 dot matrix
        # Select font based on desired point size:
        font_h = self._pt2dots(float(elem.font_size))

        if font_h >= 40:
            font = "5"
            base = 48
        elif font_h >= 28:
            font = "4"
            base = 32
        elif font_h >= 20:
            font = "3"
            base = 24
        elif font_h >= 14:
            font = "2"
            base = 20
        else:
            font = "1"
            base = 12

        # Magnification multipliers (1-10)
        x_mul = max(1, min(10, round(font_h / base)))
        y_mul = x_mul

        # TEXT x,y,"font",rotation,x-mul,y-mul,"content"
        lines.append(f'TEXT {x},{y},"{font}",{rot},{x_mul},{y_mul},"{text}"')

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
        """Map OMG symbology names to TSPL2 symbology codes.

        Uses '128M' (auto-switching) for Code 128 — this is what real
        label software (BarTender, NiceLabel) uses for optimal encoding.
        """
        mapping = {
            "code128": "128M",
            "code128a": "128A",
            "code128b": "128B",
            "code128c": "128C",
            "code128m": "128M",
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
            "postnet": "POST",
            "eanucc128": "UCCI",
        }
        return mapping.get(sym.lower(), "128M")

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
