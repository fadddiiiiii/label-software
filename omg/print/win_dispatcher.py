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

            # ── PIXEL-PERFECT RASTERIZATION FOR THERMAL PRINTERS ──
            # Render at EXACTLY the printer's native DPI with anti-aliasing
            # disabled.  This produces razor-sharp binary characters:
            #   • No downscaling artifacts (LANCZOS halos cause smudging)
            #   • No threshold guesswork (AA disabled = already black/white)
            #   • 1:1 pixel-to-dot mapping (no GDI interpolation)
            # This matches how professional label software renders text.
            render_dpi = max(printer_dpi_x, 203)  # fallback 203 for thermal
            zoom = render_dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)

            # Disable MuPDF anti-aliasing for this print job.
            # AA produces grey edge pixels which blur on thermal printers.
            # With AA=0, MuPDF renders pixel-aligned glyphs — pure B/W edges.
            try:
                fitz.TOOLS.set_aa_level(0)
            except Exception:
                pass  # Older PyMuPDF versions may not support this

            # Open PDF document once for streaming page-by-page
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = len(doc)

            if total_pages == 0:
                doc.close()
                raise RuntimeError("No pages found in PDF")

            logger.info(
                f"GDI: {total_pages} page(s), {copies} copies → '{printer_name}' "
                f"(native {render_dpi} DPI, no-AA, "
                f"target {printer_w}×{printer_h} dots)"
            )

            page_errors = 0

            for copy_num in range(copies):
                hDC.StartDoc("OMG Labels")

                for page_idx in range(total_pages):
                    try:
                        # ── Rasterize one page at native DPI ──
                        page = doc[page_idx]
                        pix = page.get_pixmap(matrix=mat, alpha=False)
                        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                        pix = None

                        # ── Ensure exact printer dimensions ──
                        # Usually matches already since render DPI = printer DPI.
                        # If slightly off (unprintable margins), NEAREST keeps
                        # edges pixel-sharp (no interpolation blur).
                        if img.size != (printer_w, printer_h):
                            img = img.resize((printer_w, printer_h), Image.NEAREST)

                        # ── Final B/W enforcement ──
                        # With AA disabled, pixels are already near-binary.
                        # A high threshold (200) cleans any residual grey
                        # without fattening characters.
                        img = img.convert('L')
                        img = img.point(lambda x: 0 if x < 200 else 255)
                        img = img.convert('RGB')

                        hDC.StartPage()

                        # ── Send at 1:1 — no GDI scaling ──
                        dib = ImageWin.Dib(img)
                        dib.draw(hDC.GetHandleOutput(), (0, 0, printer_w, printer_h))

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

            # Restore MuPDF anti-aliasing to default for other code paths
            try:
                fitz.TOOLS.set_aa_level(8)
            except Exception:
                pass

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

    # ── Tier 0: Direct GDI Rendering (native font quality) ────────

    def print_direct(self, template, row_data_list: list,
                     printer_name: str, copies: int = 1,
                     label_config=None) -> bool:
        """Render label elements directly to the printer via GDI.

        This bypasses the PDF→bitmap pipeline entirely:
          • TEXT: Native GDI CreateFont + DrawText (printer driver hinting)
          • BARCODE: High-DPI bitmap blit
          • SHAPES: GDI Rectangle/Ellipse/LineTo
          • IMAGES: Direct bitmap blit

        Returns True on success, False if GDI is unavailable.
        """
        try:
            import win32ui   # type: ignore
            import win32con  # type: ignore
            import win32gui  # type: ignore
            import win32print  # type: ignore
        except ImportError:
            return False

        if not template or not row_data_list:
            return False

        label_w_mm = template.label.width_mm if label_config is None else label_config.width_mm
        label_h_mm = template.label.height_mm if label_config is None else label_config.height_mm

        # ── Create printer DC with correct paper dimensions ──
        # Must use win32gui.CreateDC("WINSPOOL", ..., devmode) to apply
        # custom paper size. Plain CreatePrinterDC ignores DEVMODE.
        hDC = win32ui.CreateDC()

        if label_config or template.label:
            hprinter = None
            try:
                import win32gui
                hprinter = win32print.OpenPrinter(printer_name)
                printer_info = win32print.GetPrinter(hprinter, 2)
                devmode = printer_info.get('pDevMode')

                if devmode:
                    # Set custom paper dimensions in tenths of mm
                    devmode.PaperSize = 256  # DMPAPER_USER
                    devmode.PaperWidth = int(label_w_mm * 10)
                    devmode.PaperLength = int(label_h_mm * 10)
                    devmode.Orientation = 1  # DMORIENT_PORTRAIT
                    devmode.Fields |= (
                        win32con.DM_PAPERSIZE |
                        win32con.DM_PAPERLENGTH |
                        win32con.DM_PAPERWIDTH |
                        win32con.DM_ORIENTATION
                    )

                    # Also try to set the custom form if available
                    try:
                        form_name = self._register_custom_form(None, printer_name, label_w_mm, label_h_mm)
                        if form_name:
                            devmode.FormName = form_name
                            devmode.Fields |= 0x10000  # DM_FORMNAME
                    except Exception:
                        pass

                    # Create DC with the configured DEVMODE
                    hdc_handle = win32gui.CreateDC("WINSPOOL", printer_name, devmode)
                    hDC = win32ui.CreateDCFromHandle(hdc_handle)
                    logger.info(f"DirectGDI: Applied custom page size {label_w_mm}x{label_h_mm}mm via DEVMODE")
                else:
                    hDC.CreatePrinterDC(printer_name)
            except Exception as e:
                logger.warning(f"DirectGDI: DEVMODE setup failed ({e}), using driver defaults")
                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC(printer_name)
            finally:
                if hprinter:
                    win32print.ClosePrinter(hprinter)
        else:
            hDC.CreatePrinterDC(printer_name)

        try:
            dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
            dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY)
            printer_w = hDC.GetDeviceCaps(win32con.HORZRES)
            printer_h = hDC.GetDeviceCaps(win32con.VERTRES)

            logger.info(
                f"DirectGDI: {len(row_data_list)} labels, {copies} copies "
                f"→ '{printer_name}' ({dpi_x}×{dpi_y} DPI, "
                f"{printer_w}×{printer_h} dots, "
                f"page={label_w_mm}×{label_h_mm}mm)"
            )

            sorted_elements = sorted(template.elements, key=lambda e: e.z_index)

            for copy_num in range(copies):
                hDC.StartDoc("OMG Labels")

                for row_idx, row_data in enumerate(row_data_list):
                    hDC.StartPage()

                    drawn = 0
                    for elem in sorted_elements:
                        if getattr(elem, 'hidden', False) or getattr(elem, 'do_not_print', False):
                            continue

                        value = row_data.get(elem.id, elem.value)

                        try:
                            if elem.type == "text":
                                self._gdi_draw_text(hDC, elem, value, dpi_x, dpi_y)
                                drawn += 1
                            elif elem.type in ("barcode", "qrcode"):
                                self._gdi_draw_barcode(hDC, elem, value, dpi_x, dpi_y)
                                drawn += 1
                            elif elem.type == "rect":
                                self._gdi_draw_rect(hDC, elem, dpi_x, dpi_y)
                                drawn += 1
                            elif elem.type == "line":
                                self._gdi_draw_line(hDC, elem, dpi_x, dpi_y)
                                drawn += 1
                            elif elem.type == "circle":
                                self._gdi_draw_circle(hDC, elem, dpi_x, dpi_y)
                                drawn += 1
                            elif elem.type == "image":
                                self._gdi_draw_image(hDC, elem, dpi_x, dpi_y)
                                drawn += 1
                        except Exception as draw_err:
                            logger.error(f"DirectGDI element {elem.id} ({elem.type}) failed: {draw_err}", exc_info=True)

                    if row_idx == 0:
                        logger.info(f"DirectGDI: first label drew {drawn} elements, {len(sorted_elements)} total")
                        if drawn == 0 and len(sorted_elements) > 0:
                            # Nothing rendered — abort and fall back to PDF path
                            logger.warning("DirectGDI: 0 elements drawn on first label, aborting → PDF fallback")
                            hDC.EndPage()
                            hDC.EndDoc()
                            return False

                    hDC.EndPage()

                hDC.EndDoc()

            logger.info(f"DirectGDI: printed {len(row_data_list)} labels to '{printer_name}'")
            return True

        finally:
            hDC.DeleteDC()

    def _mm_to_dev(self, mm_val, dpi):
        """Convert millimeters to device units (pixels at printer DPI)."""
        return int(round(mm_val / 25.4 * dpi))

    def _gdi_draw_text(self, hDC, elem, value, dpi_x, dpi_y):
        """Draw a text element using native GDI font rendering."""
        import win32ui, win32con

        text = str(value) if value else ""
        if not text:
            return

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        w = self._mm_to_dev(elem.width_mm, dpi_x)
        h = self._mm_to_dev(elem.height_mm, dpi_y)

        # Font size: elem.font_size is in typographic points
        # GDI expects negative height for character height (not cell height)
        font_height = -int(round(elem.font_size * dpi_y / 72.0))

        # Determine weight and italic
        is_bold = getattr(elem, 'font_bold', False) or getattr(elem, 'bold', False)
        if not is_bold:
            fw = getattr(elem, 'font_weight', 'normal')
            try:
                is_bold = int(fw) >= 600
            except (ValueError, TypeError):
                is_bold = str(fw).lower() == 'bold'
        is_italic = getattr(elem, 'font_italic', False) or getattr(elem, 'italic', False)

        weight = 700 if is_bold else 400
        font_name = elem.font_name or "Arial"

        rot = getattr(elem, 'rotation', 0.0)

        # Create GDI font — do NOT use escapement/orientation for rotation;
        # DrawText ignores them. We use SetWorldTransform instead.
        font = win32ui.CreateFont({
            "name": font_name,
            "height": font_height,
            "weight": weight,
            "italic": 1 if is_italic else 0,
            "underline": 1 if getattr(elem, 'underline', False) else 0,
            "strike out": 1 if getattr(elem, 'strikeout', False) else 0,
        })
        old_font = hDC.SelectObject(font)

        # Set text color
        color_hex = getattr(elem, 'color', '#000000') or '#000000'
        try:
            r = int(color_hex[1:3], 16)
            g = int(color_hex[3:5], 16)
            b = int(color_hex[5:7], 16)
            hDC.SetTextColor(r | (g << 8) | (b << 16))
        except Exception:
            hDC.SetTextColor(0)  # Black fallback

        # Transparent background for text
        hDC.SetBkMode(win32con.TRANSPARENT)

        # Build DrawText flags
        flags = win32con.DT_WORDBREAK | win32con.DT_NOPREFIX

        align = getattr(elem, 'align', 'left')
        if align == 'center':
            flags |= win32con.DT_CENTER
        elif align == 'right':
            flags |= win32con.DT_RIGHT
        else:
            flags |= win32con.DT_LEFT

        # Apply rotation via world transform if needed
        # Konva rotates CW around the element's top-left corner.
        # GDI's SetWorldTransform uses a 2×2 matrix + translation.
        old_mode = None
        if rot != 0.0:
            try:
                import ctypes
                import math

                # Enable advanced graphics mode (required for SetWorldTransform)
                gdi32 = ctypes.windll.gdi32
                hdc_handle = hDC.GetHandleOutput()
                GM_ADVANCED = 2
                old_mode = gdi32.SetGraphicsMode(hdc_handle, GM_ADVANCED)

                # Rotation matrix: Konva CW = GDI CW (standard rotation matrix)
                # Pivot = top-left corner of the element (x, y)
                angle_rad = math.radians(rot)
                cos_a = math.cos(angle_rad)
                sin_a = math.sin(angle_rad)

                # XFORM struct: eM11, eM12, eM21, eM22, eDx, eDy
                # Rotate CW around (x, y):
                #   Translate origin to (x,y), rotate, translate back
                #   Combined: dx = x - x*cos + y*sin, dy = y - x*sin - y*cos
                class XFORM(ctypes.Structure):
                    _fields_ = [
                        ("eM11", ctypes.c_float),
                        ("eM12", ctypes.c_float),
                        ("eM21", ctypes.c_float),
                        ("eM22", ctypes.c_float),
                        ("eDx", ctypes.c_float),
                        ("eDy", ctypes.c_float),
                    ]

                xform = XFORM()
                xform.eM11 = cos_a
                xform.eM12 = sin_a
                xform.eM21 = -sin_a
                xform.eM22 = cos_a
                xform.eDx = x - x * cos_a + y * sin_a
                xform.eDy = y - x * sin_a - y * cos_a

                gdi32.SetWorldTransform(hdc_handle, ctypes.byref(xform))
            except Exception as rot_err:
                logger.warning(f"DirectGDI: rotation transform failed: {rot_err}")
                old_mode = None

        # Base rectangle (always use unrotated coords; transform handles rotation)
        rect = (x, y, x + w, y + h)

        # Vertical alignment: measure text height, then adjust y
        va = getattr(elem, 'vertical_align', 'middle')
        if va in ('middle', 'bottom'):
            try:
                result = hDC.DrawText(text, (x, y, x + w, y + 10000), flags | win32con.DT_CALCRECT)
                if isinstance(result, tuple) and len(result) == 2:
                    text_h = result[0]
                elif isinstance(result, int):
                    text_h = result
                else:
                    text_h = abs(font_height)

                if text_h > h * 10:
                    text_h = abs(font_height)

                if va == 'middle':
                    y_offset = max(0, (h - text_h) // 2)
                else:
                    y_offset = max(0, h - text_h)

                rect = (x, y + y_offset, x + w, y + y_offset + max(h, text_h))
            except Exception:
                pass

        # Draw text
        hDC.DrawText(text, rect, flags)

        # Restore world transform
        if old_mode is not None:
            try:
                import ctypes

                class XFORM(ctypes.Structure):
                    _fields_ = [
                        ("eM11", ctypes.c_float),
                        ("eM12", ctypes.c_float),
                        ("eM21", ctypes.c_float),
                        ("eM22", ctypes.c_float),
                        ("eDx", ctypes.c_float),
                        ("eDy", ctypes.c_float),
                    ]

                gdi32 = ctypes.windll.gdi32
                hdc_handle = hDC.GetHandleOutput()
                identity = XFORM(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
                gdi32.SetWorldTransform(hdc_handle, ctypes.byref(identity))
                gdi32.SetGraphicsMode(hdc_handle, old_mode)
            except Exception:
                pass

        # Cleanup
        hDC.SelectObject(old_font)
        font.DeleteObject()

    def _gdi_draw_barcode(self, hDC, elem, value, dpi_x, dpi_y):
        """Draw a barcode by rendering to a PIL image and blitting to GDI."""
        import win32ui, win32con
        from PIL import Image, ImageWin

        barcode_str = str(value).strip() if value and str(value).strip() else ""
        if not barcode_str:
            return

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        w = self._mm_to_dev(elem.width_mm, dpi_x)
        h = self._mm_to_dev(elem.height_mm, dpi_y)

        sym = elem.symbology or ("qrcode" if elem.type == 'qrcode' else "code128")
        show_text = getattr(elem, 'show_text', True) and elem.type == 'barcode'
        text_fs_mm = getattr(elem, 'text_font_size_mm', 2.5)

        if show_text:
            text_h_mm = text_fs_mm + 0.5
            bar_h_mm = max(elem.height_mm * 0.1, elem.height_mm - text_h_mm)
        else:
            bar_h_mm = elem.height_mm

        bar_dev_h = self._mm_to_dev(bar_h_mm, dpi_y)
        text_on_top = getattr(elem, 'text_on_top', False)
        bar_y = y + (self._mm_to_dev(elem.height_mm - bar_h_mm, dpi_y) if text_on_top and show_text else 0)

        # ── Render barcode image ──
        barcode_img = None
        try:
            if sym == 'qrcode':
                import qrcode
                qr = qrcode.QRCode(box_size=10, border=0)
                qr.add_data(barcode_str)
                qr.make(fit=True)
                barcode_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
            else:
                # Use python-barcode's ImageWriter for direct PIL output
                import barcode as barcode_lib
                from barcode.writer import ImageWriter
                barcode_map = {
                    "code128": "code128", "code39": "code39",
                    "ean13": "ean13", "ean8": "ean8", "itf14": "itf",
                    "gs1_128": "code128",
                }
                bc_name = barcode_map.get(sym.lower(), sym.lower())
                writer = ImageWriter()
                code_obj = barcode_lib.get_barcode_class(bc_name)(barcode_str, writer=writer)
                barcode_img = code_obj.render({
                    'module_height': bar_h_mm,
                    'write_text': False,
                    'quiet_zone': 0,
                    'text_distance': 0,
                    'dpi': max(dpi_x, 300),
                })
                if barcode_img:
                    barcode_img = barcode_img.convert('RGB')
        except Exception as bc_err:
            logger.warning(f"DirectGDI: barcode render ({sym}) failed: {bc_err}")
            # Fallback: try the ReportLab path
            try:
                from omg.core.barcode_engine import BarcodeRenderer
                from reportlab.graphics import renderPM
                drawing = BarcodeRenderer.render_reportlab_drawing(
                    sym, barcode_str, elem.width_mm, bar_h_mm, show_text=False
                )
                if drawing:
                    barcode_img = renderPM.drawToPIL(drawing, dpi=max(dpi_x, 300))
                    if barcode_img:
                        barcode_img = barcode_img.convert('RGB')
            except Exception as fb_err:
                logger.warning(f"DirectGDI: barcode fallback also failed: {fb_err}")

        # Blit barcode image to printer DC
        if barcode_img:
            # Convert to 1-bit for crisp bars
            barcode_img = barcode_img.convert('L').point(lambda px: 0 if px < 128 else 255).convert('RGB')
            dib = ImageWin.Dib(barcode_img)
            dib.draw(hDC.GetHandleOutput(), (x, bar_y, x + w, bar_y + bar_dev_h))

        # ── Draw human-readable text below/above barcode ──
        if show_text and barcode_str:
            text_y = y if text_on_top else y + self._mm_to_dev(bar_h_mm, dpi_y)
            text_dev_h = h - self._mm_to_dev(bar_h_mm, dpi_y)
            if text_dev_h <= 0:
                return

            font_name = getattr(elem, 'text_font_name', 'Arial') or 'Arial'
            # Convert mm font size to device units
            font_height = -self._mm_to_dev(text_fs_mm, dpi_y)
            is_bold = getattr(elem, 'text_font_bold', False)

            try:
                font = win32ui.CreateFont({
                    "name": font_name,
                    "height": font_height,
                    "weight": 700 if is_bold else 400,
                })
                old_font = hDC.SelectObject(font)
                hDC.SetTextColor(0)  # Black
                hDC.SetBkMode(win32con.TRANSPARENT)

                anchor = getattr(elem, 'text_anchor', 'center')
                flags = win32con.DT_SINGLELINE | win32con.DT_VCENTER | win32con.DT_NOPREFIX
                if anchor == 'left':
                    flags |= win32con.DT_LEFT
                elif anchor == 'right':
                    flags |= win32con.DT_RIGHT
                else:
                    flags |= win32con.DT_CENTER

                rect = (x, text_y, x + w, text_y + text_dev_h)
                hDC.DrawText(barcode_str, rect, flags)

                hDC.SelectObject(old_font)
                font.DeleteObject()
            except Exception as txt_err:
                logger.warning(f"DirectGDI: barcode text failed: {txt_err}")

    def _gdi_draw_rect(self, hDC, elem, dpi_x, dpi_y):
        """Draw a rectangle using GDI primitives."""
        import win32ui, win32con, win32gui

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        w = self._mm_to_dev(elem.width_mm, dpi_x)
        h = self._mm_to_dev(elem.height_mm, dpi_y)

        border_w = max(1, self._mm_to_dev(getattr(elem, 'border_width', 1.0), dpi_x))

        # Border pen
        border_hex = getattr(elem, 'border_color', '#000000') or '#000000'
        br, bg, bb = int(border_hex[1:3], 16), int(border_hex[3:5], 16), int(border_hex[5:7], 16)

        pen = win32ui.CreatePen(win32con.PS_SOLID, border_w, br | (bg << 8) | (bb << 16))
        old_pen = hDC.SelectObject(pen)

        # Fill brush
        filled = getattr(elem, 'filled', False)
        if filled:
            fill_hex = getattr(elem, 'fill_color', '#FFFFFF') or '#FFFFFF'
            fr, fg, fb = int(fill_hex[1:3], 16), int(fill_hex[3:5], 16), int(fill_hex[5:7], 16)
            brush = win32ui.CreateBrush(win32con.BS_SOLID, fr | (fg << 8) | (fb << 16), 0)
        else:
            brush = win32ui.CreateBrush(win32con.BS_NULL, 0, 0)
        old_brush = hDC.SelectObject(brush)

        hDC.Rectangle((x, y, x + w, y + h))

        hDC.SelectObject(old_pen)
        hDC.SelectObject(old_brush)
        pen.DeleteObject()
        brush.DeleteObject()

    def _gdi_draw_line(self, hDC, elem, dpi_x, dpi_y):
        """Draw a line using GDI."""
        import win32ui, win32con

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        x2 = x + self._mm_to_dev(elem.width_mm, dpi_x)
        y2 = y + self._mm_to_dev(elem.height_mm, dpi_y)

        border_w = max(1, self._mm_to_dev(getattr(elem, 'border_width', 1.0), dpi_x))
        color_hex = getattr(elem, 'border_color', '#000000') or '#000000'
        r, g, b = int(color_hex[1:3], 16), int(color_hex[3:5], 16), int(color_hex[5:7], 16)

        pen = win32ui.CreatePen(win32con.PS_SOLID, border_w, r | (g << 8) | (b << 16))
        old_pen = hDC.SelectObject(pen)

        hDC.MoveTo((x, y))
        hDC.LineTo((x2, y2))

        hDC.SelectObject(old_pen)
        pen.DeleteObject()

    def _gdi_draw_circle(self, hDC, elem, dpi_x, dpi_y):
        """Draw an ellipse using GDI."""
        import win32ui, win32con

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        w = self._mm_to_dev(elem.width_mm, dpi_x)
        h = self._mm_to_dev(elem.height_mm, dpi_y)

        border_w = max(1, self._mm_to_dev(getattr(elem, 'border_width', 1.0), dpi_x))
        border_hex = getattr(elem, 'border_color', '#000000') or '#000000'
        br, bg, bb = int(border_hex[1:3], 16), int(border_hex[3:5], 16), int(border_hex[5:7], 16)

        pen = win32ui.CreatePen(win32con.PS_SOLID, border_w, br | (bg << 8) | (bb << 16))
        old_pen = hDC.SelectObject(pen)

        filled = getattr(elem, 'filled', False)
        if filled:
            fill_hex = getattr(elem, 'fill_color', '#FFFFFF') or '#FFFFFF'
            fr, fg, fb = int(fill_hex[1:3], 16), int(fill_hex[3:5], 16), int(fill_hex[5:7], 16)
            brush = win32ui.CreateBrush(win32con.BS_SOLID, fr | (fg << 8) | (fb << 16), 0)
        else:
            brush = win32ui.CreateBrush(win32con.BS_NULL, 0, 0)
        old_brush = hDC.SelectObject(brush)

        hDC.Ellipse((x, y, x + w, y + h))

        hDC.SelectObject(old_pen)
        hDC.SelectObject(old_brush)
        pen.DeleteObject()
        brush.DeleteObject()

    def _gdi_draw_image(self, hDC, elem, dpi_x, dpi_y):
        """Draw an image element by loading and blitting to GDI."""
        from PIL import Image, ImageWin
        import base64
        import io

        x = self._mm_to_dev(elem.x_mm, dpi_x)
        y = self._mm_to_dev(elem.y_mm, dpi_y)
        w = self._mm_to_dev(elem.width_mm, dpi_x)
        h = self._mm_to_dev(elem.height_mm, dpi_y)

        img = None

        # Try base64 data first
        b64 = getattr(elem, 'image_b64', None)
        if b64:
            try:
                # Strip data URI prefix if present
                if ',' in b64:
                    b64 = b64.split(',', 1)[1]
                raw = base64.b64decode(b64)
                img = Image.open(io.BytesIO(raw))
            except Exception as e:
                logger.debug(f"DirectGDI: image base64 decode failed: {e}")

        # Fallback to file path
        if img is None:
            path = getattr(elem, 'image_path', None)
            if path:
                try:
                    img = Image.open(path)
                except Exception as e:
                    logger.debug(f"DirectGDI: image file load failed: {e}")

        if img is None:
            return

        # Convert and resize
        img = img.convert('RGB')
        if img.size != (w, h) and w > 0 and h > 0:
            img = img.resize((w, h), Image.LANCZOS)

        # Monochrome conversion for thermal
        if getattr(elem, 'monochrome', False):
            img = img.convert('L').point(lambda px: 0 if px < 128 else 255).convert('RGB')

        dib = ImageWin.Dib(img)
        dib.draw(hDC.GetHandleOutput(), (x, y, x + w, y + h))
