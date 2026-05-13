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
        settings = [f"{copies}x", "noscale"]
        if label_config:
            try:
                # SumatraPDF ignores raw "100x40mm" inputs unless that string maps to a Windows Form name.
                # So we use our bulletproof registry generator to drop an OS-level Form and feed *that* to Sumatra.
                form_name = self._register_custom_form(None, printer_name, label_config.width_mm, label_config.height_mm)
                if form_name:
                    settings.append(f"paper={form_name}")
                else:
                    # Fallback string
                    settings.append(f"paper={label_config.width_mm}x{label_config.height_mm}mm")
            except Exception as e:
                logger.debug(f"Sumatra custom form routing failed: {e}")
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

    def _register_custom_form(self, handle, printer_name: str, width_mm: float, height_mm: float) -> str | None:
        """Registers a custom form if missing. Returns the form name if successful or already exists, else None."""
        import win32print
        
        # ── STAGE: Dimensional Protection ──
        # Validates physical feasibility to prevent API integer bounds corruption
        if not (2 <= width_mm <= 1500) or not (2 <= height_mm <= 1500):
            logger.warning(f"Label parameters ({width_mm}x{height_mm}mm) out of allowable API boundary. Skipping registry mutation.")
            return None
            
        # SIZEL units are 0.001 millimeters (micrometers)
        cx = int((width_mm + 0.01) * 1000)
        cy = int((height_mm + 0.01) * 1000)
        
        # Truncate and sanitize to avoid 32-char limits
        form_name = f"OMG_{cx}x{cy}"
        
        # 1. ── First check if the form ALREADY exists! ──
        # We can read forms without Admin privileges.
        try:
            # handle might not be provided with enough access, but EnumForms usually requires minimal rights
            hprinter_read = win32print.OpenPrinter(printer_name)
            try:
                forms = win32print.EnumForms(hprinter_read)
                omg_forms = [f['Name'] for f in forms if f['Name'].startswith("OMG_")]
                
                # ── STAGE: Background Form Sweeper ──
                if len(omg_forms) > 50:
                    logger.info(f"Registry bloat detected ({len(omg_forms)} OMG_ forms). Executing background purge...")
                    try:
                        admin_defaults = {"DesiredAccess": win32print.PRINTER_ALL_ACCESS}
                        hadmin_purge = win32print.OpenPrinter(printer_name, admin_defaults)
                        for old_form in omg_forms:
                            if old_form != form_name:
                                try: win32print.DeleteForm(hadmin_purge, old_form)
                                except Exception: pass
                        win32print.ClosePrinter(hadmin_purge)
                    except Exception as e:
                        logger.debug(f"Could not secure admin for form sweep: {e}")
                
                if form_name in omg_forms:
                    logger.debug(f"Custom form {form_name} already exists. Bypassing registration.")
                    return form_name
            finally:
                win32print.ClosePrinter(hprinter_read)
        except Exception as e:
            logger.debug(f"EnumForms check failed: {e}")
        
        # 2. ── Attempt to formulate and add the Custom Form ──
        try:
            admin_defaults = {"DesiredAccess": win32print.PRINTER_ALL_ACCESS}
            hadmin = win32print.OpenPrinter(printer_name, admin_defaults)
        except Exception as e:
            logger.debug(f"Could not secure PRINTER_ALL_ACCESS to register missing form. Driver defaults will govern. {e}")
            return None  # Crucially return None so we don't pass a bogus form into DEVMODE
            
        try:
            # Delete if exists to avoid 'already exists' collision (though EnumForms should have caught it)
            try:
                win32print.DeleteForm(hadmin, form_name)
            except Exception:
                pass
                
            form_dict = {
                "Flags": 0,  # FORM_USER
                "Name": form_name,
                "Size": {"cx": cx, "cy": cy},
                "ImageableArea": {"left": 0, "top": 0, "right": cx, "bottom": cy}
            }
            
            try:
                win32print.AddForm(hadmin, form_dict)
            except Exception:
                win32print.AddForm(hadmin, 1, form_dict)
                
            logger.info(f"Registered brand new OS-level form: {form_name}")
            return form_name
        except Exception as e:
            logger.warning(f"Failed to register OS-level form {form_name}: {e}")
            return None
        finally:
            win32print.ClosePrinter(hadmin)

    # ── Tier 2: GDI via Pillow ImageWin ───────────────────────────

    def _print_pdf_via_gdi(self, pdf_bytes: bytes, printer_name: str,
                           copies: int = 1, label_config=None) -> bool:
        """Render PDF to images and print via Win32 GDI using Pillow ImageWin.

        Uses a STREAMING approach: renders one page at a time to avoid
        loading all pages into memory simultaneously. This is critical
        for large batch jobs (500+ labels) that would otherwise exhaust
        available RAM and crash the process.
        """
        import gc
        import win32print
        import win32ui
        import win32con
        from PIL import Image, ImageWin
        import fitz  # pymupdf

        # ── Create printer DC using the printer driver's own settings ──
        hDC = win32ui.CreateDC()
        
        if label_config:
            hprinter = None
            try:
                import win32gui
                hprinter = win32print.OpenPrinter(printer_name)
                # Bypassing DocumentProperties directly to GetPrinter(level=2)
                # because thermal drivers reject it with Error 87
                printer_info = win32print.GetPrinter(hprinter, 2)
                devmode = printer_info.get('pDevMode')
                
                if devmode:
                    devmode.PaperSize = 256
                    devmode.PaperWidth = int(label_config.width_mm * 10)
                    devmode.PaperLength = int(label_config.height_mm * 10)
                    devmode.Orientation = 1
                    
                    devmode.Fields |= (win32con.DM_PAPERSIZE | win32con.DM_PAPERLENGTH | win32con.DM_PAPERWIDTH | win32con.DM_ORIENTATION)
                    
                    hdc_handle = win32gui.CreateDC("WINSPOOL", printer_name, devmode)
                    hDC = win32ui.CreateDCFromHandle(hdc_handle)
                    logger.info(f"GDI: Applied custom page size {label_config.width_mm}x{label_config.height_mm}mm via direct DEVMODE")
                else:
                    hDC.CreatePrinterDC(printer_name)
            except Exception as e:
                logger.warning(f"GDI: Failed to set custom DEVMODE specs ({e}). Defaulting to driver bounds.")
                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC(printer_name)
            finally:
                if hprinter:
                    win32print.ClosePrinter(hprinter)
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

            # ── HIGH-QUALITY RASTERIZATION ──
            # Render at 3× the printer's native DPI (minimum 600 DPI).
            # This is critical because text at native 203 DPI looks broken
            # and faded. The printer driver handles the high-to-native DPI
            # downscaling using its own dithering, producing far crisper
            # output than a low-res source bitmap.
            render_dpi = max(printer_dpi_x * 3, 600)
            zoom = render_dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)

            # Open PDF document once for streaming page-by-page
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = len(doc)

            if total_pages == 0:
                doc.close()
                raise RuntimeError("No pages found in PDF")

            logger.info(
                f"GDI: {total_pages} page(s), {copies} copies → '{printer_name}' "
                f"(streaming at {render_dpi} DPI for {printer_dpi_x} DPI printer)"
            )

            page_errors = 0

            for copy_num in range(copies):
                hDC.StartDoc("OMG Labels")

                for page_idx in range(total_pages):
                    try:
                        # ── STREAM: Rasterize one page at a time ──
                        # This keeps peak memory to ~1 image instead of
                        # loading ALL pages (500 × 8 MB = 4 GB) at once.
                        page = doc[page_idx]
                        pix = page.get_pixmap(matrix=mat, alpha=False)
                        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

                        # Free the MuPDF pixmap immediately
                        pix = None

                        # ── CRITICAL: Convert to pure black/white ──
                        # Thermal printers are 1-bit devices — they can only
                        # print black or not-black. MuPDF renders text with
                        # grey anti-aliased edge pixels. The printer drops
                        # these grey pixels, causing broken/gap characters.
                        # Converting to 1-bit with a threshold produces solid,
                        # crisp text edges with no grey artifacts.
                        img = img.convert('L')           # RGB → greyscale
                        img = img.point(lambda x: 0 if x < 180 else 255, '1')  # threshold → B/W
                        img = img.convert('RGB')         # back to RGB for GDI Dib

                        hDC.StartPage()

                        # ── Map the high-DPI render to fill the printer area ──
                        img_w, img_h = img.size
                        scale_x = printer_w / img_w if img_w > 0 else 1.0
                        scale_y = printer_h / img_h if img_h > 0 else 1.0
                        scale = min(scale_x, scale_y)

                        dest_w = int(img_w * scale)
                        dest_h = int(img_h * scale)

                        dib = ImageWin.Dib(img)
                        dib.draw(hDC.GetHandleOutput(), (0, 0, dest_w, dest_h))

                        hDC.EndPage()

                        # Free image memory immediately after sending to spooler
                        del dib
                        del img
                        if page_idx % 50 == 0:
                            gc.collect()

                        if page_idx % 100 == 0 and page_idx > 0:
                            logger.info(f"GDI: progress {page_idx}/{total_pages} pages sent")

                    except Exception as page_err:
                        page_errors += 1
                        logger.error(f"GDI: page {page_idx + 1} failed: {page_err}")
                        # Try to end the page cleanly so subsequent pages can proceed
                        try:
                            hDC.EndPage()
                        except Exception:
                            pass
                        if page_errors > 10:
                            logger.error("GDI: too many page errors, aborting job")
                            break

                hDC.EndDoc()

            doc.close()

            if page_errors > 10:
                raise RuntimeError(
                    f"Printing aborted: {page_errors} pages failed to render out of {total_pages}. "
                    f"This is usually caused by insufficient memory. Try printing in smaller batches (e.g. 50–100 labels at a time)."
                )

            if page_errors > 0:
                logger.warning(f"GDI: completed with {page_errors} page errors out of {total_pages}")

            logger.info(f"Printed {total_pages} pages to '{printer_name}' via GDI streaming")
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
