# FILE: omg/core/formula_engine.py
# Formula Evaluation Engine — SEC 02 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# High-performance formula parser based on Lark (Earley).
# Supports Excel-like logic: upper(), lower(), date_fmt(), etc.
# Scoped specifically for single-row context.
# ═══════════════════════════════════════════════════════════════════

import os
import dateutil.parser
from lark import Lark, Transformer, Token, Tree
from lark.exceptions import LarkError
from loguru import logger
from typing import Dict, Any, List, Optional

# ── Custom Exceptions ────────────────────────────────────────────────

class FormulaParseError(Exception):
    """Raised when a formula string has invalid syntax."""
    pass

class FormulaEvalError(Exception):
    """Raised when a formula fails during runtime evaluation."""
    pass

# ── Built-in Functions ───────────────────────────────────────────────

def _fn_upper(s: str) -> str: return s.upper()
def _fn_lower(s: str) -> str: return s.lower()
def _fn_trim(s: str) -> str: return s.strip()

def _fn_pad_left(s: str, length: Any, char: Any = "0") -> str:
    return s.rjust(int(length), str(char))

def _fn_pad_right(s: str, length: Any, char: Any = "0") -> str:
    return s.ljust(int(length), str(char))

def _fn_slice(s: str, start: Any, end: Any = None) -> str:
    s_idx = int(start)
    e_idx = int(end) if end is not None else None
    return s[s_idx:e_idx]

def _fn_replace(s: str, old: str, new: str) -> str:
    return s.replace(old, new)

def _fn_date_fmt(s: str, fmt: str) -> str:
    try:
        dt = dateutil.parser.parse(s)
        return dt.strftime(fmt)
    except Exception:
        return s

def _fn_if_empty(v1: Any, v2: Any) -> Any:
    return v2 if not v1 or str(v1).strip() == "" else v1

FUNC_MAP = {
    "upper": _fn_upper,
    "lower": _fn_lower,
    "trim": _fn_trim,
    "pad_left": _fn_pad_left,
    "pad_right": _fn_pad_right,
    "slice": _fn_slice,
    "replace": _fn_replace,
    "date_fmt": _fn_date_fmt,
    "if_empty": _fn_if_empty,
}

# ── Formula Engine ───────────────────────────────────────────────────

class FormulaEngine:
    """Entry point for parsing and evaluating template formulas."""

    def __init__(self, grammar_text: Optional[str] = None):
        if not grammar_text:
            grammar_text = self._default_grammar()
        
        try:
            self._parser = Lark(grammar_text, parser="earley", ambiguity="resolve")
        except LarkError as e:
            logger.error(f"Failed to initialize formula parser: {e}")
            raise

    @staticmethod
    def _default_grammar() -> str:
        return """
start : expr
expr : func_call | concat | ref | string | number
concat : expr "+" expr
func_call : FNAME "(" arglist ")"
arglist : expr ("," expr)*
ref : "{" CNAME "}"
string : ESCAPED_STRING
number : NUMBER
FNAME : "upper" | "lower" | "trim" | "pad_left" | "pad_right"
      | "slice" | "replace" | "date_fmt" | "if_empty"

%import common.CNAME
%import common.ESCAPED_STRING
%import common.NUMBER
%import common.WS
%ignore WS
"""

    def evaluate(self, formula_str: str, row_dict: Dict[str, str]) -> str:
        """Evaluate a formula with the given data context."""
        if not formula_str or formula_str.strip() == "":
            return ""

        try:
            tree = self._parser.parse(formula_str)
        except LarkError as e:
            raise FormulaParseError(
                f"Invalid formula syntax: '{formula_str}' — {e}"
            ) from e

        try:
            evaluator = FormulaEvaluator(row_dict)
            result = evaluator.transform(tree)
            return str(result)
        except Exception as e:
            if isinstance(e, FormulaEvalError):
                raise
            raise FormulaEvalError(
                f"Formula evaluation failed for '{formula_str}': {e}"
            ) from e

class FormulaEvaluator(Transformer):
    """Lark transformer for evaluating formula trees."""

    def __init__(self, row_dict: Dict[str, str]):
        super().__init__()
        self.row_dict = row_dict

    def start(self, items):
        return items[0]

    def expr(self, items):
        return items[0]

    def concat(self, items):
        return str(items[0]) + str(items[1])

    def func_call(self, items):
        fname = str(items[0])
        args = items[1]
        func = FUNC_MAP.get(fname)
        if not func:
            raise FormulaEvalError(f"Unknown function: {fname}")
        return func(*args)

    def arglist(self, items):
        return items

    def ref(self, items):
        col_name = str(items[0])
        return self.row_dict.get(col_name, "")

    def string(self, items):
        return str(items[0]).strip('"').strip("'")

    def number(self, items):
        try:
            val = str(items[0])
            if "." in val:
                return float(val)
            return int(val)
        except ValueError:
            return 0
