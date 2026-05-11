# FILE: omg/print/zpl_renderer.py
# ZPL Renderer — Native Label Printer Code Generator
# ═══════════════════════════════════════════════════════════════════
# Translates OMG CanvasElements into ZPL II string commands.
# ═══════════════════════════════════════════════════════════════════

from typing import Dict, List
import math
from loguru import logger
from omg.core.template_engine import TemplateDocument, CanvasElement, SheetLayout

class ZplRenderer:
    """Renders a single label or a sheet of labels as raw ZPL text."""

    def __init__(self, template: TemplateDocument, dpi: int = 203):
        self.template = template
        self.dpi = dpi
        # Dots per mm. For 203 DPI, this is exactly 8.
        self.dpmm = 8 if dpi == 203 else (dpi / 25.4)

    def _mm2dots(self, mm: float) -> int:
        return int(round(mm * self.dpmm))

    def _pt2dots(self, pt: float) -> int:
        # 1 pt = 1/72 inch
        # dots = pt * (dpi / 72)
        return int(round(pt * (self.dpi / 72.0)))

    def render(self, row_data: Dict[str, str]) -> bytes:
        """Render a single label to ZPL bytes (UTF-8)."""
        lines = []
        # Start Format
        lines.append("^XA")
        
        # Label Width / Length
        lw = self._mm2dots(self.template.label.width_mm)
        lh = self._mm2dots(self.template.label.height_mm)
        lines.append(f"^PW{lw}")
        lines.append(f"^LL{lh}")

        # UTF-8 Encoding
        lines.append("^CI28")

        # Draw elements (sort by z-index optionally, though ZPL draws sequentially)
        sorted_elements = sorted(self.template.elements, key=lambda e: e.z_index)
        for elem in sorted_elements:
            val = row_data.get(elem.id, elem.value)
            try:
                self._dispatch_draw(lines, elem, val)
            except Exception as e:
                logger.error(f"ZPL render error on {elem.id}: {e}")

        # End Format
        lines.append("^XZ")
        
        zpl_str = "\n".join(lines) + "\n"
        return zpl_str.encode("utf-8")

    def render_sheet(self, label_values_list: list[Dict[str, str]], layout: SheetLayout) -> bytes:
        """Renders multiple identical labels using standard ZPL features.
        Note: ZPL doesn't inherently support 'A4 sheets of labels', 
        typically it's continuous media. 
        For Hybrid mode, we just concatenate individual label formats."""
        zpl_chunks = []
        for row_data in label_values_list:
            zpl_chunks.append(self.render(row_data))
        return b''.join(zpl_chunks)

    def _dispatch_draw(self, lines: List[str], elem: CanvasElement, value: str):
        if getattr(elem, 'hidden', False) or getattr(elem, 'do_not_print', False):
            return

        x = self._mm2dots(elem.x_mm)
        y = self._mm2dots(elem.y_mm)
        w = self._mm2dots(elem.width_mm)
        h = self._mm2dots(elem.height_mm)
        rot = "N"

        # Rotation mapping
        # 0 = N (Normal), 90 = R (Rotated clock), 180 = I (Inverted), 270 = B (Bottom up)
        rotation = getattr(elem, 'rotation', 0.0) % 360
        if 45 <= rotation < 135: rot = "R"
        elif 135 <= rotation < 225: rot = "I"
        elif 225 <= rotation < 315: rot = "B"

        if elem.type == "text":
            self._draw_text(lines, elem, value, x, y, w, h, rot)
        elif elem.type == "rect":
            self._draw_rect(lines, elem, x, y, w, h)
        elif elem.type == "line":
            self._draw_line(lines, elem, x, y, w, h)
        elif elem.type == "barcode" or elem.type == "qrcode":
            self._draw_barcode(lines, elem, value, x, y, w, h, rot)
        elif elem.type == "circle":
            self._draw_circle(lines, elem, x, y, w, h)

    def _draw_text(self, lines, elem, value, x, y, w, h, rot):
        if not value:
            return
        
        # Escaping ZPL special chars
        zpl_val = str(value).replace("^", "_5E").replace("~", "_7E")
        
        # Font height in dots based on pt font size
        fh = self._pt2dots(float(elem.font_size))
        # Optional: fw can be set to 0 to auto-scale, or proportional
        fw = int(fh * 0.8)

        # Field Origin & Font & Data
        font_cmd = "^A0" # Standard scalable font
        lines.append(f"^FO{x},{y}^{font_cmd}{rot},{fh},{fw}^FD{zpl_val}^FS")

    def _draw_rect(self, lines, elem, x, y, w, h):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 1.0)))
        
        fill_color = getattr(elem, 'fill_color', "#FFFFFF")
        is_filled = getattr(elem, 'filled', False) and fill_color.upper() in ["#000000", "BLACK"]
        
        if is_filled:
            thickness = h

        # ^GBw,h,t,c,r
        lines.append(f"^FO{x},{y}^GB{w},{h},{thickness},B,0^FS")

    def _draw_line(self, lines, elem, x, y, w, h):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 1.0)))
        
        # A line in template is usually horizontal or vertical based on w/h
        if h < w:
            # Horizontal
            lines.append(f"^FO{x},{y}^GB{w},{thickness},{thickness},B,0^FS")
        else:
            # Vertical
            lines.append(f"^FO{x},{y}^GB{thickness},{h},{thickness},B,0^FS")

    def _draw_circle(self, lines, elem, x, y, w, h):
        thickness = max(1, self._mm2dots(getattr(elem, 'border_width', 1.0)))
        diameter = min(w, h)
        # ^GCd,t,c
        lines.append(f"^FO{x},{y}^GC{diameter},{thickness},B^FS")

    def _draw_barcode(self, lines, elem, value, x, y, w, h, rot):
        sym = elem.symbology or ("qrcode" if elem.type == 'qrcode' else "code128")
        bc_str = str(value).strip() if value and str(value).strip() else ""

        # If no barcode value provided, skip rendering entirely
        if not bc_str:
            return
        
        show_text = getattr(elem, 'show_text', True)
        
        if sym == "qrcode" or elem.type == 'qrcode':
            # ^BQN,model,magnification,errorCorrection,mask
            # Model 2 is standard. Mag 1-10.
            mag = max(2, min(10, int(w / 33))) 
            lines.append(f"^FO{x},{y}^BQN,2,{mag}^FDQA,{bc_str}^FS")
        elif sym in ["ean13"]:
            bar_h = h - self._pt2dots(10) if show_text else h
            text_flag = "Y" if show_text else "N"
            lines.append(f"^FO{x},{y}^BE{rot},{bar_h},{text_flag},N^FD{bc_str}^FS")
        else: # Default Code 128
            bar_h = h - self._pt2dots(10) if show_text else h
            text_flag = "Y" if show_text else "N"
            lines.append(f"^FO{x},{y}^BC{rot},{bar_h},{text_flag},N,N^FD{bc_str}^FS")
