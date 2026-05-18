# FILE: omg/print/batch_engine.py
# Batch Print Engine — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Orchestrates multi-row print jobs. Iterates over data source rows,
# resolves bindings, renders PDFs via RowRenderer, dispatches via
# platform-specific dispatchers, and reports progress.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import os
import time
import traceback
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from loguru import logger

from omg.core.template_engine import TemplateDocument
from omg.core.field_binder import BindingResolver, FieldBinding
from omg.data.adapter import AbstractAdapter
from omg.print.row_renderer import RowRenderer
from omg.print.zpl_renderer import ZplRenderer
from omg.print.tspl_renderer import TsplRenderer
from omg.db.db_manager import DbManager


# ── Job Status ───────────────────────────────────────────────────────

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    DONE = "done"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class RowResult:
    """Result of rendering/printing a single row."""
    row_index: int
    success: bool
    error_msg: Optional[str] = None
    duration_ms: int = 0


@dataclass
class BatchProgress:
    """Live progress state for a batch print job."""
    total_rows: int = 0
    completed_rows: int = 0
    error_rows: int = 0
    skipped_rows: int = 0
    current_row: int = 0
    status: JobStatus = JobStatus.PENDING
    errors: List[RowResult] = field(default_factory=list)
    elapsed_ms: int = 0
    output_path: Optional[str] = None  # Returned file path for Electron PDF printing
    print_mode: str = "pdf"

    @property
    def percent(self) -> float:
        if self.total_rows == 0:
            return 0.0
        return (self.completed_rows + self.error_rows + self.skipped_rows) / self.total_rows * 100

    @property
    def success_rate(self) -> float:
        done = self.completed_rows + self.error_rows
        if done == 0:
            return 100.0
        return self.completed_rows / done * 100


# ── Batch Controller ─────────────────────────────────────────────────

class BatchController:
    """Orchestrates a multi-row print job.

    Usage:
        controller = BatchController(template, resolver, bindings, adapter, renderer)
        controller.on_progress = my_progress_callback
        controller.run(printer_name="Zebra ZD420", copies=1)
    """

    def __init__(
        self,
        template: TemplateDocument,
        resolver: BindingResolver,
        bindings: List[FieldBinding],
        adapter: AbstractAdapter,
        renderer: Optional[RowRenderer] = None,
        db: Optional[DbManager] = None,
    ):
        self.template = template
        self.resolver = resolver
        self.bindings = bindings
        self.adapter = adapter
        self.renderer = renderer or RowRenderer(template)
        self.db = db

        self.progress = BatchProgress()
        self.on_progress: Optional[Callable[[BatchProgress], None]] = None
        self._cancel_requested = False
        self._pause_requested = False

    def cancel(self) -> None:
        """Request cancellation of the current job."""
        self._cancel_requested = True
        logger.info("Batch job cancellation requested")

    def pause(self) -> None:
        """Request pause of the current job."""
        self._pause_requested = True

    def resume(self) -> None:
        """Resume a paused job."""
        self._pause_requested = False

    def run(
        self,
        printer_name: str = "PDF",
        copies: int = 1,
        copies_per_label: int = 1,
        start_row: int = 0,
        end_row: Optional[int] = None,
        output_path: Optional[str] = None,
        print_mode: str = "pdf",  # 'pdf' or 'zpl'
    ) -> BatchProgress:
        """Execute the batch print job.

        Args:
            printer_name: Target printer name or "PDF" for file output
            copies: Number of copies of the entire print job
            copies_per_label: GAP-03 — repeat each label N times
            start_row: First row index (inclusive)
            end_row: Last row index (exclusive), None = all rows
            output_path: If printer_name == "PDF" or print_mode == "pdf", save file here
            print_mode: Rendering pipeline ("pdf" for Electron graphics, "zpl" for native RAW)

        Returns:
            Final BatchProgress with results
        """
        total = self.adapter.row_count()
        # If no DB is attached, the dummy adapter will say 1 row. We shouldn't limit it if the user wants multiple pages!
        from omg.data.adapter import DummyRowAdapter
        if isinstance(self.adapter, DummyRowAdapter) and end_row is not None:
            total = end_row

        actual_end = min(end_row or total, total)
        actual_start = max(start_row, 0)
        row_range = actual_end - actual_start

        # GAP-01: Sheet layout from template
        layout = self.template.sheet_layout
        labels_per_sheet = layout.labels_per_sheet
        use_sheet_mode = labels_per_sheet > 1

        # Total labels = rows × copies_per_label
        total_labels = row_range * copies_per_label

        self.progress = BatchProgress(
            total_rows=row_range,
            status=JobStatus.RUNNING,
            print_mode=print_mode,
        )
        self._cancel_requested = False
        self._pause_requested = False
        
        # Init native renderer if needed (auto-detect TSPL vs ZPL)
        native_renderer = None
        if print_mode == "zpl":
            pname = printer_name.upper()
            if any(kw in pname for kw in ["TOSHIBA", "TSC", "B-FV", "B-EV", "B-SA", "B-EX"]):
                native_renderer = TsplRenderer(self.template)
                logger.info(f"Auto-detected TSPL2 for printer '{printer_name}'")
            else:
                native_renderer = ZplRenderer(self.template)
                logger.info(f"Using ZPL for printer '{printer_name}'")

        # Log to DB
        job_id = None
        if self.db:
            job_id = self.db.log_print_job(None, printer_name, row_range)

        start_time = time.monotonic()
        all_pdf_pages: list[bytes] = []
        all_zpl_chunks: list[bytes] = []
        sheet_buffer: list[Dict[str, str]] = []  # GAP-01: collect for sheet

        logger.info(
            f"Batch job started: rows {actual_start}-{actual_end}, "
            f"printer={printer_name}, copies_per_label={copies_per_label}, "
            f"sheet={layout.cols}x{layout.rows}"
        )

        for idx in range(actual_start, actual_end):
            # Check for cancellation
            if self._cancel_requested:
                self.progress.status = JobStatus.CANCELLED
                logger.info(f"Batch job cancelled at row {idx}")
                break

            # Check for pause
            while self._pause_requested:
                self.progress.status = JobStatus.PAUSED
                time.sleep(0.1)

            if self.progress.status == JobStatus.PAUSED:
                self.progress.status = JobStatus.RUNNING

            self.progress.current_row = idx
            row_start = time.monotonic()

            try:
                # Resolve bindings for this row
                row_data = self.resolver.resolve_row(self.bindings, idx)

                # HYBRID & THERMAL OPTIMIZATION:
                # If we are printing to a physical printer (PDF mode) and only 1 row is requested,
                # we should skip the Tiled Sheet layout (A4/Letter) and use Label Mode.
                # This prevents a thermal label printer from feeding a full A4 sheet length.
                single_label_override = (row_range == 1) and (copies_per_label == 1) and (printer_name != "PDF")
                effective_sheet_mode = use_sheet_mode and not single_label_override

                # GAP-03: Repeat for copies_per_label
                for _copy in range(copies_per_label):
                    if print_mode == "zpl":
                        if effective_sheet_mode:
                            sheet_buffer.append(row_data)
                            is_last = (idx == actual_end - 1 and _copy == copies_per_label - 1)
                            if len(sheet_buffer) >= labels_per_sheet or is_last:
                                native_bytes = native_renderer.render_sheet(sheet_buffer, layout)
                                all_zpl_chunks.append(native_bytes)
                                sheet_buffer = []
                        else:
                            native_bytes = native_renderer.render(row_data)
                            all_zpl_chunks.append(native_bytes)
                    else:
                        if effective_sheet_mode:
                            # GAP-01: Collect into sheet buffer
                            sheet_buffer.append(row_data)

                            # Flush when sheet is full or last label
                            is_last = (idx == actual_end - 1 and _copy == copies_per_label - 1)
                            if len(sheet_buffer) >= labels_per_sheet or is_last:
                                page_bytes = self.renderer.render_sheet(sheet_buffer, layout)
                                all_pdf_pages.append(page_bytes)
                                sheet_buffer = []
                        else:
                            # Original 1-label-per-page mode (Match Label Size)
                            pdf_bytes = self.renderer.render(row_data)
                            all_pdf_pages.append(pdf_bytes)

                duration_ms = int((time.monotonic() - row_start) * 1000)
                self.progress.completed_rows += 1

                if self.db and job_id:
                    self.db.log_print_row(job_id, idx, "ok", duration_ms=duration_ms)

            except Exception as e:
                duration_ms = int((time.monotonic() - row_start) * 1000)
                err = RowResult(
                    row_index=idx,
                    success=False,
                    error_msg=f"{e}\n{traceback.format_exc()}",
                    duration_ms=duration_ms,
                )
                self.progress.error_rows += 1
                self.progress.errors.append(err)
                logger.error(f"Row {idx} failed: {e}")

                if self.db and job_id:
                    self.db.log_print_row(job_id, idx, "error",
                                          error_msg=str(e), duration_ms=duration_ms)

            self.progress.elapsed_ms = int((time.monotonic() - start_time) * 1000)

            # Notify progress
            if self.on_progress:
                try:
                    self.on_progress(self.progress)
                except Exception as e:
                    logger.error(f"Progress callback error: {e}")

        # Finalize
        if self.progress.status not in (JobStatus.CANCELLED,):
            if self.progress.error_rows > 0 and self.progress.completed_rows > 0:
                self.progress.status = JobStatus.PARTIAL
            elif self.progress.error_rows > 0:
                self.progress.status = JobStatus.FAILED
            else:
                self.progress.status = JobStatus.DONE

        # Merge PDFs
        if all_pdf_pages:
            logger.info(f"Merging {len(all_pdf_pages)} PDF pages...")
            merged = self._merge_pdfs(all_pdf_pages)

            if output_path is None:
                import tempfile
                fd, output_path = tempfile.mkstemp(suffix=".pdf")
                os.close(fd)

            from pathlib import Path
            Path(output_path).write_bytes(merged)
            self.progress.output_path = output_path
            logger.info(f"PDF results saved to: {output_path} ({len(merged)} bytes)")
            
            # DIRECT OS PRINT DISPATCH:
            # Try direct GDI rendering first (native font quality),
            # then fall back to PDF→bitmap pipeline.
            if printer_name != "PDF" and print_mode == "pdf":
                try:
                    from omg.platform_utils import get_print_dispatcher
                    from copy import deepcopy
                    
                    # Ensure OS form logic receives the FULL sheet dimensions
                    dispatch_label_config = deepcopy(self.template.label)
                    single_label_override = (row_range == 1) and (copies_per_label == 1) and (printer_name != "PDF")
                    effective_sheet_mode = use_sheet_mode and not single_label_override
                    if effective_sheet_mode:
                        dispatch_label_config.width_mm = layout.page_width_mm
                        dispatch_label_config.height_mm = layout.page_height_mm
                        
                    dispatcher = get_print_dispatcher()

                    # ── Tier 0: Direct GDI (native font quality) ──
                    # Collect all row data for direct rendering.
                    # This bypasses PDF→bitmap entirely for text.
                    direct_success = False
                    if not effective_sheet_mode:
                        try:
                            all_row_data = []
                            for idx in range(actual_start, actual_end):
                                rd = self.resolver.resolve_row(self.bindings, idx)
                                for _c in range(copies_per_label):
                                    all_row_data.append(rd)
                            direct_success = dispatcher.print_direct(
                                self.template, all_row_data, printer_name,
                                copies=1,  # copies already expanded in all_row_data
                                label_config=dispatch_label_config
                            )
                            if direct_success:
                                logger.info(f"DirectGDI dispatched {len(all_row_data)} labels to '{printer_name}'")
                        except Exception as gdi_err:
                            logger.debug(f"DirectGDI not available, falling back to PDF: {gdi_err}")

                    # ── Fallback: PDF→bitmap pipeline ──
                    if not direct_success:
                        dispatcher.print_pdf(merged, printer_name, copies=copies_per_label, label_config=dispatch_label_config)
                        logger.info(f"PDF dispatched to OS spooler for '{printer_name}' ({len(merged)} bytes)")

                except Exception as e:
                    logger.error(f"OS Print dispatch failed: {e}")
                    self.progress.status = JobStatus.FAILED
                    self.progress.errors.append(RowResult(
                        row_index=-1, success=False,
                        error_msg=f"Print dispatch failed: {e}"
                    ))
                    self.progress.error_rows += 1

        elif all_zpl_chunks and print_mode == "zpl" and printer_name != "PDF":
            merged_zpl = b"".join(all_zpl_chunks)
            try:
                from omg.platform_utils import get_print_dispatcher
                dispatcher = get_print_dispatcher()
                dispatcher.print_raw(merged_zpl, printer_name)
                logger.info(f"ZPL RAW dispatched to {printer_name} ({len(merged_zpl)} bytes)")
            except Exception as e:
                logger.error(f"ZPL Dispatch error: {e}")
                self.progress.status = JobStatus.FAILED
                self.progress.errors.append(RowResult(row_index=-1, success=False, error_msg=f"Raw dispatcher failed: {e}"))
                self.progress.error_rows += 1

        # Complete DB log
        if self.db and job_id:
            self.db.complete_print_job(job_id, self.progress.status.value)

        self.progress.elapsed_ms = int((time.monotonic() - start_time) * 1000)

        logger.info(
            f"Batch job complete: {self.progress.completed_rows}/{self.progress.total_rows} "
            f"({self.progress.elapsed_ms}ms, {self.progress.error_rows} errors)"
        )

        return self.progress

    def _merge_pdfs(self, pdf_pages: list[bytes]) -> bytes:
        """Merge multiple single-page PDFs into one document."""
        from pypdf import PdfReader, PdfWriter
        import io

        writer = PdfWriter()
        for page_bytes in pdf_pages:
            reader = PdfReader(io.BytesIO(page_bytes))
            for page in reader.pages:
                writer.add_page(page)

        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()

    def _dispatch_to_printer(self, pdf_bytes: bytes, printer_name: str) -> None:
        """Send merged PDF to the OS print system."""
        try:
            from omg.platform_utils import get_print_dispatcher
            dispatcher = get_print_dispatcher()
            dispatcher.print_pdf(pdf_bytes, printer_name, label_config=self.template.label)
            logger.info(f"PDF dispatched to printer: {printer_name}")
        except Exception as e:
            logger.error(f"Print dispatch failed: {e}")
            raise
