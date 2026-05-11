# FILE: omg/print/macos_dispatcher.py
# macOS Print Dispatcher — ADD-04 of macOS Platform Addendum
# ═══════════════════════════════════════════════════════════════════
# Uses pycups and optionally AppKit NSPrintOperation for native dialog.
# Only imported on macOS.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import List

from loguru import logger

from omg.print.dispatcher import AbstractPrintDispatcher


class CUPSPrintDispatcher(AbstractPrintDispatcher):
    """macOS / Linux print dispatcher using CUPS."""

    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False, label_config=None) -> bool:
        """Print a PDF via CUPS lp command or pycups API."""
        # Save PDF to temp file
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()

        try:
            # Method 1: Use pycups API (preferred)
            try:
                import cups
                conn = cups.Connection()
                options = {
                    "copies": str(copies),
                    "fit-to-page": "false",    # Prevent CUPS from scaling
                    "noFitOutput": "true",      # Some drivers respect this
                }
                if duplex:
                    options["sides"] = "two-sided-long-edge"
                if label_config:
                    options["media"] = f"Custom.{label_config.width_mm}x{label_config.height_mm}mm"

                job_id = conn.printFile(printer_name, tmp.name, "OMG Print", options)
                logger.info(f"CUPS job submitted: {job_id} to {printer_name}")
                return True
            except ImportError:
                logger.warning("pycups not available, falling back to lp command")

            # Method 2: Fallback to lp command
            cmd = ["lp", "-d", printer_name, "-n", str(copies),
                   "-o", "fit-to-page=false",  # Prevent scaling
                   "-o", "noFitOutput"]
            if duplex:
                cmd.extend(["-o", "sides=two-sided-long-edge"])
            if label_config:
                cmd.extend(["-o", f"media=Custom.{label_config.width_mm}x{label_config.height_mm}mm"])
            cmd.append(tmp.name)

            logger.debug(f"Executing CUPS print command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode != 0:
                raise RuntimeError(f"lp command failed: {result.stderr}")

            logger.info(f"CUPS lp dispatched to {printer_name}")
            return True

        finally:
            Path(tmp.name).unlink(missing_ok=True)

    def list_printers(self) -> List[str]:
        """List available printers via CUPS."""
        try:
            import cups
            conn = cups.Connection()
            return list(conn.getPrinters().keys())
        except ImportError:
            # Fallback: parse lpstat output
            result = subprocess.run(
                ["lpstat", "-p"], capture_output=True, text=True
            )
            printers = []
            for line in result.stdout.strip().split("\n"):
                if line.startswith("printer "):
                    parts = line.split()
                    if len(parts) >= 2:
                        printers.append(parts[1])
            return printers

    def get_default_printer(self) -> str:
        """Get the macOS/CUPS default printer."""
        try:
            import cups
            conn = cups.Connection()
            default = conn.getDefault()
            return default or ""
        except ImportError:
            result = subprocess.run(
                ["lpstat", "-d"], capture_output=True, text=True
            )
            # Output: "system default destination: PrinterName"
            line = result.stdout.strip()
            if ":" in line:
                return line.split(":", 1)[1].strip()
            return ""

    def print_raw(self, raw_bytes: bytes, printer_name: str) -> bool:
        """Send raw ZPL/TSPL bytes directly to CUPS."""
        tmp = tempfile.NamedTemporaryFile(suffix=".zpl", delete=False)
        tmp.write(raw_bytes)
        tmp.close()
        
        try:
            cmd = ["lp", "-d", printer_name, "-o", "raw", tmp.name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                logger.error(f"Raw CUPS print failed: {result.stderr}")
                return False
            logger.info(f"Raw print dispatched to {printer_name} via CUPS")
            return True
        finally:
            Path(tmp.name).unlink(missing_ok=True)

    def show_native_print_dialog(self, pdf_bytes: bytes) -> bool:
        """Show macOS native print dialog via AppKit.

        This opens the system print dialog and lets the user select
        printer, copies, and page range via the native macOS UI.
        """
        try:
            import AppKit
            import Quartz

            tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            tmp.write(pdf_bytes)
            tmp.close()

            url = AppKit.NSURL.fileURLWithPath_(tmp.name)
            pdf_doc = Quartz.PDFDocument.alloc().initWithURL_(url)

            if pdf_doc is None:
                logger.error("Failed to create PDFDocument from bytes")
                return False

            # Create print operation
            print_info = AppKit.NSPrintInfo.sharedPrintInfo()
            print_info.setJobDisposition_(AppKit.NSPrintSpoolJob)

            op = pdf_doc.printOperationForPrintInfo_scalingMode_autoRotate_(
                print_info,
                Quartz.kPDFPrintPageScaleNone,
                True,
            )

            if op:
                op.setShowsPrintPanel_(True)
                op.setShowsProgressPanel_(True)
                result = op.runOperation()
                Path(tmp.name).unlink(missing_ok=True)
                return result
            else:
                Path(tmp.name).unlink(missing_ok=True)
                return False

        except ImportError:
            logger.error("AppKit/Quartz not available for native print dialog")
            return False
        except Exception as e:
            logger.error(f"Native print dialog error: {e}")
            return False
