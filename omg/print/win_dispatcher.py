# FILE: omg/print/win_dispatcher.py
# Windows Print Dispatcher — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Uses pywin32 Win32 Print API. Only imported on Windows.
# Supports: SumatraPDF (preferred), GDI via Pillow ImageWin (universal),
# and ShellExecute 'printto' as final fallback.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import io
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import List

from loguru import logger

from omg.print.dispatcher import AbstractPrintDispatcher


class Win32PrintDispatcher(AbstractPrintDispatcher):
    """Windows print dispatcher using Win32 API.

    Works with ANY Windows printer — inkjet, laser, thermal label, etc.
    Uses a 3-tier fallback chain:
      1. SumatraPDF  (fastest, silent, must be installed separately)
      2. GDI via Pillow ImageWin  (universal, built-in)
      3. ShellExecute 'printto'  (uses system PDF handler)
    """

    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False, label_config=None) -> bool:
        """Print a PDF to any Windows printer via a 3-tier fallback chain."""
        # Save PDF to temp file (needed for SumatraPDF and ShellExecute)
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()
        tmp_path = tmp.name

        try:
            # ── Attempt 1: SumatraPDF (silent, high-quality) ──────────
            try:
                if self._try_sumatra(tmp_path, printer_name, copies, label_config):
                    return True
            except Exception as e:
                logger.debug(f"SumatraPDF not available: {e}")

            # ── Attempt 2: GDI via Pillow ImageWin (universal) ────────
            try:
                return self._print_pdf_via_gdi(pdf_bytes, printer_name, copies, label_config)
            except Exception as e:
                logger.warning(f"GDI print failed: {e}")

            # ── Attempt 3: ShellExecute 'printto' (system PDF handler) ─
            try:
                return self._print_pdf_via_shell(tmp_path, printer_name)
            except Exception as e:
                logger.error(f"ShellExecute printto failed: {e}")

            raise RuntimeError(
                f"All print methods failed for printer '{printer_name}'. "
                "Please check the printer is online and has a driver installed."
            )
        finally:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass

    # ── Tier 1: SumatraPDF ────────────────────────────────────────

    def _try_sumatra(self, pdf_path: str, printer_name: str, copies: int, label_config=None) -> bool:
        """Silent PDF printing via SumatraPDF (if installed)."""
        settings = [f"{copies}x"]
        if label_config:
            settings.append(f"paper={label_config.width_mm}x{label_config.height_mm}mm")
            
        result = subprocess.run(
            [
                "SumatraPDF.exe",
                "-print-to", printer_name,
                "-print-settings", ",".join(settings),
                "-silent",
                pdf_path,
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise FileNotFoundError("SumatraPDF not found or failed")

        logger.info(f"Printed to '{printer_name}' via SumatraPDF")
        return True

    # ── Tier 2: GDI via Pillow ImageWin ───────────────────────────

    def _print_pdf_via_gdi(self, pdf_bytes: bytes, printer_name: str,
                           copies: int = 1, label_config=None) -> bool:
        """Render PDF to images and print via Win32 GDI using Pillow ImageWin.

        Uses Pillow's ImageWin.Dib for fast, reliable bitmap transfer to
        the printer device context. Works with ALL printers — inkjet,
        laser, and thermal label printers.
        """
        import win32print
        import win32ui
        import win32con
        from PIL import Image, ImageWin
        import fitz  # pymupdf

        # ── Create printer DC using the printer driver's own settings ──
        hDC = win32ui.CreateDC()
        
        if label_config:
            try:
                import win32gui
                # Get the default DEVMODE for the printer
                hprinter = win32print.OpenPrinter(printer_name)
                # Call DocumentProperties twice: once to get the size, then to populate
                size = win32print.DocumentProperties(0, hprinter, printer_name, None, None, 0)
                if size > 0:
                    res, devmode = win32print.DocumentProperties(0, hprinter, printer_name, None, None, win32con.DM_OUT_BUFFER)
                    
                    if res == win32con.IDOK:
                        # DMPAPER_USER
                        devmode.PaperSize = 256
                        # DEVMODE lengths are in 1/10th of a millimeter
                        devmode.PaperWidth = int(label_config.width_mm * 10)
                        devmode.PaperLength = int(label_config.height_mm * 10)
                        
                        devmode.Orientation = 2 if label_config.width_mm > label_config.height_mm else 1

                        # Combine DM_PAPERSIZE, DM_PAPERLENGTH, DM_PAPERWIDTH mask
                        devmode.Fields |= win32con.DM_PAPERSIZE | win32con.DM_PAPERLENGTH | win32con.DM_PAPERWIDTH
                        
                        win32print.DocumentProperties(0, hprinter, printer_name, devmode, devmode, win32con.DM_IN_BUFFER | win32con.DM_OUT_BUFFER)
                        
                        hdc_handle = win32gui.CreateDC("WINSPOOL", printer_name, devmode)
                        hDC = win32ui.CreateDCFromHandle(hdc_handle)
                        logger.info(f"GDI: Applied custom page size {label_config.width_mm}x{label_config.height_mm}mm via DEVMODE")
                    else:
                        hDC.CreatePrinterDC(printer_name)
                else:
                    hDC.CreatePrinterDC(printer_name)
                win32print.ClosePrinter(hprinter)
            except Exception as e:
                logger.warning(f"GDI: Failed to set custom DEVMODE specs ({e}). Defaulting to driver bounds.")
                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC(printer_name)
        else:
            hDC.CreatePrinterDC(printer_name)

        try:
            # Query printer capabilities
            printer_dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
            printer_dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY)
            printer_w = hDC.GetDeviceCaps(win32con.HORZRES)  # printable width in dots
            printer_h = hDC.GetDeviceCaps(win32con.VERTRES)  # printable height in dots

            logger.info(
                f"GDI: printer='{printer_name}', "
                f"DPI={printer_dpi_x}x{printer_dpi_y}, "
                f"printable area={printer_w}x{printer_h} dots"
            )

            # Render PDF at the printer's native DPI for best quality
            render_dpi = max(printer_dpi_x, 150)
            images = self._pdf_to_images(pdf_bytes, dpi=render_dpi)
            if not images:
                raise RuntimeError("No pages rendered from PDF")

            logger.info(f"GDI: {len(images)} page(s), {copies} copies → '{printer_name}'")

            for copy_num in range(copies):
                hDC.StartDoc("OMG Labels")

                for page_idx, img in enumerate(images):
                    hDC.StartPage()

                    img_w, img_h = img.size

                    # Scale image to fit the printer's printable area,
                    # but never upscale (scale <= 1.0 preserves quality)
                    scale_x = printer_w / img_w if img_w > 0 else 1.0
                    scale_y = printer_h / img_h if img_h > 0 else 1.0
                    scale = min(scale_x, scale_y, 1.0)

                    dest_w = int(img_w * scale)
                    dest_h = int(img_h * scale)

                    # Use Pillow's ImageWin.Dib for reliable, fast bitmap
                    # transfer — handles BGR conversion and alignment internally
                    dib = ImageWin.Dib(img)
                    dib.draw(hDC.GetHandleOutput(), (0, 0, dest_w, dest_h))

                    hDC.EndPage()
                    logger.debug(
                        f"GDI: page {page_idx + 1} drawn "
                        f"({img_w}x{img_h} → {dest_w}x{dest_h} dots)"
                    )

                hDC.EndDoc()

            logger.info(f"Printed to '{printer_name}' via GDI rendering")
            return True

        finally:
            hDC.DeleteDC()

    # ── Tier 3: ShellExecute 'printto' ────────────────────────────

    def _print_pdf_via_shell(self, pdf_path: str, printer_name: str) -> bool:
        """Use Windows ShellExecute with 'printto' verb.

        This delegates to the system's default PDF handler (Edge, Acrobat,
        Chrome, Foxit, etc.) and prints to the specified printer.
        Works as a final fallback when GDI rendering fails.
        """
        import win32api

        logger.info(f"Attempting ShellExecute 'printto' → '{printer_name}'")

        # ShellExecute returns >32 on success
        result = win32api.ShellExecute(
            0,                      # hwnd (no parent window)
            "printto",              # verb: print to specific printer
            pdf_path,               # file to print
            f'"{printer_name}"',    # printer name parameter
            ".",                    # working directory
            0,                      # SW_HIDE — minimize window
        )

        if result <= 32:
            raise RuntimeError(f"ShellExecute 'printto' failed (code {result})")

        # Give the PDF handler a moment to spool the job
        time.sleep(2)
        logger.info(f"Printed to '{printer_name}' via ShellExecute")
        return True

    # ── PDF Rasterization ─────────────────────────────────────────

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

    # ── Printer Enumeration ───────────────────────────────────────

    def list_printers(self) -> List[str]:
        """List ALL available printers — local and network."""
        import win32print  # type: ignore
        # PRINTER_ENUM_LOCAL (2) | PRINTER_ENUM_CONNECTIONS (4) = 6
        printers = win32print.EnumPrinters(6)
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
