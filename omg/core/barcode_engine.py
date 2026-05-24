# FILE: omg/core/barcode_engine.py
# Barcode Rendering Engine — SEC 04 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Stateless factory with LRU cache. Wraps python-barcode for 1D codes,
# qrcode for QR, and treepoem for DataMatrix/PDF417. All output is SVG
# first; PNG conversion only for screen thumbnails.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import base64
import io
from functools import lru_cache
from typing import Optional

from loguru import logger


# ── Custom Exceptions ────────────────────────────────────────────────

class UnsupportedSymbologyError(Exception):
    """Raised when an unknown barcode symbology is requested."""
    pass


class BarcodeRenderError(Exception):
    """Raised when barcode rendering fails."""
    pass


# ── GS1 Formatter ────────────────────────────────────────────────────

class GS1Formatter:
    """Formats GS1-128 data strings with correct AI prefixes and check digits."""

    # Application Identifier registry (subset of most common AIs)
    AI_REGISTRY = {
        "00": {"name": "SSCC", "length": 18, "type": "N"},
        "01": {"name": "GTIN", "length": 14, "type": "N"},
        "02": {"name": "CONTENT", "length": 14, "type": "N"},
        "10": {"name": "LOT_NUMBER", "length": 20, "type": "AN"},
        "11": {"name": "PROD_DATE", "length": 6, "type": "N"},
        "17": {"name": "EXPIRY_DATE", "length": 6, "type": "N"},
        "20": {"name": "VARIANT", "length": 2, "type": "N"},
        "21": {"name": "SERIAL", "length": 20, "type": "AN"},
        "30": {"name": "COUNT", "length": 8, "type": "N"},
        "37": {"name": "QUANTITY", "length": 8, "type": "N"},
    }

    FNC1 = chr(0x1D)  # GS1 FNC1 separator character

    @classmethod
    def format(cls, raw_data: str) -> str:
        """Format a GS1 data string with AI brackets.
        Input:  "(01)12345678901231(10)LOT123"
        Output: FNC1 + "01" + "12345678901231" + FNC1 + "10" + "LOT123"
        """
        parts = cls._parse_ai_string(raw_data)
        result = ""
        for ai, value in parts:
            spec = cls.AI_REGISTRY.get(ai)
            if spec is None:
                raise ValueError(f"Unknown GS1 Application Identifier: ({ai})")

            if spec["type"] == "N":
                # Zero-pad numeric values to the specified length
                value = value.zfill(spec["length"])

            # Add check digit for GTIN (AI 01)
            if ai == "01" and len(value) == 13:
                value = value + cls.calculate_check_digit(value)

            result += cls.FNC1 + ai + value
        return result

    @classmethod
    def calculate_check_digit(cls, digits: str) -> str:
        """GS1 Mod-10 check digit calculation."""
        total = 0
        for i, d in enumerate(reversed(digits)):
            weight = 3 if i % 2 == 0 else 1
            total += int(d) * weight
        check = (10 - (total % 10)) % 10
        return str(check)

    @classmethod
    def _parse_ai_string(cls, raw: str) -> list[tuple[str, str]]:
        """Parse "(AI)value(AI)value" format into [(ai, value), ...]."""
        parts = []
        i = 0
        while i < len(raw):
            if raw[i] == "(":
                close = raw.index(")", i)
                ai = raw[i + 1:close]
                # Find the next AI bracket or end of string
                next_open = raw.find("(", close + 1)
                if next_open == -1:
                    value = raw[close + 1:]
                    i = len(raw)
                else:
                    value = raw[close + 1:next_open]
                    i = next_open
                parts.append((ai, value))
            else:
                i += 1
        return parts


# ── Barcode Renderer ─────────────────────────────────────────────────

# Supported symbologies with their library routing
SYMBOLOGY_INFO = {
    "code128": {"library": "python-barcode", "format": "svg"},
    "code39":  {"library": "python-barcode", "format": "svg"},
    "ean13":   {"library": "python-barcode", "format": "svg"},
    "ean8":    {"library": "python-barcode", "format": "svg"},
    "itf14":   {"library": "python-barcode", "format": "svg"},  # mapped to ITF
    "gs1_128": {"library": "python-barcode", "format": "svg"},
    "qrcode":  {"library": "qrcode", "format": "svg"},
    "datamatrix": {"library": "treepoem", "format": "png"},
    "pdf417":  {"library": "treepoem", "format": "png"},
}


def mm_to_px(mm: float, dpi: int = 96) -> float:
    """Convert millimetres to pixels at the given DPI."""
    return mm * dpi / 25.4


def mm_to_pt(mm: float) -> float:
    """Convert millimetres to PDF points (1pt = 1/72 inch)."""
    return mm * 72.0 / 25.4


class BarcodeRenderer:
    """Main factory for rendering barcodes to SVG or PNG."""

    @staticmethod
    @lru_cache(maxsize=512)
    def render_svg(symbology: str, value: str,
                   width_mm: float = 40.0, height_mm: float = 15.0,
                   show_text: bool = True) -> str:
        """Render a barcode to an SVG string.

        Args:
            symbology: Barcode type (code128, qrcode, etc.)
            value: Data to encode
            width_mm: Target width in millimetres
            height_mm: Target height in millimetres

        Returns:
            SVG markup string

        Raises:
            UnsupportedSymbologyError: If symbology is not recognized
            BarcodeRenderError: If rendering fails
        """
        if not symbology or symbology not in SYMBOLOGY_INFO:
            raise UnsupportedSymbologyError(
                f"Unknown symbology: '{symbology or 'None'}'. "
                f"Supported: {', '.join(SYMBOLOGY_INFO.keys())}"
            )

        if not value or str(value).strip() == "":
            # Return a valid empty SVG or raise a specific error that the caller can handle
            return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_mm:.0f}" height="{height_mm:.0f}"></svg>'

        try:
            if symbology in ("code128", "code39", "ean13", "ean8", "itf14", "gs1_128"):
                return BarcodeRenderer._render_linear(symbology, value, width_mm, height_mm, show_text=show_text)
            elif symbology == "qrcode":
                return BarcodeRenderer._render_qrcode(value, width_mm, height_mm)
            elif symbology in ("datamatrix", "pdf417"):
                return BarcodeRenderer._render_treepoem(symbology, value, width_mm, height_mm)
            else:
                raise UnsupportedSymbologyError(f"Unhandled symbology: {symbology}")
        except (UnsupportedSymbologyError, BarcodeRenderError):
            raise
        except Exception as e:
            raise BarcodeRenderError(f"Failed to render {symbology}: {e}") from e

    @staticmethod
    def _render_linear(symbology: str, value: str,
                       width_mm: float, height_mm: float,
                       show_text: bool = True) -> str:
        """Render a 1D linear barcode via python-barcode.
        
        Calculates module_width so the barcode's natural width matches the
        element width, avoiding post-render scaling that can make bars too
        thin to scan on small labels.
        """
        import barcode
        from barcode.writer import SVGWriter

        # Handle GS1-128 formatting
        actual_symbology = symbology
        if symbology == "gs1_128":
            value = GS1Formatter.format(value)
            actual_symbology = "code128"

        # Map our names to python-barcode names
        barcode_map = {
            "code128": "code128",
            "code39": "code39",
            "ean13": "ean13",
            "ean8": "ean8",
            "itf14": "itf",
        }
        bc_name = barcode_map.get(
            actual_symbology.lower().replace("-", ""),
            actual_symbology.lower().replace("-", "")
        )

        # ── Calculate optimal module_width ──────────────────────────────
        # The python-barcode library generates SVG at module_width * num_modules.
        # If we use the default (0.2mm), then row_renderer.py has to scale
        # the SVG to fit the element width — on small labels this makes
        # bars too thin to scan.
        #
        # Instead, we calculate module_width so the barcode naturally fits
        # the element width, with a minimum of 0.264mm (ISO/GS1 standard
        # minimum x-dimension for Code 128 at ≥150 DPI).
        #
        # To find num_modules, we do a trial render at module_width=1.0
        # and measure the resulting SVG width.
        MIN_MODULE_WIDTH_MM = 0.264  # ISO minimum for scannable barcodes

        writer_trial = SVGWriter()
        code_trial = barcode.get_barcode_class(bc_name)(value, writer=writer_trial)
        trial_buf = io.BytesIO()
        code_trial.write(trial_buf, {
            "module_width": 1.0,  # 1mm per module for easy calculation
            "module_height": height_mm,
            "write_text": False,
            "quiet_zone": 0.0,
            "text_distance": 0.0,
            "margin_top": 0.0,
            "margin_bottom": 0.0,
            "margin_left": 0.0,
            "margin_right": 0.0,
            "background": "transparent",
        })
        # Parse SVG width to find total number of modules
        trial_svg = trial_buf.getvalue().decode("utf-8")
        num_modules = None
        import re
        width_match = re.search(r'width="([\d.]+)mm"', trial_svg)
        if width_match:
            num_modules = float(width_match.group(1))  # at 1mm/module, width_mm == num_modules

        if num_modules and num_modules > 0:
            # module_width = element_width / num_modules, but not below minimum
            ideal_module_width = width_mm / num_modules
            module_width = max(ideal_module_width, MIN_MODULE_WIDTH_MM)
        else:
            # Fallback: use a safe default
            module_width = max(0.33, MIN_MODULE_WIDTH_MM)

        # ── Final render with calculated module_width ───────────────────
        writer = SVGWriter()
        code_obj = barcode.get_barcode_class(bc_name)(value, writer=writer)
        buffer = io.BytesIO()
        code_obj.write(buffer, {
            "module_width": module_width,
            "module_height": height_mm,
            "write_text": show_text,
            "quiet_zone": 0.0,
            "text_distance": 0.0,
            "margin_top": 0.0,
            "margin_bottom": 0.0,
            "margin_left": 0.0,
            "margin_right": 0.0,
            "background": "transparent",
        })
        svg_str = buffer.getvalue().decode("utf-8")
        return svg_str

    @staticmethod
    def _render_qrcode(value: str, width_mm: float, height_mm: float,
                       error_correction: str = "M") -> str:
        """Render a QR code via qrcode library."""
        import qrcode
        import qrcode.image.svg

        error_map = {
            "L": qrcode.constants.ERROR_CORRECT_L,
            "M": qrcode.constants.ERROR_CORRECT_M,
            "Q": qrcode.constants.ERROR_CORRECT_Q,
            "H": qrcode.constants.ERROR_CORRECT_H,
        }

        qr = qrcode.QRCode(
            error_correction=error_map.get(error_correction, qrcode.constants.ERROR_CORRECT_M),
            box_size=10,
            border=0,
        )
        qr.add_data(value)
        qr.make(fit=True)

        img = qr.make_image(image_factory=qrcode.image.svg.SvgImage)
        buffer = io.BytesIO()
        img.save(buffer)
        
        # Inject shape-rendering="crispEdges" and ensure transparent background
        svg_str = buffer.getvalue().decode("utf-8")
        if "<svg " in svg_str:
            svg_str = svg_str.replace("<svg ", '<svg shape-rendering="crispEdges" ', 1)
            # Find the background white rect and make it transparent or remove it
            svg_str = svg_str.replace('fill="#ffffff"', 'fill="none"', 1)
            
        return svg_str

    @staticmethod
    def _render_treepoem(symbology: str, value: str,
                         width_mm: float, height_mm: float) -> str:
        """Render DataMatrix or PDF417 via treepoem (requires Ghostscript)."""
        try:
            import treepoem
        except ImportError:
            raise BarcodeRenderError(
                f"treepoem is not installed. Cannot render {symbology}."
            )

        try:
            img = treepoem.generate_barcode(
                barcode_type=symbology,
                data=value,
            )
        except Exception as e:
            raise BarcodeRenderError(
                f"treepoem render failed for {symbology}. "
                f"Is Ghostscript installed? Error: {e}"
            ) from e

        # Convert PIL image to PNG bytes, then to SVG data URI
        png_buffer = io.BytesIO()
        img.convert("L").save(png_buffer, format="PNG")
        png_bytes = png_buffer.getvalue()
        b64 = base64.b64encode(png_bytes).decode("ascii")
        w_px = mm_to_px(width_mm)
        h_px = mm_to_px(height_mm)

        svg_str = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{w_px:.0f}" height="{h_px:.0f}" '
            f'viewBox="0 0 {w_px:.0f} {h_px:.0f}">'
            f'<image href="data:image/png;base64,{b64}" '
            f'width="{w_px:.0f}" height="{h_px:.0f}" />'
            f'</svg>'
        )
        return svg_str

    @staticmethod
    def render_reportlab_drawing(symbology: str, value: str,
                                 width_mm: float, height_mm: float,
                                 show_text: bool = False):
        """Render a barcode as a ReportLab Drawing object for PDF embedding."""
        if not value or not str(value).strip():
            return None

        import sys
        from svglib.svglib import svg2rlg
        try:
            # Use the requested show_text setting
            svg_str = BarcodeRenderer.render_svg(symbology, value, width_mm, height_mm, show_text=show_text)
            if not svg_str:
                sys.stderr.write("DEBUG: render_svg returned EMPTY string!\n")
                sys.stderr.flush()
                return None
                
            # svglib requires bytes or a file-like object containing bytes
            drawing = svg2rlg(io.BytesIO(svg_str.encode("utf-8")))
            if drawing:
                sys.stderr.write(f"DEBUG: svg2rlg SUCCESS: width={drawing.width} height={drawing.height}\n")
                # Do NOT force dimensions here, let RowRenderer handle scaling
            else:
                sys.stderr.write("DEBUG: svg2rlg FAILED to return drawing!\n")
            sys.stderr.flush()
            return drawing
        except Exception as e:
            sys.stderr.write(f"DEBUG: render_reportlab_drawing EXCEPTION: {e}\n")
            sys.stderr.flush()
            raise

    @staticmethod
    def render_png_bytes(symbology: str, value: str,
                         width_mm: float, height_mm: float,
                         dpi: int = 300) -> bytes:
        """Render a barcode as PNG bytes (for preview thumbnails)."""
        svg_str = BarcodeRenderer.render_svg(symbology, value, width_mm, height_mm)
        # For PNG export, render SVG to image via QSvgRenderer (requires Qt)
        # Fallback: return empty bytes if Qt is not available
        try:
            from PyQt6.QtSvg import QSvgRenderer
            from PyQt6.QtGui import QImage, QPainter
            from PyQt6.QtCore import QByteArray

            w_px = int(mm_to_px(width_mm, dpi))
            h_px = int(mm_to_px(height_mm, dpi))

            renderer = QSvgRenderer(QByteArray(svg_str.encode()))
            image = QImage(w_px, h_px, QImage.Format.Format_ARGB32)
            image.fill(0xFFFFFFFF)
            painter = QPainter(image)
            renderer.render(painter)
            painter.end()

            buf = QByteArray()
            buffer = io.BytesIO()
            image.save(buffer, "PNG")  # type: ignore
            return buffer.getvalue()
        except ImportError:
            logger.warning("PyQt6 not available for PNG rendering")
            return b""

    @staticmethod
    def get_supported_symbologies() -> list[str]:
        """Return a list of all supported barcode symbology names."""
        return list(SYMBOLOGY_INFO.keys())

    @staticmethod
    def clear_cache() -> None:
        """Clear the render cache."""
        BarcodeRenderer.render_svg.cache_clear()
