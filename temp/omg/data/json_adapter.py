# FILE: omg/data/json_adapter.py
import json
from typing import Any, Dict, Generator, List, Optional
from omg.data.adapter import AbstractAdapter, ColumnMeta, ColumnType

class JSONAdapter(AbstractAdapter):
    """Reads .json files (array of objects)."""

    def __init__(self, path: str):
        self.path = path
        self._data: Optional[List[Dict[str, Any]]] = None
        self._columns: Optional[List[ColumnMeta]] = None

    def _open(self) -> None:
        if self._data is not None:
            return
        with open(self.path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
            # Handle list of dicts or { "data": [...] }
            self._data = raw if isinstance(raw, list) else raw.get("data", raw.get("records", []))
            
        if not self._data or not isinstance(self._data, list):
            self._data = []
            
    def get_columns(self) -> List[ColumnMeta]:
        self._open()
        if self._columns is not None:
            return self._columns
        
        if not self._data:
            return []
            
        # Infer columns from first row
        first = self._data[0]
        self._columns = [
            ColumnMeta(name=k, inferred_type=self._infer_type(v))
            for k, v in first.items()
        ]
        return self._columns

    def _infer_type(self, val: Any) -> ColumnType:
        if isinstance(val, int): return ColumnType.INTEGER
        if isinstance(val, float): return ColumnType.FLOAT
        return ColumnType.STRING

    def row_count(self) -> int:
        self._open()
        return len(self._data)

    def get_row(self, idx: int) -> Dict[str, Any]:
        self._open()
        if idx < 0 or idx >= len(self._data):
            raise IndexError("Row index out of range")
        return {str(k): v for k, v in self._data[idx].items()}

    def iter_rows(self, start: int = 0, end: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        self._open()
        actual_end = end if end is not None else len(self._data)
        for i in range(start, actual_end):
            yield self.get_row(i)

    def close(self) -> None:
        self._data = None
