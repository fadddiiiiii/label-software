# FILE: tests/unit/test_row_renderer.py
# Unit tests for the Row Renderer

import pytest
from omg.core.template_engine import TemplateDocument, CanvasElement, LabelConfig
from omg.print.row_renderer import RowRenderer


class TestRowRenderer:

    @pytest.fixture
    def template(self):
        return TemplateDocument(
            label=LabelConfig(width_mm=100, height_mm=50, dpi=300),
            elements=[
                CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                              width_mm=40, height_mm=8, value="Part A"),
                CanvasElement(id="bc1", type="barcode", x_mm=5, y_mm=20,
                              width_mm=50, height_mm=12, value="1234567890",
                              symbology="code128"),
                CanvasElement(id="r1", type="rect", x_mm=60, y_mm=5,
                              width_mm=35, height_mm=40),
                CanvasElement(id="l1", type="line", x_mm=5, y_mm=45,
                              width_mm=90, height_mm=1),
            ]
        )

    def test_render_single_label(self, template):
        renderer = RowRenderer(template)
        row_data = {"t1": "Widget X", "bc1": "9876543210"}
        pdf = renderer.render(row_data)
        assert isinstance(pdf, bytes)
        assert len(pdf) > 100
        assert pdf[:5] == b"%PDF-"

    def test_render_with_static_values(self, template):
        renderer = RowRenderer(template)
        row_data = {}  # No data binding — uses element.value
        pdf = renderer.render(row_data)
        assert pdf[:5] == b"%PDF-"

    def test_render_multi_pages(self, template):
        renderer = RowRenderer(template)
        rows = [
            {"t1": f"Widget {i}", "bc1": f"12345{i:05d}"}
            for i in range(5)
        ]
        pdf = renderer.render_multi(rows)
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 500  # Multi-page should be larger

    def test_render_with_background_color(self):
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, background_color="#FFFFCC"),
            elements=[
                CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                              width_mm=30, height_mm=8, value="Yellow BG"),
            ]
        )
        renderer = RowRenderer(template)
        pdf = renderer.render({"t1": "Yellow BG"})
        assert pdf[:5] == b"%PDF-"
