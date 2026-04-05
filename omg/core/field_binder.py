# FILE: omg/core/field_binder.py
# Field Binding Module — SEC 06 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Connects label template fields to data source columns. A binding
# maps a CanvasElement field_id to a data source column with an
# optional formula expression.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from loguru import logger
import sys
import traceback
from datetime import datetime
import platform

from omg.core.formula_engine import FormulaEngine
from omg.data.adapter import AbstractAdapter


# ── Data Classes ─────────────────────────────────────────────────────

@dataclass
class FieldBinding:
    """A named association between a canvas field and a data column."""
    field_id: str
    source_id: str
    column_name: str
    formula: Optional[str] = None
    join_key: Optional[str] = None
    join_column: Optional[str] = None


@dataclass
class BindingValidationResult:
    """Result of validating all bindings against current data sources."""
    valid: List[FieldBinding] = field(default_factory=list)
    broken: List[tuple[FieldBinding, str]] = field(default_factory=list)  # (binding, reason)

    @property
    def is_valid(self) -> bool:
        return len(self.broken) == 0


# ── Cross-platform strftime helper ───────────────────────────────────

def _safe_strftime(fmt: str) -> str:
    """Format current datetime with cross-platform support.
    
    On Windows, %-m (Unix no-pad) is invalid — we must use %#m instead.
    This function normalises the format string for the current OS.
    """
    now = datetime.now()
    if platform.system() == "Windows":
        # Convert Unix-style %-X to Windows-style %#X
        import re
        fmt = re.sub(r'%-([dmHIMSjU])', r'%#\1', fmt)
    try:
        return now.strftime(fmt)
    except ValueError:
        # Last resort: manual token replacement for common patterns
        result = fmt
        result = result.replace('%Y', str(now.year))
        result = result.replace('%y', f'{now.year % 100:02d}')
        result = result.replace('%m', f'{now.month:02d}')
        result = result.replace('%-m', str(now.month))
        result = result.replace('%#m', str(now.month))
        result = result.replace('%d', f'{now.day:02d}')
        result = result.replace('%-d', str(now.day))
        result = result.replace('%#d', str(now.day))
        result = result.replace('%H', f'{now.hour:02d}')
        result = result.replace('%I', f'{(now.hour % 12) or 12:02d}')
        result = result.replace('%-I', str((now.hour % 12) or 12))
        result = result.replace('%#I', str((now.hour % 12) or 12))
        result = result.replace('%M', f'{now.minute:02d}')
        result = result.replace('%S', f'{now.second:02d}')
        result = result.replace('%p', 'PM' if now.hour >= 12 else 'AM')
        result = result.replace('%B', now.strftime('%B'))
        result = result.replace('%b', now.strftime('%b'))
        result = result.replace('%A', now.strftime('%A'))
        return result


# ── Binding Resolver ─────────────────────────────────────────────────

class BindingResolver:
    """Resolves bindings for a given row, returning field values."""

    def __init__(self, formula_engine: Optional[FormulaEngine] = None):
        self.adapters: Dict[str, AbstractAdapter] = {}
        self.formula_engine = formula_engine or FormulaEngine()
        self._primary_source_id: Optional[str] = None
        self._keyboard_values: Dict[str, str] = {}  # GAP-02

    def attach_adapter(self, source_id: str, adapter: AbstractAdapter,
                       is_primary: bool = False) -> None:
        """Register a data source adapter."""
        self.adapters[source_id] = adapter
        if is_primary or self._primary_source_id is None:
            self._primary_source_id = source_id

    def detach_adapter(self, source_id: str) -> None:
        """Remove a registered adapter."""
        self.adapters.pop(source_id, None)
        if self._primary_source_id == source_id:
            self._primary_source_id = next(iter(self.adapters), None)

    def set_keyboard_values(self, values: Dict[str, str]) -> None:
        """GAP-02: Set keyboard-entered values (collected before batch)."""
        self._keyboard_values = values

    def resolve_row(self, bindings: List[FieldBinding],
                    primary_idx: int) -> Dict[str, str]:
        """Resolve all bindings for a given primary row index.

        Returns: {field_id: resolved_value}
        """
        from omg.core.template_engine import (
            KeyboardBinding, SerialBinding, DateBinding, TimeBinding
        )

        result: Dict[str, str] = {}

        for binding in bindings:
            # GAP-02: Handle extended binding types
            if isinstance(binding, KeyboardBinding):
                result[binding.field_id] = self._keyboard_values.get(
                    binding.field_id, binding.default_value)
                continue

            if isinstance(binding, SerialBinding):
                n = binding.start_value + (primary_idx * binding.increment)
                val = str(n)
                if binding.pad_to_length > 0:
                    val = val.zfill(binding.pad_to_length)
                result[binding.field_id] = binding.prefix + val + binding.suffix
                continue

            if isinstance(binding, DateBinding):
                try:
                    result[binding.field_id] = _safe_strftime(
                        binding.format_str)
                except Exception:
                    logger.warning(f"Invalid date format_str '{binding.format_str}', using ISO fallback")
                    result[binding.field_id] = datetime.now().strftime("%Y-%m-%d")
                continue

            if isinstance(binding, TimeBinding):
                try:
                    result[binding.field_id] = _safe_strftime(
                        binding.format_str)
                except Exception:
                    logger.warning(f"Invalid time format_str '{binding.format_str}', using ISO fallback")
                    result[binding.field_id] = datetime.now().strftime("%H:%M:%S")
                continue

            # Standard database binding
            adapter = self.adapters.get(binding.source_id)
            if adapter is None:
                sys.stderr.write(f"DEBUG: Binding '{binding.field_id}' FAILED: source '{binding.source_id}' not found in attached adapters: {list(self.adapters.keys())}\n")
                sys.stderr.flush()
                # Do NOT set result[binding.field_id] = ""
                # This allow the renderer to fall back to elem.value
                continue

            try:
                row_idx = self._resolve_row_index(binding, primary_idx)
                row_dict = adapter.get_row(row_idx)
                raw_value = row_dict.get(binding.column_name, "")
                sys.stderr.write(f"DEBUG: resolve_row field={binding.field_id} row={row_idx} val='{raw_value}'\n")
                sys.stderr.flush()

                if binding.formula:
                    # Inject the column value as {value} placeholder
                    formula = binding.formula.replace("{value}", str(raw_value))
                    resolved = self.formula_engine.evaluate(formula, row_dict)
                else:
                    resolved = str(raw_value)

                result[binding.field_id] = resolved

            except Exception as e:
                logger.error(f"Binding resolution failed for '{binding.field_id}': {e}\n{traceback.format_exc()}")
                result[binding.field_id] = ""

        return result

    def _resolve_row_index(self, binding: FieldBinding, primary_idx: int) -> int:
        """Resolve the actual row index for a binding.
        For secondary sources with a join key, look up the matching row.
        """
        if binding.join_key and binding.join_column and self._primary_source_id:
            # Multi-source join: find matching row in secondary source
            primary_adapter = self.adapters.get(self._primary_source_id)
            if primary_adapter is None:
                return primary_idx

            primary_row = primary_adapter.get_row(primary_idx)
            join_value = primary_row.get(binding.join_key, "")

            return self._lookup_by_value(
                binding.source_id, binding.join_column, join_value
            )

        return primary_idx

    def _lookup_by_value(self, source_id: str, column: str, value: str) -> int:
        """Find the row index where column == value in the given source."""
        adapter = self.adapters.get(source_id)
        if adapter is None:
            raise ValueError(f"Source '{source_id}' not attached")

        for i, row in enumerate(adapter.iter_rows()):
            if str(row.get(column, "")) == str(value):
                return i

        raise ValueError(
            f"Join lookup failed: no row with {column}='{value}' in source '{source_id}'"
        )


# ── Binding Validator ────────────────────────────────────────────────

class BindingValidator:
    """Validates all bindings against current attached data sources."""

    def __init__(self, resolver: BindingResolver):
        self.resolver = resolver

    def validate(self, bindings: List[FieldBinding]) -> BindingValidationResult:
        """Check all bindings; flag broken ones."""
        result = BindingValidationResult()

        for binding in bindings:
            adapter = self.resolver.adapters.get(binding.source_id)

            if adapter is None:
                result.broken.append((binding, f"Source '{binding.source_id}' not attached"))
                continue

            # Check that the column exists
            try:
                columns = adapter.get_columns()
                col_names = {c.name for c in columns}
                if binding.column_name not in col_names:
                    result.broken.append((
                        binding,
                        f"Column '{binding.column_name}' not found in source '{binding.source_id}'"
                    ))
                    continue
            except Exception as e:
                result.broken.append((binding, f"Cannot read columns: {e}"))
                continue

            # Check formula syntax
            if binding.formula:
                if not self.resolver.formula_engine.validate(binding.formula):
                    result.broken.append((
                        binding,
                        f"Invalid formula syntax: '{binding.formula}'"
                    ))
                    continue

            result.valid.append(binding)

        return result
