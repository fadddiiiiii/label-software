-- FILE: omg/db/schema.sql
-- OMG SQLite DDL — SEC 09 of Technical Specification
-- ═══════════════════════════════════════════════════════════
-- Applied by Alembic migration on first run.
-- All timestamps are ISO-8601 strings in UTC.
-- All IDs are UUID4 strings.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_version (
    version     TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    file_path       TEXT NOT NULL UNIQUE,
    version         TEXT NOT NULL DEFAULT '1.0',
    thumbnail_b64   TEXT,
    tags            TEXT DEFAULT '[]',
    created_at      TEXT NOT NULL DEFAULT '',
    updated_at      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS data_sources (
    id              TEXT PRIMARY KEY,
    template_id     TEXT REFERENCES templates(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL CHECK (source_type IN ('csv', 'excel', 'sql')),
    file_path       TEXT,
    connection_str  TEXT,
    query           TEXT,
    sheet_name      TEXT,
    col_meta_json   TEXT,
    last_parsed_at  TEXT
);

CREATE TABLE IF NOT EXISTS bindings (
    id              TEXT PRIMARY KEY,
    template_id     TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    field_id        TEXT NOT NULL,
    source_id       TEXT NOT NULL REFERENCES data_sources(id),
    column_name     TEXT NOT NULL,
    formula         TEXT,
    UNIQUE (template_id, field_id)
);

CREATE TABLE IF NOT EXISTS print_jobs (
    id              TEXT PRIMARY KEY,
    template_id     TEXT REFERENCES templates(id),
    printer_name    TEXT NOT NULL,
    row_count       INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL CHECK (status IN ('running', 'done', 'partial', 'failed')),
    started_at      TEXT NOT NULL DEFAULT '',
    finished_at     TEXT
);

CREATE TABLE IF NOT EXISTS print_job_rows (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
    row_index       INTEGER NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
    error_message   TEXT,
    duration_ms     INTEGER,
    printed_at      TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS printers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    driver_name     TEXT,
    port            TEXT,
    dpi             INTEGER NOT NULL DEFAULT 300,
    label_w_mm      REAL NOT NULL DEFAULT 100.0,
    label_h_mm      REAL NOT NULL DEFAULT 70.0,
    is_default      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS preferences (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT ''
);

-- ── INDICES ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pjr_job      ON print_job_rows (job_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_name    ON templates (name);
CREATE INDEX IF NOT EXISTS idx_src_tmpl     ON data_sources (template_id);
