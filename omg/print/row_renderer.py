# FILE: omg/print/row_renderer.py
# Row Renderer — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Renders a single label page or a tiled sheet of labels as a PDF.
# Uses unified drawing methods to ensure consistency between modes.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import io
import math
import base64
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.lib.colors import HexColor, Color
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Frame, KeepInFrame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.graphics import renderPDF, renderSVG
from reportlab.pdfgen import canvas as rl_canvas
from loguru import logger
import re
from xml.sax.saxutils import escape

from omg.core.template_engine import TemplateDocument, CanvasElement, SheetLayout
from omg.core.barcode_engine import BarcodeRenderer

# ── TrueType Font Registration ──────────────────────────────────────
# Register system TrueType fonts so ReportLab renders the actual font
# the user selected (e.g. Arial) instead of falling back to Helvetica.
# This is critical for print quality — TrueType fonts have proper
# hinting and the correct stroke weights.

import os
import platform

def _get_system_font_dirs():
    """Return a list of directories that contain system fonts."""
    dirs = []
    system = platform.system()
    if system == "Windows":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        dirs.append(os.path.join(windir, "Fonts"))
        # User fonts (Windows 10+)
        localappdata = os.environ.get("LOCALAPPDATA", "")
        if localappdata:
            dirs.append(os.path.join(localappdata, "Microsoft", "Windows", "Fonts"))
    elif system == "Darwin":
        dirs.extend(["/System/Library/Fonts", "/Library/Fonts",
                      os.path.expanduser("~/Library/Fonts")])
    else:
        dirs.extend(["/usr/share/fonts", "/usr/local/share/fonts",
                      os.path.expanduser("~/.fonts"),
                      os.path.expanduser("~/.local/share/fonts")])
    return [d for d in dirs if os.path.isdir(d)]


def _find_ttf(name, font_dirs):
    """Find a .ttf file matching the given name in system font dirs."""
    # Common filename patterns for a given font name
    # e.g. "Arial" -> ["arial.ttf", "Arial.ttf", "ARIAL.TTF"]
    clean = name.replace(" ", "")
    candidates = [
        f"{name}.ttf", f"{name.lower()}.ttf", f"{clean}.ttf", f"{clean.lower()}.ttf",
        f"{name}.TTF", f"{clean}.TTF",
    ]
    for d in font_dirs:
        for candidate in candidates:
            path = os.path.join(d, candidate)
            if os.path.isfile(path):
                return path
        # Also search subdirectories one level deep
        try:
            for sub in os.listdir(d):
                subdir = os.path.join(d, sub)
                if os.path.isdir(subdir):
                    for candidate in candidates:
                        path = os.path.join(subdir, candidate)
                        if os.path.isfile(path):
                            return path
        except OSError:
            pass
    return None


def _register_system_fonts():
    """Register common TrueType fonts from the OS for use in ReportLab."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font_dirs = _get_system_font_dirs()
    if not font_dirs:
        logger.debug("No system font directories found")
        return

    # Map: ReportLab font name -> (regular_filename, bold, italic, bolditalic)
    # We try common filename patterns for each font family.
    FONT_MAP = {
        "Arial":      ("arial", "arialbd", "ariali", "arialbi"),
        "Inter":      ("Inter-Regular", "Inter-Bold", "Inter-Italic", "Inter-BoldItalic"),
        "Lato":       ("Lato-Regular", "Lato-Bold", "Lato-Italic", "Lato-BoldItalic"),
        "Montserrat": ("Montserrat-Regular", "Montserrat-Bold", "Montserrat-Italic", "Montserrat-BoldItalic"),
        "Nunito":     ("Nunito-Regular", "Nunito-Bold", "Nunito-Italic", "Nunito-BoldItalic"),
        "Open Sans":  ("OpenSans-Regular", "OpenSans-Bold", "OpenSans-Italic", "OpenSans-BoldItalic"),
        "Oswald":     ("Oswald-Regular", "Oswald-Bold", "Oswald-Italic", "Oswald-BoldItalic"),
        "Poppins":    ("Poppins-Regular", "Poppins-Bold", "Poppins-Italic", "Poppins-BoldItalic"),
        "Raleway":    ("Raleway-Regular", "Raleway-Bold", "Raleway-Italic", "Raleway-BoldItalic"),
        "Roboto":     ("Roboto-Regular", "Roboto-Bold", "Roboto-Italic", "Roboto-BoldItalic"),
    }

    registered = 0
    for family, (reg, bold, italic, bi) in FONT_MAP.items():
        reg_path = _find_ttf(reg, font_dirs)
        if not reg_path:
            continue
        try:
            pdfmetrics.registerFont(TTFont(family, reg_path))
            registered += 1

            # Bold
            bold_path = _find_ttf(bold, font_dirs)
            if bold_path:
                pdfmetrics.registerFont(TTFont(f"{family}-Bold", bold_path))

            # Italic
            italic_path = _find_ttf(italic, font_dirs)
            if italic_path:
                pdfmetrics.registerFont(TTFont(f"{family}-Oblique", italic_path))

            # Bold Italic
            bi_path = _find_ttf(bi, font_dirs)
            if bi_path:
                pdfmetrics.registerFont(TTFont(f"{family}-BoldOblique", bi_path))

            # Register the font family mapping for ReportLab
            from reportlab.pdfbase.pdfmetrics import registerFontFamily
            registerFontFamily(family,
                               normal=family,
                               bold=f"{family}-Bold" if bold_path else family,
                               italic=f"{family}-Oblique" if italic_path else family,
                               boldItalic=f"{family}-BoldOblique" if bi_path else family)

            logger.debug(f"Registered TTF font: {family} ({reg_path})")
        except Exception as e:
            logger.debug(f"Could not register font {family}: {e}")

    logger.info(f"Registered {registered} TrueType font families from system")

# Run font registration at module load time
try:
    _register_system_fonts()
except Exception as e:
    logger.warning(f"Font registration failed (non-fatal): {e}")


# ── Helpers ──────────────────────────────────────────────────────────

def mm_to_pt(mm_val): return mm_val * 2.83464567
def pt_to_mm(pt_val): return pt_val / 2.83464567

def _hex_to_color(hex_str: str) -> Color:
    """Robust conversion of #RRGGBB, #RRGGBBAA, rgba(), or color names."""
    if not hex_str: return colors.black
    h = hex_str.strip().lower()
    if h == "transparent" or h == "none": return colors.Color(0,0,0, alpha=0)

    # Handle rgba(r, g, b, a)
    rgba_match = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)", h)
    if rgba_match:
        try:
            r = int(rgba_match.group(1)) / 255.0
            g = int(rgba_match.group(2)) / 255.0
            b = int(rgba_match.group(3)) / 255.0
            a = float(rgba_match.group(4)) if rgba_match.group(4) else 1.0
            return colors.Color(r, g, b, alpha=a)
        except: pass

    # Handle named colors
    named = {
        "red": colors.red, "blue": colors.blue, "green": colors.green,
        "yellow": colors.yellow, "black": colors.black, "white": colors.white,
        "grey": colors.grey, "gray": colors.gray, "orange": colors.orange,
        "purple": colors.purple, "pink": colors.pink, "brown": colors.brown
    }
    if h in named: return named[h]

    if not h.startswith("#"):
        try: return HexColor(h)
        except: return colors.black

    try:
        if len(h) == 7: return HexColor(h)
        elif len(h) == 9: # #RRGGBBAA
            r = int(h[1:3], 16) / 255.0
            g = int(h[3:5], 16) / 255.0
            b = int(h[5:7], 16) / 255.0
            a = int(h[7:9], 16) / 255.0
            return colors.Color(r, g, b, alpha=a)
        else: return HexColor(h)
    except: return colors.black

def mm_to_pt(val_mm: float) -> float:
    return val_mm * 72.0 / 25.4

def pt_to_mm(val_pt: float) -> float:
    return val_pt * 25.4 / 72.0

def _add_round_rect_to_path(path, x, y, w, h, r):
    """Draw a rounded rectangle on a ReportLab PathObject using cubic beziers.

    ReportLab's PathObject does NOT have roundRect(), so we build it
    manually with moveTo/lineTo/curveTo.
    The constant 0.5523 (= 4*(sqrt(2)-1)/3) approximates quarter-circle arcs.
    """
    r = min(r, w / 2, h / 2)
    if r <= 0:
        path.rect(x, y, w, h)
        return
    k = 0.5523 * r  # bezier control-point offset
    # Start at bottom-left, just above the corner
    path.moveTo(x, y + r)
    # Bottom-left corner
    path.curveTo(x, y + r - k, x + r - k, y, x + r, y)
    # Bottom edge
    path.lineTo(x + w - r, y)
    # Bottom-right corner
    path.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r)
    # Right edge
    path.lineTo(x + w, y + h - r)
    # Top-right corner
    path.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
    # Top edge
    path.lineTo(x + r, y + h)
    # Top-left corner
    path.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r)
    path.close()


def build_label_clip_path(c: rl_canvas.Canvas, w_pt: float, h_pt: float,
                          shape: str, corner_radius_mm: float = 3.0):
    """GAP-03: Create a ReportLab clip path for the label shape."""
    path = c.beginPath()
    if shape == "ellipse":
        path.ellipse(0, 0, w_pt, h_pt)
    elif shape == "round_rect":
        r = mm_to_pt(corner_radius_mm)
        _add_round_rect_to_path(path, 0, 0, w_pt, h_pt, r)
    else:  # rect
        path.rect(0, 0, w_pt, h_pt)
    return path

# ── Row Renderer ─────────────────────────────────────────────────────

class RowRenderer:
    """Unified renderer for labels and sheets."""

    def __init__(self, template: TemplateDocument):
        self.template = template
        self.label_width_pt = mm_to_pt(template.label.width_mm)
        self.label_height_pt = mm_to_pt(template.label.height_mm)

    def render(self, row_data: Dict[str, str]) -> bytes:
        """Render a single label to PDF bytes."""
        buffer = io.BytesIO()
        c = rl_canvas.Canvas(buffer, pagesize=(self.label_width_pt, self.label_height_pt))

        label_shape = self.template.label.shape
        corner_r = self.template.label.corner_radius_mm

        # Clip to label shape (rounded rect / ellipse)
        if label_shape != "rect":
            clip = build_label_clip_path(c, self.label_width_pt, self.label_height_pt,
                                         label_shape, corner_r)
            c.clipPath(clip, stroke=0, fill=0)

        # Background
        bg = self.template.label.background_color
        if bg and bg.lower() != "#ffffff":
            c.setFillColor(_hex_to_color(bg))
            c.rect(0, 0, self.label_width_pt, self.label_height_pt, fill=1, stroke=0)

        # Draw elements
        sorted_elements = sorted(self.template.elements, key=lambda e: e.z_index)
        for elem in sorted_elements:
            val = row_data.get(elem.id, elem.value)
            try:
                self._dispatch_draw(c, elem, val)
            except Exception as e:
                logger.error(f"Render error {elem.id}: {e}")
                self._draw_error_placeholder(c, elem, str(e))

        # Draw label border outline (after elements, so it's on top)
        if self.template.label.show_border and label_shape != "rect":
            c.saveState()
            c.setStrokeColor(HexColor("#CCCCCC"))
            c.setLineWidth(0.5)
            border_path = build_label_clip_path(c, self.label_width_pt, self.label_height_pt,
                                                label_shape, corner_r)
            c.drawPath(border_path, fill=0, stroke=1)
            c.restoreState()

        c.showPage()
        c.save()
        return buffer.getvalue()

    def render_sheet(self, label_values_list: list[Dict[str, str]],
                     layout: SheetLayout) -> bytes:
        """GAP-01: Render tiled labels on a sheet."""
        sheet_w_pt = mm_to_pt(layout.page_width_mm)
        sheet_h_pt = mm_to_pt(layout.page_height_mm)

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=(sheet_w_pt, sheet_h_pt))

        # Sheet background
        c.setFillColor(HexColor("#FFFFFF"))
        c.rect(0, 0, sheet_w_pt, sheet_h_pt, fill=1, stroke=0)

        label_w_pt = self.label_width_pt
        label_h_pt = self.label_height_pt
        label_w_mm = self.template.label.width_mm
        label_h_mm = self.template.label.height_mm
        label_shape = self.template.label.shape
        corner_r = self.template.label.corner_radius_mm

        sorted_elements = sorted(self.template.elements, key=lambda e: e.z_index)

        for idx, values in enumerate(label_values_list):
            x_mm, y_mm = layout.label_origin(idx, label_w_mm, label_h_mm)
            x_pt = mm_to_pt(x_mm)
            y_pt = sheet_h_pt - mm_to_pt(y_mm) - label_h_pt

            c.saveState()
            c.translate(x_pt, y_pt)

            # Clip
            clip = build_label_clip_path(c, label_w_pt, label_h_pt, label_shape, corner_r)
            c.clipPath(clip, stroke=0, fill=0)

            # Label Background
            bg = self.template.label.background_color
            if bg and bg.lower() != "#ffffff":
                c.setFillColor(_hex_to_color(bg))
                c.rect(0, 0, label_w_pt, label_h_pt, fill=1, stroke=0)

            # Elements
            for elem in sorted_elements:
                val = values.get(elem.id, elem.value)
                try:
                    self._dispatch_draw(c, elem, val)
                except Exception as e:
                    logger.error(f"Sheet element error {elem.id}: {e}")

            c.restoreState()

            # Optional border
            if self.template.label.show_border:
                c.saveState()
                c.setStrokeColor(HexColor("#CCCCCC"))
                c.setLineWidth(0.5)
                c.translate(x_pt, y_pt)
                path = build_label_clip_path(c, label_w_pt, label_h_pt, label_shape, corner_r)
                c.drawPath(path, fill=0, stroke=1)
                c.restoreState()

        c.showPage()
        c.save()
        return buf.getvalue()

    def _dispatch_draw(self, c, elem, value):
        """Unified dispatcher for drawing elements."""
        if getattr(elem, 'hidden', False) or getattr(elem, 'do_not_print', False):
            return

        c.saveState()
        try:
            # 1. Opacity
            opacity = getattr(elem, 'opacity', 100.0)
            if opacity < 100.0:
                alpha = max(0.0, opacity) / 100.0
                # Note: setFillAlpha and setStrokeAlpha are natively supported in canvas state
                c.setFillAlpha(alpha)
                c.setStrokeAlpha(alpha)

            # 2. Global Rotation — Konva rotates around TOP-LEFT corner of the element
            # In PDF coords (origin=bottom-left, Y-up), the top-left of the element
            # is at (x_pt, y_pt + h_pt). Konva rotation is clockwise; ReportLab is
            # counter-clockwise, so we negate the angle.
            rot = getattr(elem, 'rotation', 0.0)
            if rot != 0.0:
                x_pt, y_pt = self._to_pdf_coords(elem)
                w_pt, h_pt = mm_to_pt(elem.width_mm), mm_to_pt(elem.height_mm)
                # Pivot = element's top-left in PDF coordinates
                px, py = x_pt, y_pt + h_pt
                c.translate(px, py)
                c.rotate(-rot)  # negate: Konva CW → ReportLab CCW
                c.translate(-px, -py)

            if elem.type == "text":
                self._draw_text(c, elem, value)
            elif elem.type in ("barcode", "qrcode"):
                self._draw_barcode(c, elem, value)
            elif elem.type == "image":
                self._draw_image(c, elem, value)
            elif elem.type == "rect":
                self._draw_rect(c, elem)
            elif elem.type == "line":
                self._draw_line(c, elem)
            elif elem.type == "circle":
                self._draw_circle(c, elem)
        
        except Exception as dispatch_err:
            logger.error(f"Dispatch logic failure on {elem.id}: {dispatch_err}")
        finally:
            c.restoreState()

    def _to_pdf_coords(self, elem: CanvasElement) -> tuple[float, float]:
        """Convert element mm coords to local PDF coords."""
        x_pt = mm_to_pt(elem.x_mm)
        y_pt = self.label_height_pt - mm_to_pt(elem.y_mm) - mm_to_pt(elem.height_mm)
        return x_pt, y_pt

    def _draw_text(self, c, elem, value):
        x_pt, y_pt = self._to_pdf_coords(elem)
        w_pt = mm_to_pt(elem.width_mm)
        h_pt = mm_to_pt(elem.height_mm)

        if not value:
            return

        text_val = str(value)
        inverse = getattr(elem, 'inverse', False)
        bg_color = getattr(elem, 'background_color', 'transparent')
        elem_color = getattr(elem, 'color', '#000000')

        if inverse:
            text_fill_hex = bg_color if bg_color.lower() not in ("transparent", "none", "") else "#FFFFFF"
            bg_fill_hex = elem_color
        else:
            text_fill_hex = elem_color
            bg_fill_hex = bg_color if bg_color.lower() not in ("transparent", "none", "") else None

        mirror = getattr(elem, 'mirror', False)
        
        c.saveState()
        if bg_fill_hex:
            c.setFillColor(_hex_to_color(bg_fill_hex))
            c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
            
        if getattr(elem, 'border_enabled', False):
            c.setStrokeColor(_hex_to_color(getattr(elem, 'border_color', '#000000')))
            c.setLineWidth(getattr(elem, 'border_width', 1.0))
            c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
        c.restoreState()

        # elem.font_size is stored as typographic points (pt).
        # ReportLab uses points natively, so no conversion needed.
        # This matches every other label software: "12" = 12pt = 4.23mm.
        start_fs = float(elem.font_size)
        
        base_font = elem.font_name or "Helvetica"
        # Check multiple field names — frontend sends font_bold, bold, and/or font_weight
        is_bold = getattr(elem, 'font_bold', False) or getattr(elem, 'bold', False)
        if not is_bold:
            fw = getattr(elem, 'font_weight', 'normal')
            try:
                is_bold = int(fw) >= 600
            except (ValueError, TypeError):
                is_bold = str(fw).lower() == 'bold'
        is_italic = getattr(elem, 'font_italic', False) or getattr(elem, 'italic', False)
        suffix = ""
        if is_bold and is_italic: suffix = "-BoldOblique"
        elif is_bold: suffix = "-Bold"
        elif is_italic: suffix = "-Oblique"
        font_name = base_font + suffix
        
        from reportlab.pdfbase import pdfmetrics
        if font_name not in pdfmetrics.standardFonts and font_name not in pdfmetrics.getRegisteredFontNames():
            font_name = "Helvetica"
            if is_bold and is_italic: font_name += "-BoldOblique"
            elif is_bold: font_name += "-Bold"
            elif is_italic: font_name += "-Oblique"

        align_map = {'left': TA_LEFT, 'center': TA_CENTER, 'right': TA_RIGHT, 'justify': TA_JUSTIFY}
        align_code = align_map.get(getattr(elem, 'align', 'left'), TA_LEFT)
        if getattr(elem, 'justify', False):
            align_code = TA_JUSTIFY

        style = ParagraphStyle(
            'ExactStyle',
            fontName=font_name,
            fontSize=start_fs,
            textColor=_hex_to_color(text_fill_hex),
            alignment=align_code,
            # Konva's Text component uses a default line-height of ~1.2×fontSize.
            # Match that here so multi-line text and vertical centering are
            # consistent between the canvas preview and the printed output.
            leading=start_fs * 1.2,
        )

        p_text = escape(text_val).replace("\n", "<br/>")
        if getattr(elem, 'underline', False): p_text = f'<u>{p_text}</u>'
        if getattr(elem, 'strikeout', False): p_text = f'<strike>{p_text}</strike>'

        p = Paragraph(p_text, style)
        p_w, p_h = p.wrap(w_pt, h_pt)

        va = getattr(elem, 'vertical_align', 'middle')
        top_offset = 0
        if va == "middle":
            avail_extra = h_pt - p_h
            if avail_extra > 0: top_offset = avail_extra / 2
        elif va == "bottom":
             avail_extra = h_pt - p_h
             if avail_extra > 0: top_offset = avail_extra

        draw_y = y_pt + h_pt - top_offset - p_h

        c.saveState()
        if mirror:
            c.translate(x_pt + w_pt/2.0, y_pt + h_pt/2.0)
            c.scale(-1.0, 1.0)
            c.translate(-x_pt - w_pt/2.0, -y_pt - h_pt/2.0)
            
        p.drawOn(c, x_pt, draw_y)
        c.restoreState()

    def _draw_barcode(self, c, elem, value):
        x_pt, y_pt = self._to_pdf_coords(elem)
        w_pt = mm_to_pt(elem.width_mm)
        h_pt = mm_to_pt(elem.height_mm)

        try:
            sym = elem.symbology or ("qrcode" if elem.type == 'qrcode' else "code128")
            show_text = getattr(elem, 'show_text', True) and elem.type == 'barcode'
            text_on_top = getattr(elem, 'text_on_top', False)

            # ── Text font size — must match frontend ElementShape.tsx ──
            # Frontend: textFontSize = Math.max(6, (elem.text_font_size_mm || 2.5) * MM_TO_PX * zoom)
            # The canvas clamp is 6 CSS px = 6 * (72/96) = 4.5 pt
            # mm → pt = mm * 72 / 25.4 (same physical size as mm * 96/25.4 CSS px)
            text_fs_mm = getattr(elem, 'text_font_size_mm', 2.5)
            text_font_size_pt = max(4.5, mm_to_pt(text_fs_mm))

            # ── Bar / text height split — must match frontend ──
            # Frontend: barH = showHumanText ? Math.max(h * 0.1, h - textFontSize - 2 * zoom) : h
            # At zoom=1, "2 * zoom" = 2 CSS px = 2 * (72/96) = 1.5 pt
            # Use user-configurable barcode_text_margin_mm if set
            text_margin_mm = getattr(elem, 'barcode_text_margin_mm', 0)
            if text_margin_mm and text_margin_mm != 0:
                text_margin_pt = mm_to_pt(abs(text_margin_mm))
            else:
                text_margin_pt = 1.5  # default: matches 2px at 72/96 ratio

            if show_text:
                bar_h_pt = max(h_pt * 0.1, h_pt - text_font_size_pt - text_margin_pt)
                text_h_pt = h_pt - bar_h_pt
            else:
                bar_h_pt = h_pt
                text_h_pt = 0

            barcode_str = str(value).strip() if value and str(value).strip() else ""

            # If no barcode value provided, skip rendering entirely
            if not barcode_str:
                return

            drawing = None
            try:
                drawing = BarcodeRenderer.render_reportlab_drawing(
                    sym, barcode_str, elem.width_mm, pt_to_mm(bar_h_pt), show_text=False
                )
            except Exception as bc_err:
                logger.warning(f"Barcode generation failed for '{barcode_str}': {bc_err}")

            if drawing:
                dw = drawing.width if drawing.width > 0 else 1
                dh = drawing.height if drawing.height > 0 else 1
                sx = w_pt / dw
                sy = bar_h_pt / dh

                if sym == "qrcode" or elem.type == 'qrcode':
                    sx = sy = min(sx, sy)

                c.saveState()
                # Frontend: <Group y={showHumanText && elem.text_on_top ? textH : 0}>
                bars_baseline_y = y_pt + (text_h_pt if not text_on_top and show_text else 0)
                tx = x_pt + (w_pt - dw * sx) / 2
                c.translate(tx, bars_baseline_y)
                c.scale(sx, sy)
                renderPDF.draw(drawing, c, 0, 0)
                c.restoreState()
            else:
                # If barcode generation failed, draw an empty dashed box instead of "Render Error"
                c.saveState()
                c.setStrokeColor(colors.grey)
                c.setDash(2, 2)
                c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
                c.restoreState()

            if show_text:
                c.saveState()
                # ── Font setup — must match frontend ElementShape ──
                base_font = getattr(elem, 'text_font_name', "Helvetica") or "Helvetica"

                # Validate base font exists in ReportLab; fallback to Helvetica
                from reportlab.pdfbase import pdfmetrics
                if base_font not in pdfmetrics.standardFonts and base_font not in pdfmetrics.getRegisteredFontNames():
                    base_font = "Helvetica"

                is_bold = getattr(elem, 'text_font_bold', False)
                is_italic = getattr(elem, 'text_font_italic', False)
                suffix = ""
                if is_bold and is_italic: suffix = "-BoldOblique"
                elif is_bold: suffix = "-Bold"
                elif is_italic: suffix = "-Oblique"
                font_name = base_font + suffix

                # Validate full font name (with suffix), fallback to Helvetica family
                if font_name not in pdfmetrics.standardFonts and font_name not in pdfmetrics.getRegisteredFontNames():
                    font_name = "Helvetica"
                    if is_bold and is_italic: font_name += "-BoldOblique"
                    elif is_bold: font_name += "-Bold"
                    elif is_italic: font_name += "-Oblique"

                c.setFont(font_name, text_font_size_pt)
                color_hex = getattr(elem, 'color', "#000000")
                c.setFillColor(_hex_to_color(color_hex))

                # ── Text Y position — match frontend verticalAlign="middle" ──
                # Frontend: <Group y={elem.text_on_top ? 0 : barH}>
                # The text block sits either above or below the barcode area
                if text_on_top:
                    text_block_y = y_pt + bar_h_pt  # PDF y increases upward
                else:
                    text_block_y = y_pt

                # Center text vertically within text_h_pt
                # Use ascent for accurate baseline positioning (ReportLab draws from baseline)
                face = pdfmetrics.getFont(font_name).face
                ascent_ratio = face.ascent / (face.ascent - face.descent) if (face.ascent - face.descent) != 0 else 0.8
                text_ascent = text_font_size_pt * ascent_ratio
                ty = text_block_y + (text_h_pt - text_font_size_pt) / 2.0

                anchor = getattr(elem, 'text_anchor', 'center')
                if anchor == 'left': 
                    c.drawString(x_pt, ty, barcode_str)
                elif anchor == 'right': 
                    c.drawRightString(x_pt + w_pt, ty, barcode_str)
                else: 
                    c.drawCentredString(x_pt + w_pt / 2, ty, barcode_str)
                c.restoreState()

        except Exception as e:
            logger.error(f"Barcode draw error: {e}")
            self._draw_error_placeholder(c, elem, f"Barcode Error")


    def _draw_image(self, c, elem, value):
        try:
            x_pt, y_pt = self._to_pdf_coords(elem)
            w_pt = mm_to_pt(elem.width_mm)
            h_pt = mm_to_pt(elem.height_mm)
            if w_pt <= 0 or h_pt <= 0: return
            
            aspect = getattr(elem, 'maintain_aspect_ratio', True)
            if getattr(elem, 'image_fit_mode', 'fit') == 'stretch':
                aspect = False
            
            def _preprocess_image(img_path_or_bytes):
                from reportlab.lib.utils import ImageReader
                if getattr(elem, 'monochrome', False):
                    try:
                        from PIL import Image
                        img_pil = Image.open(img_path_or_bytes)
                        # Convert to pure black and white
                        img_pil = img_pil.convert('L').point(lambda x: 0 if x < 128 else 255, '1')
                        return ImageReader(img_pil)
                    except:
                        return ImageReader(img_path_or_bytes)
                return ImageReader(img_path_or_bytes)

            actual_val = str(value) if value is not None else ""
            b64_source = actual_val if actual_val.startswith('data:image') else getattr(elem, 'image_b64', None)

            if getattr(elem, 'image_path', None) and Path(elem.image_path).exists():
                img = _preprocess_image(elem.image_path)
                c.drawImage(img, x_pt, y_pt, w_pt, h_pt, preserveAspectRatio=aspect, anchor="c")
            elif b64_source:
                import base64
                try:
                    # Safely strip standard browser base64 headers if present
                    if "," in b64_source:
                        b64_source = b64_source.split(",", 1)[1]
                    img_data = base64.b64decode(b64_source)
                    img = _preprocess_image(io.BytesIO(img_data))
                    c.drawImage(img, x_pt, y_pt, w_pt, h_pt, preserveAspectRatio=aspect, anchor="c")
                except Exception as b64e:
                    logger.error(f"Image B64 decode failed: {b64e}")
                    self._draw_error_placeholder(c, elem, "Img Decode Error")
        except Exception as e:
            logger.error(f"Image draw error: {e}")
            self._draw_error_placeholder(c, elem, "Img Render Error")

    def _apply_shape_styling(self, c, elem):
        """Helper to apply line styles and caps from element properties."""
        bw = max(0.0, getattr(elem, 'border_width', 0.1))
        c.setLineWidth(bw)
        
        style = getattr(elem, 'line_style', 'solid')
        if style == 'dashed':
            c.setDash(bw * 4, bw * 3)
        elif style == 'dotted':
            c.setDash(bw, bw * 2)
            c.setLineCap(1) # Round cap forces dots if width is > 0
        elif style == 'dash-dot':
            c.setDash([bw * 4, bw * 2, bw, bw * 2])
            
        cap = getattr(elem, 'line_cap', 'square')
        if cap == 'round':
            c.setLineCap(1)
        elif cap == 'flat':
            c.setLineCap(0)
        else: # square/projecting
            if style != 'dotted':
                c.setLineCap(2)

    def _draw_rect(self, c, elem):
        try:
            x_pt, y_pt = self._to_pdf_coords(elem)
            w_pt = mm_to_pt(elem.width_mm)
            h_pt = mm_to_pt(elem.height_mm)
            if w_pt <= 0 or h_pt <= 0: return

            c.saveState()
            c.setStrokeColor(_hex_to_color(getattr(elem, 'border_color', "#000000")))
            self._apply_shape_styling(c, elem)

            cr = getattr(elem, 'corner_radius_mm', 0.0)
            cr_pt = mm_to_pt(cr) if cr > 0 else 0

            if getattr(elem, 'filled', False):
                c.setFillColor(_hex_to_color(getattr(elem, 'fill_color', "#FFFFFF")))
                if cr_pt > 0:
                    c.roundRect(x_pt, y_pt, w_pt, h_pt, cr_pt, fill=1, stroke=1)
                else:
                    c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=1)
            else:
                if cr_pt > 0:
                    c.roundRect(x_pt, y_pt, w_pt, h_pt, cr_pt, fill=0, stroke=1)
                else:
                    c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
            c.restoreState()
        except Exception as e:
            logger.error(f"Rect draw error: {e}")

    def _draw_line(self, c, elem):
        try:
            x_pt, y_pt = self._to_pdf_coords(elem)
            w_pt = mm_to_pt(elem.width_mm)
            h_pt = mm_to_pt(elem.height_mm)
            
            c.saveState()
            border_color = getattr(elem, 'border_color', "#000000")
            c.setStrokeColor(_hex_to_color(border_color))
            self._apply_shape_styling(c, elem)
            
            # Draw centered in the bounding box height
            cy = y_pt + h_pt/2
            c.line(x_pt, cy, x_pt + w_pt, cy)
            
            # Draw arrowheads if requested
            arrow = getattr(elem, 'arrow_head', 'none')
            if arrow != 'none':
                c.setFillColor(_hex_to_color(border_color))
                bw = max(1.0, getattr(elem, 'border_width', 0.5))
                sz = max(bw * 3.0, mm_to_pt(2.0))
                
                # Reportlab Path for arrows
                if arrow in ('start', 'both'):
                    p = c.beginPath()
                    p.moveTo(x_pt, cy)
                    p.lineTo(x_pt + sz, cy + sz/1.5)
                    p.lineTo(x_pt + sz, cy - sz/1.5)
                    p.close()
                    c.drawPath(p, fill=1, stroke=0)
                    
                if arrow in ('end', 'both'):
                    p = c.beginPath()
                    p.moveTo(x_pt + w_pt, cy)
                    p.lineTo(x_pt + w_pt - sz, cy + sz/1.5)
                    p.lineTo(x_pt + w_pt - sz, cy - sz/1.5)
                    p.close()
                    c.drawPath(p, fill=1, stroke=0)
                    
            c.restoreState()
        except Exception as e:
            logger.error(f"Line draw error: {e}")

    def _draw_circle(self, c, elem):
        try:
            x_pt, y_pt = self._to_pdf_coords(elem)
            w_pt = mm_to_pt(elem.width_mm)
            h_pt = mm_to_pt(elem.height_mm)
            if w_pt <= 0 or h_pt <= 0: return

            c.saveState()
            c.setStrokeColor(_hex_to_color(getattr(elem, 'border_color', "#000000")))
            self._apply_shape_styling(c, elem)
            
            if getattr(elem, 'filled', False):
                c.setFillColor(_hex_to_color(getattr(elem, 'fill_color', "#FFFFFF")))
                c.ellipse(x_pt, y_pt, x_pt + w_pt, y_pt + h_pt, fill=1, stroke=1)
            else:
                c.ellipse(x_pt, y_pt, x_pt + w_pt, y_pt + h_pt, fill=0, stroke=1)
            c.restoreState()
        except Exception as e:
            logger.error(f"Circle draw error: {e}")

    def _draw_error_placeholder(self, c, elem, msg):
        try:
            x_pt, y_pt = self._to_pdf_coords(elem)
            w_pt, h_pt = mm_to_pt(elem.width_mm), mm_to_pt(elem.height_mm)
            if w_pt <= 0 or h_pt <= 0: return

            c.saveState()
            c.setStrokeColor(colors.red)
            c.setDash(3, 3)
            c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
            c.setFillColor(colors.red)
            c.setFont("Helvetica", min(float(h_pt), 8.0))
            c.drawCentredString(x_pt + w_pt/2, y_pt + (h_pt-4)/2, msg[:40])
            c.restoreState()
        except: pass

