# FILE: omg/data/csv_adapter.py
# CSV Data Source Adapter — SEC 05 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

try:
    import chardet as _chardet
    def _detect_charset(raw: bytes) -> str:
        result = _chardet.detect(raw)
        return result.get("encoding") or "utf-8"
except ImportError:
    def _detect_charset(raw: bytes) -> str:  # type: ignore[misc]
        # Simple BOM-based fallback when chardet is unavailable
        if raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
            return 'utf-16'
        if raw.startswith(b'\xef\xbb\xbf'):
            return 'utf-8-sig'
        return 'utf-8'

from loguru import logger

from omg.data.adapter import AbstractAdapter, ColumnMeta, ColumnType


class CSVAdapter(AbstractAdapter):
    """Reads CSV files with auto-detected delimiter and encoding.

    Uses a byte-offset index for O(1) random row access.
    """

    def __init__(self, path: str, delimiter: Optional[str] = None,
                 encoding: Optional[str] = None):
        self.path = path
        self._delimiter = delimiter
        self._encoding = encoding
        self._header: Optional[List[str]] = None
        self._row_offsets: Optional[List[int]] = None
        self._row_count: int = 0
        self._columns: Optional[List[ColumnMeta]] = None

    def _detect_encoding(self) -> str:
        """Auto-detect file encoding using chardet (or BOM fallback)."""
        if self._encoding:
            return self._encoding
        with open(self.path, "rb") as f:
            raw = f.read(8192)
        detected = _detect_charset(raw)
        logger.debug(f"CSV encoding detected: {detected}")
        return detected

    def _parse_header(self) -> None:
        """Parse the CSV header and build a byte-offset index."""
        if self._header is not None:
            return

        encoding = self._detect_encoding()
        self._encoding = encoding

        with open(self.path, "rb") as f:
            # Detect dialect (delimiter, quoting)
            sample = f.read(8192)
            f.seek(0)

            try:
                dialect = csv.Sniffer().sniff(sample.decode(encoding, errors="replace"))
                if self._delimiter:
                    dialect.delimiter = self._delimiter
            except csv.Error:
                # Fallback to comma-delimited
                dialect = csv.excel
                if self._delimiter:
                    dialect.delimiter = self._delimiter

            self._dialect = dialect

            # Read header
            text_wrapper = io.TextIOWrapper(f, encoding=encoding, errors="replace")
            reader = csv.reader(text_wrapper, dialect=dialect)
            try:
                header_row = next(reader)
            except StopIteration:
                raise ValueError("CSV file is empty")

            # Deduplicate and clean headers
            seen = {}
            self._header = []
            for i, c in enumerate(header_row):
                name = str(c).strip() if c else f"Column_{i}"
                if name in seen:
                    seen[name] += 1
                    name = f"{name}_{seen[name]}"
                else:
                    seen[name] = 0
                self._header.append(name)

            # Build byte-offset index for random access
            # We must sync the binary file pointer to the start of the data rows.
            # Since TextIOWrapper and csv.reader buffer, we can't trust f.tell() here.
            # Instead, we'll seek back to 0, re-read the first line (header) manually.
            f.seek(0)
            f.readline() # Skip header line
            
            self._row_offsets = []
            while True:
                offset = f.tell()
                line = f.readline()
                if not line:
                    break
                # Only index if line contains data (not just whitespace or delimiters)
                clean_line = line.strip()
                if clean_line:
                    # Check if it's just a row of separators (e.g. ,,,,)
                    # We'll be more aggressive: if after decoding and csv-parsing it has no content
                    try:
                        decoded = clean_line.decode(encoding, errors="replace")
                        # Simple check: does it have any alphanumeric chars?
                        if any(c.isalnum() for c in decoded):
                            self._row_offsets.append(offset)
                    except:
                        # Fallback to including it if unsure
                        self._row_offsets.append(offset)

            self._row_count = len(self._row_offsets)

        logger.info(f"CSV parsed: {self.path} — {len(self._header)} columns, {self._row_count} rows")

    def _infer_column_types(self, sample_rows: int = 20) -> None:
        """Infer column types from the first N rows."""
        if self._columns is not None:
            return

        self._parse_header()
        assert self._header is not None

        # Collect sample values per column
        samples: dict[str, list[str]] = {col: [] for col in self._header}
        limit = min(sample_rows, self._row_count)

        for i in range(limit):
            row = self.get_row(i)
            for col in self._header:
                val = row.get(col, "")
                if val:
                    samples[col].append(val)

        self._columns = []
        for col in self._header:
            col_type = self._infer_type(samples[col])
            self._columns.append(ColumnMeta(
                name=col,
                inferred_type=col_type,
                sample_values=samples[col][:5],
            ))

    @staticmethod
    def _infer_type(values: list[str]) -> ColumnType:
        """Infer column type from sample values."""
        if not values:
            return ColumnType.STRING

        int_count = 0
        float_count = 0
        for v in values:
            v = v.strip()
            try:
                int(v)
                int_count += 1
                continue
            except ValueError:
                pass
            try:
                float(v)
                float_count += 1
                continue
            except ValueError:
                pass

        total = len(values)
        if int_count == total:
            return ColumnType.INTEGER
        if (int_count + float_count) == total and float_count > 0:
            return ColumnType.FLOAT
        return ColumnType.STRING

    # ── AbstractAdapter Interface ──

    def get_columns(self) -> List[ColumnMeta]:
        self._infer_column_types()
        assert self._columns is not None
        return self._columns

    def row_count(self) -> int:
        self._parse_header()
        return self._row_count

    def get_row(self, idx: int) -> Dict[str, Any]:
        self._parse_header()
        assert self._header is not None
        assert self._row_offsets is not None

        if idx < 0 or idx >= self._row_count:
            raise IndexError(f"Row index {idx} out of range (0-{self._row_count - 1})")

        offset = self._row_offsets[idx]
        encoding = self._encoding or "utf-8"
        
        with open(self.path, "rb") as f:
            f.seek(offset)
            line = f.readline().decode(encoding, errors="replace")
            # Parse the single line as CSV
            reader = csv.reader(io.StringIO(line), dialect=self._dialect)
            values = next(reader)
            # Ensure values match header length
            if len(values) < len(self._header):
                values.extend([""] * (len(self._header) - len(values)))
            return dict(zip(self._header, values[:len(self._header)]))

    def iter_rows(self, start: int = 0, end: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        self._parse_header()
        assert self._header is not None

        actual_end = end if end is not None else self._row_count
        encoding = self._encoding or "utf-8"

        with open(self.path, "r", encoding=encoding, errors="replace") as f:
            reader = csv.reader(f, dialect=self._dialect)
            next(reader)  # Skip header
            for i, values in enumerate(reader):
                if i < start:
                    continue
                if i >= actual_end:
                    break
                # Skip entirely empty rows
                if not any(v.strip() for v in values if v is not None):
                    continue
                yield dict(zip(self._header, values))

    def close(self) -> None:
        # No persistent handles to close for CSV
        pass
