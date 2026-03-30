# FILE: omg/data/adapter.py
# Abstract Data Source Adapter — SEC 05 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Generator, List, Optional


class ColumnType(str, Enum):
    STRING = "STRING"
    INTEGER = "INTEGER"
    FLOAT = "FLOAT"
    DATE = "DATE"


@dataclass
class ColumnMeta:
    """Metadata about a data column."""
    name: str
    inferred_type: ColumnType = ColumnType.STRING
    sample_values: list[str] | None = None


class AbstractAdapter(ABC):
    """Interface that all data source adapters must implement."""

    @abstractmethod
    def get_columns(self) -> List[ColumnMeta]:
        """Returns list of columns with metadata."""
        ...

    @abstractmethod
    def row_count(self) -> int:
        """Returns total number of data rows (excluding header)."""
        ...

    @abstractmethod
    def get_row(self, idx: int) -> Dict[str, Any]:
        """Returns dict {column_name: value} for the specified row index (0-based)."""
        ...

    @abstractmethod
    def iter_rows(self, start: int = 0, end: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        """Generator yielding each row as a dict; used by batch engine."""
        ...

    @abstractmethod
    def close(self) -> None:
        """Closes any open file handles or DB connections."""
        ...

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


class DummyRowAdapter(AbstractAdapter):
    """Fallback adapter for printing a single label when NO data source is connected."""

    def get_columns(self) -> List[ColumnMeta]:
        return []

    def row_count(self) -> int:
        return 1

    def get_row(self, idx: int) -> Dict[str, Any]:
        return {}

    def iter_rows(self, start: int = 0, end: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        yield {}

    def close(self) -> None:
        pass
