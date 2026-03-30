# FILE: omg/print/win_dispatcher.py
# Windows Print Dispatcher — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Uses pywin32 Win32 Print API. Only imported on Windows.
# Supports: SumatraPDF (preferred), GDI rendering (universal fallback).
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import io
import subprocess
import tempfile
from pathlib import Path
from typing import List

from loguru import logger

from omg.print.dispatcher import AbstractPrintDispatcher


class Win32PrintDispatcher(AbstractPrintDispatcher):
    """Windows print dispatcher using Win32 API."""

    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False) -> bool:
        """Print a PDF via SumatraPDF (silent) or GDI rendering (universal).

        Pipeline:
        1. Try SumatraPDF — fastest, best quality, but must be installed.
        2. Fall back to GDI rendering — converts PDF pages to images and
           prints through the standard Windows device context, which works
           with ALL printers (inkjet, laser, thermal label, etc.).
        """
        # Save PDF to temp file (needed for SumatraPDF)
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()

        def _cleanup():
            try:
                Path(tmp.name).unlink(missing_ok=True)
            except:
                pass

        # ── Attempt 1: SumatraPDF (silent, high-quality) ──────────────
        try:
            result = subprocess.run(
                [
                    "SumatraPDF.exe",
                    "-print-to", printer_name,
                    "-print-settings", f"{copies}x",
                    "-silent",
                    tmp.name,
                ],
                capture_output=True,
                timeout=60,
            )

            if result.returncode != 0:
                raise FileNotFoundError()

            logger.info(f"Win32 print dispatched to {printer_name} via Sumatra")
            _cleanup()
            return True

        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass  # SumatraPDF not available, fall through to GDI

        # ── Attempt 2: GDI rendering (universal — works with all printers) ──
        _cleanup()
        try:
            return self._print_pdf_via_gdi(pdf_bytes, printer_name, copies)
        except Exception as e:
            logger.error(f"GDI print failed: {e}")
            raise

    def _print_pdf_via_gdi(self, pdf_bytes: bytes, printer_name: str,
                           copies: int = 1) -> bool:
        """Render PDF pages to images and print via Win32 GDI device context.

        For thermal label printers:
        - Sets DEVMODE paper size to match the PDF page (label) dimensions
        - Rasterizes at the printer's native DPI (e.g. 203 for Toshiba B-FV4)
        - Places image at (0,0) — no centering — labels are pre-cut to size
        - 1:1 pixel mapping ensures the output matches the PDF exactly
        """
        import win32print
        import win32ui
        import win32con
        import ctypes
        import struct
        from PIL import Image
        import fitz  # pymupdf — used to read actual page dimensions

        # ── Read the actual label dimensions from the PDF ────────────
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        first_page = doc[0]
        # MediaBox is in PDF points (1 pt = 1/72 inch)
        pdf_w_pt = first_page.rect.width
        pdf_h_pt = first_page.rect.height
        doc.close()

        # Convert PDF points → tenths of mm (DEVMODE units)
        label_w_tenths_mm = int(pdf_w_pt / 72.0 * 25.4 * 10)
        label_h_tenths_mm = int(pdf_h_pt / 72.0 * 25.4 * 10)

        logger.info(
            f"GDI print: PDF page = {pdf_w_pt:.1f}x{pdf_h_pt:.1f} pt "
            f"→ label = {label_w_tenths_mm/10:.1f}x{label_h_tenths_mm/10:.1f} mm"
        )

        # ── Configure DEVMODE with exact label dimensions ────────────
        # Build a ctypes DEVMODEW with the correct paper size.
        # PyCDC doesn't expose ResetDC, so we create the DC directly
        # via ctypes CreateDCW with our custom DEVMODE.

        CCHDEVICENAME = 32
        CCHFORMNAME = 32

        class DEVMODEW(ctypes.Structure):
            _fields_ = [
                ("dmDeviceName", ctypes.c_wchar * CCHDEVICENAME),
                ("dmSpecVersion", ctypes.c_ushort),
                ("dmDriverVersion", ctypes.c_ushort),
                ("dmSize", ctypes.c_ushort),
                ("dmDriverExtra", ctypes.c_ushort),
                ("dmFields", ctypes.c_uint),
                ("dmOrientation", ctypes.c_short),
                ("dmPaperSize", ctypes.c_short),
                ("dmPaperLength", ctypes.c_short),
                ("dmPaperWidth", ctypes.c_short),
                ("dmScale", ctypes.c_short),
                ("dmCopies", ctypes.c_short),
                ("dmDefaultSource", ctypes.c_short),
                ("dmPrintQuality", ctypes.c_short),
                ("dmColor", ctypes.c_short),
                ("dmDuplex", ctypes.c_short),
                ("dmYResolution", ctypes.c_short),
                ("dmTTOption", ctypes.c_short),
                ("dmCollate", ctypes.c_short),
                ("dmFormName", ctypes.c_wchar * CCHFORMNAME),
                ("dmLogPixels", ctypes.c_ushort),
                ("dmBitsPerPel", ctypes.c_uint),
                ("dmPelsWidth", ctypes.c_uint),
                ("dmPelsHeight", ctypes.c_uint),
                ("dmDisplayFlags", ctypes.c_uint),
                ("dmDisplayFrequency", ctypes.c_uint),
                ("dmICMMethod", ctypes.c_uint),
                ("dmICMIntent", ctypes.c_uint),
                ("dmMediaType", ctypes.c_uint),
                ("dmDitherType", ctypes.c_uint),
                ("dmReserved1", ctypes.c_uint),
                ("dmReserved2", ctypes.c_uint),
                ("dmPanningWidth", ctypes.c_uint),
                ("dmPanningHeight", ctypes.c_uint),
            ]

        dm = DEVMODEW()
        dm.dmSize = ctypes.sizeof(DEVMODEW)
        dm.dmDriverExtra = 0
        dm.dmFields = 0x1 | 0x2 | 0x8 | 0x10  # DM_ORIENTATION | DM_PAPERSIZE | DM_PAPERLENGTH | DM_PAPERWIDTH
        dm.dmOrientation = 1  # Portrait
        dm.dmPaperSize = 256  # DMPAPER_USER
        dm.dmPaperWidth = label_w_tenths_mm
        dm.dmPaperLength = label_h_tenths_mm

        gdi32 = ctypes.windll.gdi32

        # Try creating DC with custom DEVMODE via ctypes
        try:
            gdi32.CreateDCW.restype = ctypes.c_void_p
            raw_hdc = gdi32.CreateDCW(
                "WINSPOOL",
                printer_name,
                None,
                ctypes.byref(dm),
            )
            if raw_hdc:
                hDC = win32ui.CreateDCFromHandle(raw_hdc)
                logger.info("GDI: Created DC with custom DEVMODE (label-sized paper)")
            else:
                raise RuntimeError("CreateDCW returned NULL")
        except Exception as e:
            logger.warning(f"Could not set custom paper size ({e}), using driver defaults")
            hDC = win32ui.CreateDC()
            hDC.CreatePrinterDC(printer_name)

        try:
            # Get the printer's native DPI
            printer_dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
            printer_dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY)
            printer_w = hDC.GetDeviceCaps(win32con.HORZRES)
            printer_h = hDC.GetDeviceCaps(win32con.VERTRES)

            logger.info(
                f"GDI print: printer DPI={printer_dpi_x}x{printer_dpi_y}, "
                f"page={printer_w}x{printer_h} dots"
            )

            # Rasterize PDF at the printer's native DPI for 1:1 dot mapping
            render_dpi = printer_dpi_x  # Use horizontal DPI (typically matches vertical)
            images = self._pdf_to_images(pdf_bytes, dpi=render_dpi)
            if not images:
                raise RuntimeError("Failed to convert PDF to images for printing")

            logger.info(f"GDI print: {len(images)} page(s) to '{printer_name}' (copies={copies})")

            gdi32 = ctypes.windll.gdi32

            for copy_num in range(copies):
                for page_idx, img in enumerate(images):
                    hDC.StartDoc(f"OMG Label {page_idx + 1}")
                    hDC.StartPage()

                    img_w, img_h = img.size

                    # Place at (0,0) — for thermal labels, the label IS the page.
                    # Clip to printer page bounds to avoid overflow.
                    dest_w = min(img_w, printer_w)
                    dest_h = min(img_h, printer_h)

                    # Prepare BGR pixel data with 4-byte row stride
                    rgb_img = img.convert("RGB")
                    row_stride = ((img_w * 3 + 3) // 4) * 4
                    pixel_data = bytearray(row_stride * img_h)
                    raw_data = rgb_img.tobytes()

                    for y in range(img_h):
                        src_offset = y * img_w * 3
                        dst_offset = y * row_stride
                        for x in range(img_w):
                            s = src_offset + x * 3
                            d = dst_offset + x * 3
                            pixel_data[d] = raw_data[s + 2]      # B
                            pixel_data[d + 1] = raw_data[s + 1]  # G
                            pixel_data[d + 2] = raw_data[s]      # R

                    # BITMAPINFOHEADER
                    header = struct.pack('<IiiHHIIiiII',
                        40,             # biSize
                        img_w,          # biWidth
                        -img_h,         # biHeight (negative = top-down)
                        1,              # biPlanes
                        24,             # biBitCount
                        0,              # biCompression (BI_RGB)
                        0,              # biSizeImage
                        0,              # biXPelsPerMeter
                        0,              # biYPelsPerMeter
                        0,              # biClrUsed
                        0,              # biClrImportant
                    )

                    # Blit image onto the printer DC at origin (0,0)
                    gdi32.StretchDIBits(
                        hDC.GetSafeHdc(),
                        0, 0, dest_w, dest_h,       # dest: origin, label-sized
                        0, 0, img_w, img_h,          # src: full image
                        bytes(pixel_data),
                        header,
                        0,              # DIB_RGB_COLORS
                        0x00CC0020,     # SRCCOPY
                    )

                    hDC.EndPage()
                    hDC.EndDoc()
                    logger.debug(
                        f"GDI: page {page_idx + 1} rendered "
                        f"({img_w}x{img_h} @ {render_dpi}dpi -> {dest_w}x{dest_h} dots)"
                    )

            logger.info(f"Win32 print dispatched to {printer_name} via GDI rendering")
            return True

        finally:
            hDC.DeleteDC()

    def _pdf_to_images(self, pdf_bytes: bytes, dpi: int = 300) -> list:
        """Convert PDF pages to PIL Images using PyMuPDF (fitz).

        PyMuPDF handles all PDF rendering natively — no external tools needed.
        """
        from PIL import Image
        import fitz  # pymupdf

        images = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render at the specified DPI (default PDF is 72 DPI)
            zoom = dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)

            # Convert to PIL Image
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            images.append(img)
            logger.debug(f"Rasterized page {page_num} via PyMuPDF ({pix.width}x{pix.height} @ {dpi}dpi)")

        doc.close()
        return images

    def list_printers(self) -> List[str]:
        """List available printers via Win32 API."""
        import win32print  # type: ignore
        printers = win32print.EnumPrinters(2)
        return [p[2] for p in printers]

    def get_default_printer(self) -> str:
        """Get the Windows default printer name."""
        import win32print  # type: ignore
        return win32print.GetDefaultPrinter()

    def print_raw(self, raw_bytes: bytes, printer_name: str) -> bool:
        """Send raw ZPL/TSPL bytes directly to the Windows Spooler."""
        import win32print  # type: ignore
        try:
            logger.info(f"[Win32] Opening printer: {printer_name}")
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                job_info = ("OMG Raw Print Job", None, "RAW")
                logger.info("[Win32] Starting StartDocPrinter")
                hJob = win32print.StartDocPrinter(hPrinter, 1, job_info)
                try:
                    logger.info("[Win32] Starting StartPagePrinter")
                    win32print.StartPagePrinter(hPrinter)
                    logger.info(f"[Win32] Writing {len(raw_bytes)} bytes to printer")
                    win32print.WritePrinter(hPrinter, raw_bytes)
                    win32print.EndPagePrinter(hPrinter)
                    logger.info(f"Win32 print dispatched successfully to {printer_name}")
                    return True
                except Exception as e:
                    logger.error(f"[Win32] Write/Page failed: {e}")
                    raise
                finally:
                    win32print.EndDocPrinter(hPrinter)
            except Exception as e:
                logger.error(f"[Win32] Doc failed: {e}")
                raise
            finally:
                win32print.ClosePrinter(hPrinter)
        except Exception as e:
            logger.error(f"Win32 raw spooling failed: {e}")
            raise
