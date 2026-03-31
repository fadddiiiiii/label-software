# FILE: omg/data/sql_adapter.py
# SQL Data Source Adapter — SEC 05 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Any, Dict, Generator, List, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from loguru import logger

from omg.data.adapter import AbstractAdapter, ColumnMeta, ColumnType

try:
    import sys
    import oracledb
    # SQLAlchemy looks for 'cx_Oracle' module; we map it to 'oracledb'
    sys.modules["cx_Oracle"] = oracledb
except ImportError:
    pass


class SQLAdapter(AbstractAdapter):
    """Reads data from SQL Server or Oracle via SQLAlchemy.

    Connection string examples:
        SQL Server: "mssql+pyodbc://user:pass@server:1433/dbname?driver=ODBC+Driver+17"
        Oracle:     "oracle+cx_oracle://user:pass@host:1521/?service_name=ORCLCDB"
        Oracle ARM: "oracle+oracledb://user:pass@host:1521/?service_name=ORCLCDB"
    """

    def __init__(self, connection_string: str, query: str):
        self.connection_string = connection_string
        self.query = query
        self._engine: Optional[Engine] = None
        self._cached_df: Optional[pd.DataFrame] = None
        self._columns: Optional[List[ColumnMeta]] = None

    def _execute(self) -> None:
        """Execute the query and cache results as a DataFrame."""
        if self._cached_df is not None:
            return

        if self._engine is None:
            self._engine = create_engine(
                self.connection_string,
                pool_pre_ping=True,
                pool_size=2,
            )

        with self._engine.connect() as conn:
            self._cached_df = pd.read_sql(text(self.query), conn)

        logger.info(
            f"SQL query executed: {len(self._cached_df)} rows, "
            f"{len(self._cached_df.columns)} columns"
        )

    def _build_columns(self) -> None:
        """Build column metadata from the cached DataFrame."""
        if self._columns is not None:
            return
        self._execute()
        assert self._cached_df is not None

        self._columns = []
        for col in self._cached_df.columns:
            dtype = self._cached_df[col].dtype
            if pd.api.types.is_integer_dtype(dtype):
                col_type = ColumnType.INTEGER
            elif pd.api.types.is_float_dtype(dtype):
                col_type = ColumnType.FLOAT
            elif pd.api.types.is_datetime64_dtype(dtype):
                col_type = ColumnType.DATE
            else:
                col_type = ColumnType.STRING

            samples = self._cached_df[col].head(5).astype(str).tolist()
            self._columns.append(ColumnMeta(
                name=str(col),
                inferred_type=col_type,
                sample_values=samples,
            ))

    # ── AbstractAdapter Interface ──

    def get_columns(self) -> List[ColumnMeta]:
        self._build_columns()
        assert self._columns is not None
        return self._columns

    def row_count(self) -> int:
        self._execute()
        assert self._cached_df is not None
        return len(self._cached_df)

    def get_row(self, idx: int) -> Dict[str, Any]:
        self._execute()
        assert self._cached_df is not None
        if idx < 0 or idx >= len(self._cached_df):
            raise IndexError(f"Row index {idx} out of range")
        return {str(k): str(v) for k, v in self._cached_df.iloc[idx].to_dict().items()}

    def iter_rows(self, start: int = 0, end: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        self._execute()
        assert self._cached_df is not None
        actual_end = end if end is not None else len(self._cached_df)
        for idx in range(start, min(actual_end, len(self._cached_df))):
            yield {str(k): str(v) for k, v in self._cached_df.iloc[idx].to_dict().items()}

    def close(self) -> None:
        if self._engine is not None:
            self._engine.dispose()
            self._engine = None
        self._cached_df = None
