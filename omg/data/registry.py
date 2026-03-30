# FILE: omg/data/registry.py
# Adapter Registry — SEC 05 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from pathlib import Path
from typing import Optional

from loguru import logger

from omg.data.adapter import AbstractAdapter
from omg.data.csv_adapter import CSVAdapter
from omg.data.excel_adapter import ExcelAdapter
from omg.data.json_adapter import JSONAdapter
from omg.data.sql_adapter import SQLAdapter


class AdapterRegistry:
    """Factory that selects the correct adapter from file extension or URI scheme."""

    # File extension to adapter class mapping
    _FILE_MAP = {
        ".csv": CSVAdapter,
        ".tsv": CSVAdapter,
        ".txt": CSVAdapter,
        ".xlsx": ExcelAdapter,
        ".xls": ExcelAdapter,
        ".json": JSONAdapter,
        ".db": SQLAdapter,
        ".sqlite": SQLAdapter,
        ".sqlite3": SQLAdapter,
    }

    @classmethod
    def create_from_file(cls, file_path: str,
                         sheet_name: Optional[str] = None,
                         delimiter: Optional[str] = None) -> AbstractAdapter:
        """Create an adapter for a file based on its extension."""
        ext = Path(file_path).suffix.lower()

        if ext not in cls._FILE_MAP:
            raise ValueError(
                f"Unsupported file type: '{ext}'. "
                f"Supported: {', '.join(cls._FILE_MAP.keys())}"
            )

        adapter_class = cls._FILE_MAP[ext]

        if adapter_class == CSVAdapter:
            adapter = CSVAdapter(file_path, delimiter=delimiter)
        elif adapter_class == ExcelAdapter:
            adapter = ExcelAdapter(file_path, sheet_name=sheet_name)
        elif adapter_class == JSONAdapter:
            adapter = JSONAdapter(file_path)
        elif adapter_class == SQLAdapter:
            # For SQLite files, we automatically build the connection string
            conn_str = f"sqlite:///{file_path}"
            # Default to selecting all from the first table or a common 'data' table?
            # For "opening" a DB as a source, we'll try to guess the table or use the first one.
            # However, SQLAdapter expects a query. Let's provide a basic one.
            adapter = SQLAdapter(conn_str, "SELECT * FROM data") 
            # Note: Phase 5 will add a table selector UI.
        else:
            raise ValueError(f"No adapter configured for extension: {ext}")

        logger.info(f"Adapter created: {adapter_class.__name__} for {file_path}")
        return adapter

    @classmethod
    def create_from_sql(cls, connection_string: str, query: str) -> SQLAdapter:
        """Create an SQL adapter from a connection string and query."""
        adapter = SQLAdapter(connection_string, query)
        logger.info(f"SQL adapter created for connection: {connection_string[:30]}...")
        return adapter

    @classmethod
    def get_supported_extensions(cls) -> list[str]:
        """Return list of supported file extensions."""
        return list(cls._FILE_MAP.keys())
