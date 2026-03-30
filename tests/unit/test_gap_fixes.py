# FILE: tests/unit/test_gap_fixes.py
# Unit tests for Addendum 02 Gap Fixes (GAP-01, GAP-02, GAP-03)

import csv
import os
import pytest
from datetime import datetime

from omg.core.template_engine import (
    TemplateDocument, CanvasElement, LabelConfig, SheetLayout,
    KeyboardBinding, SerialBinding, DateBinding, TimeBinding,
)
from omg.core.field_binder import BindingResolver, FieldBinding
from omg.data.csv_adapter import CSVAdapter
from omg.print.row_renderer import RowRenderer, build_label_clip_path
from omg.print.batch_engine import BatchController, JobStatus


# ── GAP-01: Sheet Layout ─────────────────────────────────────────────


class TestSheetLayout:

    def test_defaults(self):
        layout = SheetLayout()
        assert layout.cols == 1
        assert layout.rows == 1
        assert layout.labels_per_sheet == 1

    def test_labels_per_sheet(self):
        layout = SheetLayout(cols=3, rows=8)
        assert layout.labels_per_sheet == 24

    def test_label_origin_first(self):
        layout = SheetLayout(cols=2, rows=4, h_gap_mm=3.0, v_gap_mm=3.0,
                             margin_left_mm=5.0, margin_top_mm=5.0)
        x, y = layout.label_origin(0, 50.0, 30.0)
        assert x == 5.0  # margin_left
        assert y == 5.0  # margin_top

    def test_label_origin_second_col(self):
        layout = SheetLayout(cols=2, rows=4, h_gap_mm=3.0,
                             margin_left_mm=5.0, margin_top_mm=5.0)
        x, y = layout.label_origin(1, 50.0, 30.0)
        assert x == 5.0 + 50.0 + 3.0  # margin + label_w + h_gap
        assert y == 5.0

    def test_label_origin_second_row(self):
        layout = SheetLayout(cols=2, rows=4, v_gap_mm=3.0,
                             margin_left_mm=5.0, margin_top_mm=5.0)
        x, y = layout.label_origin(2, 50.0, 30.0)
        assert x == 5.0  # First column of second row
        assert y == 5.0 + 30.0 + 3.0  # margin + label_h + v_gap

    def test_template_default_backward_compat(self):
        """Default SheetLayout is 1x1, preserving single-label-per-page behavior."""
        doc = TemplateDocument()
        assert doc.sheet_layout.labels_per_sheet == 1


class TestRenderSheet:

    @pytest.fixture
    def template(self):
        return TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30),
            sheet_layout=SheetLayout(cols=2, rows=3),
            elements=[
                CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                              width_mm=30, height_mm=8, value="Label"),
            ]
        )

    def test_render_sheet_produces_pdf(self, template):
        renderer = RowRenderer(template)
        labels = [{"t1": f"Widget {i}"} for i in range(6)]
        pdf = renderer.render_sheet(labels, template.sheet_layout)
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 500

    def test_render_sheet_partial(self, template):
        """Partial sheet (3 out of 6 slots) still renders."""
        renderer = RowRenderer(template)
        labels = [{"t1": f"Widget {i}"} for i in range(3)]
        pdf = renderer.render_sheet(labels, template.sheet_layout)
        assert pdf[:5] == b"%PDF-"

    def test_batch_sheet_mode(self, template, tmp_path):
        """Batch with 2x3 sheet layout produces fewer pages than labels."""
        csv_path = tmp_path / "items.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Name"])
            for i in range(12):
                writer.writerow([f"Item {i}"])

        adapter = CSVAdapter(str(csv_path))
        resolver = BindingResolver()
        resolver.attach_adapter("src", adapter, is_primary=True)
        bindings = [FieldBinding(field_id="t1", source_id="src",
                                 column_name="Name")]

        controller = BatchController(template, resolver, bindings, adapter)
        output = str(tmp_path / "sheet_output.pdf")
        progress = controller.run(printer_name="PDF", output_path=output)

        assert progress.status == JobStatus.DONE
        assert progress.completed_rows == 12
        assert os.path.exists(output)

        # With 6 labels per sheet, 12 rows → 2 sheet pages
        from pypdf import PdfReader
        reader = PdfReader(output)
        assert len(reader.pages) == 2


# ── GAP-02: Keyboard / Serial / Date / Time Bindings ─────────────────


class TestKeyboardBinding:

    def test_keyboard_resolution(self):
        resolver = BindingResolver()
        resolver.set_keyboard_values({"lot": "LOT-2026-001"})

        kb = KeyboardBinding(field_id="lot", prompt_label="Lot Number")
        result = resolver.resolve_row([kb], primary_idx=0)
        assert result["lot"] == "LOT-2026-001"

    def test_keyboard_default_value(self):
        resolver = BindingResolver()
        # No keyboard values set — should fall back to default
        kb = KeyboardBinding(field_id="shift", prompt_label="Shift Code",
                             default_value="DAY")
        result = resolver.resolve_row([kb], primary_idx=0)
        assert result["shift"] == "DAY"


class TestSerialBinding:

    def test_serial_increment(self):
        resolver = BindingResolver()
        sb = SerialBinding(field_id="serial", start_value=1000, increment=1)

        r0 = resolver.resolve_row([sb], primary_idx=0)
        r1 = resolver.resolve_row([sb], primary_idx=1)
        r5 = resolver.resolve_row([sb], primary_idx=5)

        assert r0["serial"] == "1000"
        assert r1["serial"] == "1001"
        assert r5["serial"] == "1005"

    def test_serial_padding(self):
        resolver = BindingResolver()
        sb = SerialBinding(field_id="s", start_value=1, increment=1,
                           pad_to_length=6, prefix="SN-")

        r0 = resolver.resolve_row([sb], primary_idx=0)
        assert r0["s"] == "SN-000001"

    def test_serial_custom_increment(self):
        resolver = BindingResolver()
        sb = SerialBinding(field_id="s", start_value=100, increment=10)

        r0 = resolver.resolve_row([sb], primary_idx=0)
        r1 = resolver.resolve_row([sb], primary_idx=1)
        assert r0["s"] == "100"
        assert r1["s"] == "110"


class TestDateTimeBinding:

    def test_date_binding(self):
        resolver = BindingResolver()
        db = DateBinding(field_id="date", format_str="%Y-%m-%d")
        result = resolver.resolve_row([db], primary_idx=0)
        # Should be today's date
        expected = datetime.now().strftime("%Y-%m-%d")
        assert result["date"] == expected

    def test_time_binding(self):
        resolver = BindingResolver()
        tb = TimeBinding(field_id="time", format_str="%H:%M")
        result = resolver.resolve_row([tb], primary_idx=0)
        # Should be current hour:minute (within 1 minute tolerance)
        expected = datetime.now().strftime("%H:%M")
        assert result["time"] == expected

    def test_mixed_bindings(self, tmp_path):
        """Resolve a mix of database + keyboard + serial + date bindings."""
        csv_path = tmp_path / "parts.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["PartNumber", "Description"])
            writer.writerow(["P001", "Widget A"])
            writer.writerow(["P002", "Widget B"])
            writer.writerow(["P003", "Widget C"])

        adapter = CSVAdapter(str(csv_path))
        resolver = BindingResolver()
        resolver.attach_adapter("src", adapter, is_primary=True)
        resolver.set_keyboard_values({"lot": "LOT-A"})

        bindings = [
            FieldBinding(field_id="part", source_id="src",
                         column_name="PartNumber"),
            KeyboardBinding(field_id="lot", prompt_label="Lot"),
            SerialBinding(field_id="serial", start_value=1, pad_to_length=4),
            DateBinding(field_id="date", format_str="%d/%m/%Y"),
        ]

        result = resolver.resolve_row(bindings, primary_idx=0)
        assert result["part"] == "P001"
        assert result["lot"] == "LOT-A"
        assert result["serial"] == "0001"
        assert len(result["date"]) == 10  # DD/MM/YYYY


# ── GAP-03: Ellipse Shape + Copies Per Label ─────────────────────────


class TestLabelShape:

    def test_default_shape_is_rect(self):
        config = LabelConfig()
        assert config.shape == "rect"
        assert config.show_border is True
        assert config.corner_radius_mm == 3.0

    def test_ellipse_shape(self):
        config = LabelConfig(shape="ellipse")
        assert config.shape == "ellipse"

    def test_round_rect_shape(self):
        config = LabelConfig(shape="round_rect", corner_radius_mm=5.0)
        assert config.shape == "round_rect"
        assert config.corner_radius_mm == 5.0

    def test_render_with_ellipse_shape(self):
        """Render a single label with ellipse shape."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, shape="ellipse"),
            elements=[
                CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                              width_mm=30, height_mm=8, value="Ellipse"),
            ]
        )
        renderer = RowRenderer(template)
        pdf = renderer.render({"t1": "Ellipse"})
        assert pdf[:5] == b"%PDF-"


class TestCopiesPerLabel:

    def test_copies_per_label(self, tmp_path):
        """copies_per_label=3 with 2 rows → 6 total labels."""
        csv_path = tmp_path / "items.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Name"])
            writer.writerow(["A"])
            writer.writerow(["B"])

        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30),
            elements=[
                CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                              width_mm=30, height_mm=8, value=""),
            ]
        )
        adapter = CSVAdapter(str(csv_path))
        resolver = BindingResolver()
        resolver.attach_adapter("src", adapter, is_primary=True)
        bindings = [FieldBinding(field_id="t1", source_id="src",
                                 column_name="Name")]

        controller = BatchController(template, resolver, bindings, adapter)
        output = str(tmp_path / "copies.pdf")
        progress = controller.run(printer_name="PDF",
                                  copies_per_label=3,
                                  output_path=output)

        assert progress.status == JobStatus.DONE
        assert progress.completed_rows == 2

        from pypdf import PdfReader
        reader = PdfReader(output)
        assert len(reader.pages) == 6  # 2 rows × 3 copies
