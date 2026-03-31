# FILE: tests/unit/test_csv_adapter.py
# Unit tests for the CSV Adapter

import csv
import os
import tempfile

import pytest

from omg.data.csv_adapter import CSVAdapter
from omg.data.adapter import ColumnType


@pytest.fixture
def csv_file(tmp_path):
    """Create a sample CSV file for testing."""
    path = tmp_path / "test.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["PartNumber", "Description", "Price", "Quantity"])
        writer.writerow(["P001", "Widget A", "12.50", "100"])
        writer.writerow(["P002", "Widget B", "15.00", "200"])
        writer.writerow(["P003", "Widget C", "8.75", "50"])
    return str(path)


class TestCSVAdapter:

    def test_get_columns(self, csv_file):
        adapter = CSVAdapter(csv_file)
        cols = adapter.get_columns()
        assert len(cols) == 4
        names = [c.name for c in cols]
        assert "PartNumber" in names
        assert "Price" in names

    def test_row_count(self, csv_file):
        adapter = CSVAdapter(csv_file)
        assert adapter.row_count() == 3

    def test_get_row(self, csv_file):
        adapter = CSVAdapter(csv_file)
        row = adapter.get_row(0)
        assert row["PartNumber"] == "P001"
        assert row["Description"] == "Widget A"

    def test_get_row_last(self, csv_file):
        adapter = CSVAdapter(csv_file)
        row = adapter.get_row(2)
        assert row["PartNumber"] == "P003"

    def test_get_row_out_of_range(self, csv_file):
        adapter = CSVAdapter(csv_file)
        with pytest.raises(IndexError):
            adapter.get_row(99)

    def test_iter_rows(self, csv_file):
        adapter = CSVAdapter(csv_file)
        rows = list(adapter.iter_rows())
        assert len(rows) == 3
        assert rows[1]["PartNumber"] == "P002"

    def test_iter_rows_range(self, csv_file):
        adapter = CSVAdapter(csv_file)
        rows = list(adapter.iter_rows(start=1, end=2))
        assert len(rows) == 1
        assert rows[0]["PartNumber"] == "P002"

    def test_type_inference(self, csv_file):
        adapter = CSVAdapter(csv_file)
        cols = adapter.get_columns()
        type_map = {c.name: c.inferred_type for c in cols}
        assert type_map["Quantity"] == ColumnType.INTEGER
        assert type_map["Price"] == ColumnType.FLOAT
        assert type_map["Description"] == ColumnType.STRING

    def test_tab_delimited(self, tmp_path):
        path = tmp_path / "tab.csv"
        with open(path, "w", encoding="utf-8") as f:
            f.write("Name\tAge\nAlice\t30\nBob\t25\n")
        adapter = CSVAdapter(str(path))
        row = adapter.get_row(0)
        assert row["Name"] == "Alice"

    def test_empty_file(self, tmp_path):
        path = tmp_path / "empty.csv"
        with open(path, "w", encoding="utf-8") as f:
            f.write("Col1,Col2\n")
        adapter = CSVAdapter(str(path))
        assert adapter.row_count() == 0
