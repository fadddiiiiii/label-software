# FILE: omg/print/job_logger.py
# Print Job Logger — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Provides structured logging for print jobs, writing both to the
# application log file and optionally to a CSV audit export.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from loguru import logger


class PrintJobLogger:
    """Structured logger for print job events."""

    def __init__(self, log_dir: Optional[Path] = None):
        self.log_dir = log_dir
        if log_dir:
            log_dir.mkdir(parents=True, exist_ok=True)

    def log_job_start(self, job_id: str, printer_name: str,
                      total_rows: int, template_name: str = "") -> None:
        """Log the start of a print job."""
        logger.info(
            f"PRINT JOB START | job={job_id} | printer={printer_name} | "
            f"rows={total_rows} | template={template_name}"
        )

    def log_row_success(self, job_id: str, row_index: int, duration_ms: int) -> None:
        """Log a successfully printed row."""
        logger.debug(
            f"PRINT ROW OK | job={job_id} | row={row_index} | {duration_ms}ms"
        )

    def log_row_error(self, job_id: str, row_index: int,
                      error_msg: str, duration_ms: int = 0) -> None:
        """Log a failed row."""
        logger.warning(
            f"PRINT ROW ERROR | job={job_id} | row={row_index} | "
            f"{duration_ms}ms | {error_msg}"
        )

    def log_job_complete(self, job_id: str, completed: int, errors: int,
                         elapsed_ms: int, status: str) -> None:
        """Log the completion of a print job."""
        logger.info(
            f"PRINT JOB DONE | job={job_id} | status={status} | "
            f"completed={completed} | errors={errors} | {elapsed_ms}ms"
        )

    def export_audit_csv(self, job_id: str, rows: list[dict]) -> Optional[Path]:
        """Export a print job's row-level audit log to CSV.

        Args:
            job_id: The print job ID
            rows: List of dicts with keys: row_index, status, error_message, duration_ms

        Returns:
            Path to the exported CSV file, or None if no log_dir
        """
        if not self.log_dir:
            return None

        now = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        csv_path = self.log_dir / f"print_audit_{job_id[:8]}_{now}.csv"

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["row_index", "status", "error_message", "duration_ms"])
            writer.writeheader()
            writer.writerows(rows)

        logger.info(f"Audit CSV exported: {csv_path}")
        return csv_path
