# FILE: tests/unit/test_formula_engine.py
# Unit tests for the Formula Engine — SEC 12

import pytest

from omg.core.formula_engine import FormulaEngine, FormulaParseError, FormulaEvalError


@pytest.fixture
def engine():
    return FormulaEngine()


@pytest.fixture
def row():
    return {
        "PartNumber": "abc123",
        "Description": "Widget A",
        "Price": "12.50",
        "Quantity": "100",
        "Date": "2026-03-15",
        "Empty": "",
        "Padded": "42",
    }


class TestFormulaEngine:

    def test_column_ref(self, engine, row):
        assert engine.evaluate("{PartNumber}", row) == "abc123"

    def test_upper(self, engine, row):
        assert engine.evaluate('upper({PartNumber})', row) == "ABC123"

    def test_lower(self, engine, row):
        assert engine.evaluate('lower({Description})', row) == "widget a"

    def test_trim(self, engine, row):
        row["Spaced"] = "  hello  "
        assert engine.evaluate('trim({Spaced})', row) == "hello"

    def test_pad_left(self, engine, row):
        assert engine.evaluate('pad_left({Padded}, "8", "0")', row) == "00000042"

    def test_pad_right(self, engine, row):
        result = engine.evaluate('pad_right({Padded}, "6", ".")', row)
        assert result == "42...."

    def test_slice(self, engine, row):
        assert engine.evaluate('slice({PartNumber}, "0", "3")', row) == "abc"

    def test_replace(self, engine, row):
        assert engine.evaluate('replace({Description}, "Widget", "Part")', row) == "Part A"

    def test_date_fmt(self, engine, row):
        result = engine.evaluate('date_fmt({Date}, "%d/%m/%Y")', row)
        assert result == "15/03/2026"

    def test_if_empty_with_value(self, engine, row):
        assert engine.evaluate('if_empty({PartNumber}, "N/A")', row) == "abc123"

    def test_if_empty_without_value(self, engine, row):
        assert engine.evaluate('if_empty({Empty}, "N/A")', row) == "N/A"

    def test_concat(self, engine, row):
        result = engine.evaluate('{PartNumber} + " - " + {Description}', row)
        assert result == "abc123 - Widget A"

    def test_nested_functions(self, engine, row):
        result = engine.evaluate('upper(slice({PartNumber}, "0", "3"))', row)
        assert result == "ABC"

    def test_empty_formula(self, engine, row):
        assert engine.evaluate("", row) == ""
        assert engine.evaluate(None, row) == ""

    def test_missing_column_returns_empty(self, engine, row):
        assert engine.evaluate("{NonExistent}", row) == ""

    def test_invalid_syntax(self, engine, row):
        with pytest.raises(FormulaParseError):
            engine.evaluate("invalid(((", row)

    def test_validate_valid(self, engine):
        assert engine.validate('upper({Col})') is True

    def test_validate_invalid(self, engine):
        assert engine.validate("invalid(((") is False

    def test_supported_functions(self):
        funcs = FormulaEngine.get_supported_functions()
        assert "upper" in funcs
        assert "date_fmt" in funcs
        assert len(funcs) == 9
