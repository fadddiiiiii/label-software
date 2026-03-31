# FILE: tests/unit/test_barcode_engine.py
# Unit tests for the Barcode Rendering Engine

import pytest

from omg.core.barcode_engine import (
    BarcodeRenderer, GS1Formatter, UnsupportedSymbologyError, BarcodeRenderError,
)


class TestBarcodeRenderer:

    def test_code128_svg(self):
        svg = BarcodeRenderer.render_svg("code128", "ABC12345", 60, 15)
        assert "<svg" in svg
        assert len(svg) > 100

    def test_code39_svg(self):
        svg = BarcodeRenderer.render_svg("code39", "HELLO", 60, 15)
        assert "<svg" in svg

    def test_ean13_svg(self):
        svg = BarcodeRenderer.render_svg("ean13", "123456789012", 60, 15)
        assert "<svg" in svg

    def test_qrcode_svg(self):
        svg = BarcodeRenderer.render_svg("qrcode", "https://example.com", 30, 30)
        assert "<svg" in svg or "<?xml" in svg

    def test_unsupported_symbology(self):
        with pytest.raises(UnsupportedSymbologyError):
            BarcodeRenderer.render_svg("unknown_type", "data", 40, 15)

    def test_cache_hit(self):
        BarcodeRenderer.clear_cache()
        svg1 = BarcodeRenderer.render_svg("code128", "CACHE_TEST", 40, 15)
        svg2 = BarcodeRenderer.render_svg("code128", "CACHE_TEST", 40, 15)
        assert svg1 == svg2
        info = BarcodeRenderer.render_svg.cache_info()
        assert info.hits >= 1

    def test_supported_symbologies(self):
        syms = BarcodeRenderer.get_supported_symbologies()
        assert "code128" in syms
        assert "qrcode" in syms
        assert len(syms) == 9


class TestGS1Formatter:

    def test_format_gtin(self):
        result = GS1Formatter.format("(01)12345678901231")
        assert "01" in result

    def test_check_digit(self):
        # GS1 check digit for "629104150021" should be "3"
        digit = GS1Formatter.calculate_check_digit("629104150021")
        assert digit == "3"

    def test_multi_ai(self):
        result = GS1Formatter.format("(01)12345678901231(10)LOT123")
        assert "10" in result
        assert "LOT123" in result

    def test_unknown_ai(self):
        with pytest.raises(ValueError, match="Unknown GS1"):
            GS1Formatter.format("(99)INVALID")
