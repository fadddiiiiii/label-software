# FILE: omg/db/db_manager.py
# Database Manager — SEC 09 & SEC 11 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Uses sqlite3 from stdlib. WAL journal mode for concurrent reads.
# All IDs are UUID4 strings, timestamps are ISO-8601 UTC.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import os
from typing import Any, Dict, List, Optional

from loguru import logger


# ── Custom Exception ─────────────────────────────────────────────────

class DbError(Exception):
    """Raised on database operation failures."""
    pass


# ── Data Transfer Objects ────────────────────────────────────────────

@dataclass
class TemplateRow:
    id: str
    name: str
    file_path: str
    version: str = "1.0"
    thumbnail_b64: Optional[str] = None
    tags: str = "[]"
    created_at: str = ""
    updated_at: str = ""


@dataclass
class PrintJobRow:
    id: str
    template_id: Optional[str]
    printer_name: str
    row_count: int
    completed_count: int = 0
    error_count: int = 0
    status: str = "running"
    started_at: str = ""
    finished_at: Optional[str] = None


@dataclass
class PrinterProfile:
    id: str
    name: str
    driver_name: Optional[str] = None
    port: Optional[str] = None
    dpi: int = 300
    label_w_mm: float = 100.0
    label_h_mm: float = 70.0
    is_default: bool = False


# ── Database Manager ─────────────────────────────────────────────────

class DbManager:
    """Manages all SQLite operations for OMG."""

    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self._ensure_schema()

    @contextmanager
    def _connect(self):
        """Context manager for database connections with WAL mode."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            raise DbError(f"Database error: {e}") from e
        finally:
            conn.close()

    def _ensure_schema(self) -> None:
        """Create all tables if they don't exist."""
        from omg.platform_utils import resolve_path
        schema_path = Path(resolve_path(os.path.join("omg", "db", "schema.sql")))
        
        if schema_path.exists():
            ddl = schema_path.read_text(encoding="utf-8")
        else:
            ddl = self._inline_schema()

        with self._connect() as conn:
            conn.executescript(ddl)

        logger.info(f"Database schema initialized: {self.db_path}")

    # ── Templates ────────────────────────────────────────────────────

    def get_templates(self) -> List[TemplateRow]:
        """Get all templates ordered by last update."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM templates ORDER BY updated_at DESC"
            ).fetchall()
            return [TemplateRow(**dict(r)) for r in rows]

    def get_template(self, template_id: str) -> Optional[TemplateRow]:
        """Get a single template by ID."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM templates WHERE id = ?", (template_id,)
            ).fetchone()
            return TemplateRow(**dict(row)) if row else None

    def save_template(self, name: str, file_path: str,
                      version: str = "1.0",
                      thumbnail_b64: Optional[str] = None,
                      tags: str = "[]",
                      template_id: Optional[str] = None) -> str:
        """Save or update a template record. Returns the template ID."""
        now = datetime.now(timezone.utc).isoformat()
        tid = template_id or str(uuid.uuid4())

        with self._connect() as conn:
            conn.execute("""
                INSERT INTO templates (id, name, file_path, version, thumbnail_b64, tags, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    file_path = excluded.file_path,
                    version = excluded.version,
                    thumbnail_b64 = excluded.thumbnail_b64,
                    tags = excluded.tags,
                    updated_at = excluded.updated_at
            """, (tid, name, file_path, version, thumbnail_b64, tags, now, now))

        logger.info(f"Template saved: {name} ({tid})")
        return tid

    def delete_template(self, template_id: str) -> None:
        """Delete a template and cascade to bindings and data sources."""
        with self._connect() as conn:
            conn.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        logger.info(f"Template deleted: {template_id}")

    # ── Data Sources ─────────────────────────────────────────────────

    def get_data_sources(self, template_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM data_sources WHERE template_id = ?", (template_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def save_data_source(self, template_id: str, source_type: str,
                         file_path: Optional[str] = None,
                         connection_str: Optional[str] = None,
                         query: Optional[str] = None,
                         sheet_name: Optional[str] = None,
                         source_id: Optional[str] = None) -> str:
        """Save a data source record. Returns the source ID."""
        sid = source_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        with self._connect() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO data_sources
                (id, template_id, source_type, file_path, connection_str, query, sheet_name, last_parsed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (sid, template_id, source_type, file_path, connection_str, query, sheet_name, now))

        return sid

    # ── Print Jobs (Audit Log) ───────────────────────────────────────

    def log_print_job(self, template_id: Optional[str], printer_name: str,
                      row_count: int) -> str:
        """Start a new print job log entry. Returns the job ID."""
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        with self._connect() as conn:
            conn.execute("""
                INSERT INTO print_jobs (id, template_id, printer_name, row_count, status, started_at)
                VALUES (?, ?, ?, ?, 'running', ?)
            """, (job_id, template_id, printer_name, row_count, now))

        return job_id

    def log_print_row(self, job_id: str, row_index: int,
                      status: str = "ok", error_msg: Optional[str] = None,
                      duration_ms: Optional[int] = None) -> None:
        """Log a single row result within a print job."""
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO print_job_rows (job_id, row_index, status, error_message, duration_ms)
                VALUES (?, ?, ?, ?, ?)
            """, (job_id, row_index, status, error_msg, duration_ms))

    def complete_print_job(self, job_id: str, status: str = "done") -> None:
        """Mark a print job as completed."""
        now = datetime.now(timezone.utc).isoformat()

        with self._connect() as conn:
            # Count completed and error rows
            stats = conn.execute("""
                SELECT
                    SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
                FROM print_job_rows WHERE job_id = ?
            """, (job_id,)).fetchone()

            conn.execute("""
                UPDATE print_jobs
                SET status = ?, finished_at = ?, completed_count = ?, error_count = ?
                WHERE id = ?
            """, (status, now, stats["completed"] or 0, stats["errors"] or 0, job_id))

    def get_print_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent print job history."""
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT * FROM print_jobs ORDER BY started_at DESC LIMIT ?
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ── Printers ─────────────────────────────────────────────────────

    def get_printers(self) -> List[PrinterProfile]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM printers ORDER BY name").fetchall()
            return [PrinterProfile(**dict(r)) for r in rows]

    def save_printer(self, name: str, dpi: int = 300,
                     label_w_mm: float = 100.0, label_h_mm: float = 70.0,
                     driver_name: Optional[str] = None,
                     is_default: bool = False,
                     printer_id: Optional[str] = None) -> str:
        pid = printer_id or str(uuid.uuid4())

        with self._connect() as conn:
            # If setting as default, clear other defaults
            if is_default:
                conn.execute("UPDATE printers SET is_default = 0")

            conn.execute("""
                INSERT OR REPLACE INTO printers (id, name, driver_name, dpi, label_w_mm, label_h_mm, is_default)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (pid, name, driver_name, dpi, label_w_mm, label_h_mm, int(is_default)))

        return pid

    # ── Preferences ──────────────────────────────────────────────────

    def get_preference(self, key: str, default: str = "") -> str:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM preferences WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else default

    def set_preference(self, key: str, value: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO preferences (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """, (key, value, now))

    # ── Schema Fallback ──────────────────────────────────────────────

    @staticmethod
    def _inline_schema() -> str:
        """Inline DDL fallback if schema.sql is not found."""
        return """
        CREATE TABLE IF NOT EXISTS schema_version (version TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE, version TEXT NOT NULL DEFAULT '1.0', thumbnail_b64 TEXT, tags TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS data_sources (id TEXT PRIMARY KEY, template_id TEXT REFERENCES templates(id) ON DELETE CASCADE, source_type TEXT NOT NULL CHECK (source_type IN ('csv','excel','sql')), file_path TEXT, connection_str TEXT, query TEXT, sheet_name TEXT, col_meta_json TEXT, last_parsed_at TEXT);
        CREATE TABLE IF NOT EXISTS bindings (id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE, field_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES data_sources(id), column_name TEXT NOT NULL, formula TEXT, UNIQUE (template_id, field_id));
        CREATE TABLE IF NOT EXISTS print_jobs (id TEXT PRIMARY KEY, template_id TEXT REFERENCES templates(id), printer_name TEXT NOT NULL, row_count INTEGER NOT NULL, completed_count INTEGER NOT NULL DEFAULT 0, error_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK (status IN ('running','done','partial','failed')), started_at TEXT NOT NULL DEFAULT '', finished_at TEXT);
        CREATE TABLE IF NOT EXISTS print_job_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE, row_index INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('ok','error','skipped')), error_message TEXT, duration_ms INTEGER, printed_at TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS printers (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, driver_name TEXT, port TEXT, dpi INTEGER NOT NULL DEFAULT 300, label_w_mm REAL NOT NULL DEFAULT 100.0, label_h_mm REAL NOT NULL DEFAULT 70.0, is_default INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '');
        CREATE INDEX IF NOT EXISTS idx_pjr_job ON print_job_rows (job_id);
        CREATE INDEX IF NOT EXISTS idx_tmpl_name ON templates (name);
        CREATE INDEX IF NOT EXISTS idx_src_tmpl ON data_sources (template_id);
        """
