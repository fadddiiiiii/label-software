# FILE: tests/unit/test_print_pipeline.py
# Comprehensive Printer Simulator & Print Pipeline Tests
# ═══════════════════════════════════════════════════════════════════
# Tests the full rendering → simulation pipeline across all
# supported command languages: TSPL2, ZPL II, ESC/POS, PDF.
# Uses VirtualPrinter + SimulatedDispatcher to validate output
# without physical hardware.
# ═══════════════════════════════════════════════════════════════════

import pytest
from omg.core.template_engine import (
    TemplateDocument, CanvasElement, LabelConfig, SheetLayout,
)
from omg.print.tspl_renderer import TsplRenderer
from omg.print.zpl_renderer import ZplRenderer
from omg.print.row_renderer import RowRenderer
from omg.print.simulator import (
    VirtualPrinter, SimulatedDispatcher,
    TsplParser, ZplParser, EscPosParser, PdfParser,
    CommandLanguage, detect_language,
    PrintJob, ParsedLabel, ParsedElement,
)


# ══════════════════════════════════════════════════════════════════
# Shared Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture
def simple_template():
    """A minimal label with one text and one barcode."""
    return TemplateDocument(
        label=LabelConfig(width_mm=77.5, height_mm=40.0, dpi=203),
        elements=[
            CanvasElement(
                id="product_name", type="text",
                x_mm=5, y_mm=5, width_mm=40, height_mm=8,
                font_size=14, value="Test Product",
            ),
            CanvasElement(
                id="barcode1", type="barcode",
                x_mm=5, y_mm=18, width_mm=50, height_mm=12,
                value="ABC123456", symbology="code128",
            ),
        ],
    )


@pytest.fixture
def complex_template():
    """A realistic label with text, barcode, QR, rectangle, line."""
    return TemplateDocument(
        label=LabelConfig(width_mm=100, height_mm=70, dpi=203),
        elements=[
            CanvasElement(
                id="title", type="text",
                x_mm=5, y_mm=3, width_mm=50, height_mm=10,
                font_size=18, value="ACME Corp",
            ),
            CanvasElement(
                id="part_num", type="text",
                x_mm=5, y_mm=15, width_mm=40, height_mm=6,
                font_size=10, value="PN-001",
            ),
            CanvasElement(
                id="description", type="text",
                x_mm=5, y_mm=22, width_mm=60, height_mm=6,
                font_size=8, value="Industrial Widget",
            ),
            CanvasElement(
                id="bc_part", type="barcode",
                x_mm=5, y_mm=32, width_mm=55, height_mm=15,
                value="PN001-LOT42", symbology="code128",
            ),
            CanvasElement(
                id="qr_info", type="qrcode",
                x_mm=70, y_mm=5, width_mm=25, height_mm=25,
                value="https://acme.com/pn001",
            ),
            CanvasElement(
                id="sep_line", type="line",
                x_mm=5, y_mm=30, width_mm=60, height_mm=0.5,
            ),
            CanvasElement(
                id="border_box", type="rect",
                x_mm=1, y_mm=1, width_mm=98, height_mm=68,
            ),
        ],
    )


@pytest.fixture
def row_data():
    return {
        "product_name": "Widget X-700",
        "barcode1": "WDG700001",
    }


@pytest.fixture
def complex_row_data():
    return {
        "title": "ACME Corp",
        "part_num": "PN-42X",
        "description": "Heavy Duty Widget",
        "bc_part": "PN42X-LOT99",
        "qr_info": "https://acme.com/pn42x",
    }


@pytest.fixture
def virtual_printer():
    return VirtualPrinter(name="Test Printer")


@pytest.fixture
def tspl_printer():
    return VirtualPrinter(
        name="TSC TE200",
        supported_languages=[CommandLanguage.TSPL, CommandLanguage.PDF],
    )


@pytest.fixture
def zpl_printer():
    return VirtualPrinter(
        name="Zebra ZD420",
        supported_languages=[CommandLanguage.ZPL, CommandLanguage.PDF],
    )


@pytest.fixture
def dispatcher():
    return SimulatedDispatcher()


# ══════════════════════════════════════════════════════════════════
# 1. Language Detection
# ══════════════════════════════════════════════════════════════════

class TestLanguageDetection:
    """Verify auto-detection works for all supported languages."""

    def test_detect_tspl(self):
        data = b"SIZE 77.5 mm, 40 mm\r\nGAP 3 mm, 0 mm\r\nCLS\r\nPRINT 1,1\r\n"
        assert detect_language(data) == CommandLanguage.TSPL

    def test_detect_zpl(self):
        data = b"^XA\n^PW620\n^LL320\n^CI28\n^XZ\n"
        assert detect_language(data) == CommandLanguage.ZPL

    def test_detect_pdf(self):
        data = b"%PDF-1.4 some content"
        assert detect_language(data) == CommandLanguage.PDF

    def test_detect_escpos(self):
        data = b"\x1b@Hello World\x0a"
        assert detect_language(data) == CommandLanguage.ESCPOS

    def test_detect_escpos_gs(self):
        data = b"\x1d\x48\x02Hello\x0a"
        assert detect_language(data) == CommandLanguage.ESCPOS

    def test_detect_raw(self):
        data = b"\x00\x01\x02\x03random binary"
        assert detect_language(data) == CommandLanguage.RAW

    def test_detect_empty(self):
        assert detect_language(b"") == CommandLanguage.UNKNOWN


# ══════════════════════════════════════════════════════════════════
# 2. TSPL2 Parser — Direct Parsing
# ══════════════════════════════════════════════════════════════════

class TestTsplParser:
    """Test the TSPL2 parser independently from rendering."""

    @pytest.fixture
    def parser(self):
        return TsplParser()

    def test_parse_production_prn(self, parser):
        """Parse a real production .prn file format (from actual label software)."""
        prn = (
            'SIZE 77.5 mm, 40 mm\r\n'
            'GAP 3 mm, 0 mm\r\n'
            'SPEED 6\r\n'
            'DENSITY 7\r\n'
            'SET RIBBON ON\r\n'
            'DIRECTION 0,0\r\n'
            'REFERENCE 0,0\r\n'
            'OFFSET 0 mm\r\n'
            'SET PEEL OFF\r\n'
            'SET CUTTER OFF\r\n'
            'SET PARTIAL_CUTTER OFF\r\n'
            'SET TEAR ON\r\n'
            'CLS\r\n'
            'CODEPAGE 1252\r\n'
            'TEXT 84,116,"4",0,1,1,"AE5B35C"\r\n'
            'BARCODE 36,147,"128M",92,1,0,2,4,"AE5B35C"\r\n'
            'PRINT 1,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))

        assert job.is_valid
        assert job.language == CommandLanguage.TSPL
        assert len(job.labels) == 1

        label = job.labels[0]
        assert label.width_mm == 77.5
        assert label.height_mm == 40.0
        assert label.gap_mm == 3.0
        assert label.config.get("speed") == 6
        assert label.config.get("density") == 7
        assert label.config.get("codepage") == 1252
        assert label.copies == 1

        # Verify elements
        texts = [e for e in label.elements if e.element_type == "text"]
        barcodes = [e for e in label.elements if e.element_type == "barcode"]
        assert len(texts) == 1
        assert len(barcodes) == 1
        assert texts[0].data == "AE5B35C"
        assert texts[0].font == "4"
        assert barcodes[0].data == "AE5B35C"
        assert barcodes[0].properties["symbology"] == "128M"

    def test_parse_xpml_wrapped(self, parser):
        """XPML wrappers (from BarTender) should be stripped."""
        prn = (
            '<xpml><page quantity="0" pitch="40.0 mm"></xpml>\r\n'
            'SIZE 77.5 mm, 40 mm\r\n'
            'GAP 3 mm, 0 mm\r\n'
            'CLS\r\n'
            '<xpml></page></xpml>\r\n'
            '<xpml><page quantity="1" pitch="40.0 mm"></xpml>\r\n'
            'TEXT 100,100,"3",0,1,1,"Hello"\r\n'
            'PRINT 1,1\r\n'
            '<xpml></page></xpml>\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid
        assert len(job.labels) >= 1
        assert job.get_texts() == ["Hello"]

    def test_parse_multiple_labels(self, parser):
        """Multiple PRINT commands = multiple labels."""
        prn = (
            'SIZE 50 mm, 30 mm\r\n'
            'GAP 2 mm, 0 mm\r\n'
            'CLS\r\n'
            'TEXT 10,10,"3",0,1,1,"Label 1"\r\n'
            'PRINT 1,1\r\n'
            'SIZE 50 mm, 30 mm\r\n'
            'GAP 2 mm, 0 mm\r\n'
            'CLS\r\n'
            'TEXT 10,10,"3",0,1,1,"Label 2"\r\n'
            'PRINT 2,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid
        assert len(job.labels) == 2
        assert job.labels[0].copies == 1
        assert job.labels[1].copies == 2
        assert job.total_labels == 3
        assert job.get_texts() == ["Label 1", "Label 2"]

    def test_parse_qrcode(self, parser):
        prn = (
            'SIZE 50 mm, 50 mm\r\n'
            'CLS\r\n'
            'QRCODE 100,100,H,4,A,0,M2,S7,"https://example.com"\r\n'
            'PRINT 1,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid
        qrs = [e for l in job.labels for e in l.elements if e.element_type == "qrcode"]
        assert len(qrs) == 1
        assert qrs[0].data == "https://example.com"

    def test_parse_box_and_bar(self, parser):
        prn = (
            'SIZE 60 mm, 40 mm\r\n'
            'CLS\r\n'
            'BOX 10,10,200,150,3\r\n'
            'BAR 20,160,180,5\r\n'
            'PRINT 1,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid
        rects = [e for l in job.labels for e in l.elements if e.element_type == "rect"]
        lines = [e for l in job.labels for e in l.elements if e.element_type == "line"]
        assert len(rects) == 1
        assert len(lines) == 1
        assert rects[0].properties["thickness"] == 3

    def test_parse_circle(self, parser):
        prn = (
            'SIZE 50 mm, 50 mm\r\n'
            'CLS\r\n'
            'CIRCLE 100,100,50,2\r\n'
            'PRINT 1,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid
        circles = [e for l in job.labels for e in l.elements if e.element_type == "circle"]
        assert len(circles) == 1
        assert circles[0].width == 50

    def test_density_range_warning(self, parser):
        prn = (
            'SIZE 50 mm, 30 mm\r\n'
            'DENSITY 20\r\n'
            'CLS\r\n'
            'PRINT 1,1\r\n'
        )
        job = parser.parse(prn.encode("utf-8"))
        assert any("DENSITY" in w for w in job.warnings)

    def test_missing_cls_warning(self, parser):
        """Missing CLS should produce a warning, not an error."""
        prn = 'SIZE 50 mm, 30 mm\r\nPRINT 1,1\r\n'
        job = parser.parse(prn.encode("utf-8"))
        assert job.is_valid  # Still valid
        assert any("CLS" in w for w in job.warnings)


# ══════════════════════════════════════════════════════════════════
# 3. ZPL II Parser — Direct Parsing
# ══════════════════════════════════════════════════════════════════

class TestZplParser:
    """Test the ZPL II parser independently from rendering."""

    @pytest.fixture
    def parser(self):
        return ZplParser()

    def test_parse_basic_label(self, parser):
        zpl = (
            "^XA\n"
            "^PW620\n"
            "^LL320\n"
            "^CI28\n"
            "^FO40,40^A0N,30,25^FDHello World^FS\n"
            "^FO40,100^BCN,60,Y,N,N^FD12345^FS\n"
            "^XZ\n"
        )
        job = parser.parse(zpl.encode("utf-8"))

        assert job.is_valid
        assert job.language == CommandLanguage.ZPL
        assert len(job.labels) == 1

        label = job.labels[0]
        assert label.width_mm == pytest.approx(620 / 8.0, abs=1)
        assert label.height_mm == pytest.approx(320 / 8.0, abs=1)

        texts = [e for e in label.elements if e.element_type == "text"]
        barcodes = [e for e in label.elements if e.element_type == "barcode"]
        assert len(texts) == 1
        assert len(barcodes) == 1
        assert texts[0].data == "Hello World"
        assert barcodes[0].data == "12345"

    def test_parse_qr_code(self, parser):
        zpl = (
            "^XA\n"
            "^FO100,50^BQN,2,5^FDQA,https://example.com^FS\n"
            "^XZ\n"
        )
        job = parser.parse(zpl.encode("utf-8"))
        assert job.is_valid
        qrs = [e for l in job.labels for e in l.elements if e.element_type == "qrcode"]
        assert len(qrs) == 1
        assert qrs[0].data == "https://example.com"

    def test_parse_graphic_box(self, parser):
        zpl = (
            "^XA\n"
            "^FO10,10^GB200,100,3,B,0^FS\n"
            "^XZ\n"
        )
        job = parser.parse(zpl.encode("utf-8"))
        assert job.is_valid
        rects = [e for l in job.labels for e in l.elements if e.element_type == "rect"]
        assert len(rects) == 1
        assert rects[0].width == 200
        assert rects[0].height == 100

    def test_parse_graphic_circle(self, parser):
        zpl = (
            "^XA\n"
            "^FO50,50^GC100,2,B^FS\n"
            "^XZ\n"
        )
        job = parser.parse(zpl.encode("utf-8"))
        assert job.is_valid
        circles = [e for l in job.labels for e in l.elements if e.element_type == "circle"]
        assert len(circles) == 1
        assert circles[0].width == 100

    def test_parse_multiple_labels(self, parser):
        zpl = (
            "^XA\n^FO10,10^A0N,20,20^FDLabel 1^FS\n^XZ\n"
            "^XA\n^FO10,10^A0N,20,20^FDLabel 2^FS\n^XZ\n"
            "^XA\n^FO10,10^A0N,20,20^FDLabel 3^FS\n^XZ\n"
        )
        job = parser.parse(zpl.encode("utf-8"))
        assert job.is_valid
        assert len(job.labels) == 3
        assert job.get_texts() == ["Label 1", "Label 2", "Label 3"]

    def test_parse_rotation(self, parser):
        zpl = "^XA\n^FO10,10^A0R,30,25^FDRotated^FS\n^XZ\n"
        job = parser.parse(zpl.encode("utf-8"))
        assert job.is_valid
        texts = [e for l in job.labels for e in l.elements if e.element_type == "text"]
        assert texts[0].rotation == 90

    def test_no_format_block_error(self, parser):
        job = parser.parse(b"Just some random text")
        assert not job.is_valid
        assert any("^XA" in e for e in job.errors)


# ══════════════════════════════════════════════════════════════════
# 4. ESC/POS Parser
# ══════════════════════════════════════════════════════════════════

class TestEscPosParser:
    """Test the ESC/POS parser for receipt/label printers."""

    @pytest.fixture
    def parser(self):
        return EscPosParser()

    def test_parse_text(self, parser):
        data = b"\x1b@Hello World\x0aSecond Line\x0a"
        job = parser.parse(data)
        assert job.is_valid
        assert job.language == CommandLanguage.ESCPOS
        texts = job.get_texts()
        assert "Hello World" in texts or any("Hello" in t for t in texts)

    def test_parse_barcode(self, parser):
        # GS k format: 0x1D 0x6B type length data
        data = bytearray()
        data.extend(b"\x1b@")  # Initialize
        data.extend(b"\x1d\x6b")  # GS k
        data.append(0x49)  # Type: Code128
        data.append(5)  # Length
        data.extend(b"ABCDE")  # Data
        data.extend(b"\x0a")  # Line feed

        job = parser.parse(bytes(data))
        assert job.is_valid
        barcodes = job.get_barcodes()
        assert len(barcodes) >= 1
        assert "ABCDE" in barcodes

    def test_parse_cut(self, parser):
        data = b"\x1b@Receipt line\x0a\x1d\x56\x00"
        job = parser.parse(data)
        assert job.is_valid
        assert job.labels[0].config.get("cut") is True

    def test_parse_empty(self, parser):
        job = parser.parse(b"")
        assert not job.is_valid


# ══════════════════════════════════════════════════════════════════
# 5. PDF Parser
# ══════════════════════════════════════════════════════════════════

class TestPdfParser:
    """Test the PDF validator/parser."""

    @pytest.fixture
    def parser(self):
        return PdfParser()

    def test_validate_real_pdf(self, parser, simple_template, row_data):
        """Render a real PDF via RowRenderer and validate it."""
        renderer = RowRenderer(simple_template)
        pdf_bytes = renderer.render(row_data)

        job = parser.parse(pdf_bytes)
        assert job.is_valid
        assert job.language == CommandLanguage.PDF
        assert job.total_labels >= 1

    def test_invalid_pdf(self, parser):
        job = parser.parse(b"Not a PDF at all")
        assert not job.is_valid
        assert any("PDF" in e for e in job.errors)


# ══════════════════════════════════════════════════════════════════
# 6. TSPL Renderer → Simulator (End-to-End)
# ══════════════════════════════════════════════════════════════════

class TestTsplRendererToSimulator:
    """Render TSPL2 via TsplRenderer and validate through the simulator."""

    def test_render_and_parse_simple(self, simple_template, row_data, tspl_printer):
        renderer = TsplRenderer(simple_template)
        raw = renderer.render(row_data)

        job = tspl_printer.receive(raw)
        assert job.is_valid
        assert job.language == CommandLanguage.TSPL

        label = job.labels[0]
        assert label.width_mm == 77.5
        assert label.height_mm == 40.0

        # Verify our text and barcode made it through
        texts = job.get_texts()
        barcodes = job.get_barcodes()
        assert "Widget X-700" in texts
        assert "WDG700001" in barcodes

    def test_render_production_preamble(self, simple_template):
        """Verify the full production preamble is present."""
        renderer = TsplRenderer(simple_template, speed=6, density=7, ribbon=True)
        raw = renderer.render({"product_name": "Test", "barcode1": "12345"})
        text = raw.decode("utf-8")

        # Check all production commands
        assert "SIZE 77.5 mm, 40.0 mm" in text
        assert "SPEED 6" in text
        assert "DENSITY 7" in text
        assert "SET RIBBON ON" in text
        assert "DIRECTION 0,0" in text
        assert "REFERENCE 0,0" in text
        assert "OFFSET 0 mm" in text
        assert "SET PEEL OFF" in text
        assert "SET CUTTER OFF" in text
        assert "SET TEAR ON" in text
        assert "CLS" in text
        assert "CODEPAGE 1252" in text
        assert "PRINT 1,1" in text

    def test_render_complex_label(self, complex_template, complex_row_data, tspl_printer):
        renderer = TsplRenderer(complex_template)
        raw = renderer.render(complex_row_data)

        job = tspl_printer.receive(raw)
        assert job.is_valid

        texts = job.get_texts()
        barcodes = job.get_barcodes()
        assert "ACME Corp" in texts
        assert "PN-42X" in texts
        assert "PN42X-LOT99" in barcodes

        # Verify QR code parsed
        qrs = [e for l in job.labels for e in l.elements if e.element_type == "qrcode"]
        assert len(qrs) == 1
        assert "acme.com" in qrs[0].data

    def test_render_barcode_128m(self, simple_template, tspl_printer):
        """Verify Code 128 renders as 128M (auto-switching) matching real .prn files."""
        renderer = TsplRenderer(simple_template)
        raw = renderer.render({"product_name": "Test", "barcode1": "ABC123"})

        job = tspl_printer.receive(raw)
        barcodes_elems = [
            e for l in job.labels for e in l.elements if e.element_type == "barcode"
        ]
        assert len(barcodes_elems) >= 1
        assert barcodes_elems[0].properties["symbology"] == "128M"

    def test_render_font_selection(self, tspl_printer):
        """Verify font selection matches real .prn patterns."""
        # Large font → font "5"
        template_large = TemplateDocument(
            label=LabelConfig(width_mm=100, height_mm=50, dpi=203),
            elements=[
                CanvasElement(
                    id="big_text", type="text",
                    x_mm=5, y_mm=5, width_mm=80, height_mm=20,
                    font_size=36, value="BIG TEXT",
                ),
            ],
        )
        renderer = TsplRenderer(template_large)
        raw = renderer.render({"big_text": "BIG TEXT"})
        job = tspl_printer.receive(raw)
        text_elems = [e for l in job.labels for e in l.elements if e.element_type == "text"]
        assert any(e.font in ("4", "5") for e in text_elems)

        # Small font → font "1" or "2"
        template_small = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="small_text", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=5,
                    font_size=8, value="small text",
                ),
            ],
        )
        renderer_small = TsplRenderer(template_small)
        raw_small = renderer_small.render({"small_text": "small text"})
        job_small = tspl_printer.receive(raw_small)
        text_elems_small = [e for l in job_small.labels for e in l.elements if e.element_type == "text"]
        assert any(e.font in ("1", "2", "3") for e in text_elems_small)

    def test_render_direct_thermal(self, simple_template, tspl_printer):
        """Verify ribbon=OFF for direct thermal mode."""
        renderer = TsplRenderer(simple_template, ribbon=False)
        raw = renderer.render({"product_name": "Test", "barcode1": "X"})
        text = raw.decode("utf-8")
        assert "SET RIBBON OFF" in text

    def test_render_multi_label_sheet(self, simple_template, tspl_printer):
        """Verify sheet rendering (multiple labels concatenated)."""
        renderer = TsplRenderer(simple_template)
        layout = SheetLayout(cols=2, rows=2)
        rows = [
            {"product_name": f"Item {i}", "barcode1": f"BC{i:05d}"}
            for i in range(4)
        ]
        raw = renderer.render_sheet(rows, layout)

        # Send the full sheet to the printer
        job = tspl_printer.receive(raw)
        assert job.is_valid
        assert len(job.labels) == 4
        assert job.total_labels == 4

    def test_empty_value_text_skipped(self, tspl_printer):
        """Empty text values should not produce TEXT commands."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="empty_field", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value="",
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"empty_field": ""})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        # No text elements should be rendered for empty value
        texts = [e for l in job.labels for e in l.elements if e.element_type == "text"]
        assert len(texts) == 0

    def test_do_not_print_skipped(self, tspl_printer):
        """Elements with do_not_print=True should not appear in output."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="visible", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value="Visible",
                ),
                CanvasElement(
                    id="hidden", type="text",
                    x_mm=5, y_mm=15, width_mm=30, height_mm=8,
                    font_size=12, value="Hidden", do_not_print=True,
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"visible": "Show Me", "hidden": "Hide Me"})
        text = raw.decode("utf-8")
        assert "Show Me" in text
        assert "Hide Me" not in text


# ══════════════════════════════════════════════════════════════════
# 7. ZPL Renderer → Simulator (End-to-End)
# ══════════════════════════════════════════════════════════════════

class TestZplRendererToSimulator:
    """Render ZPL II via ZplRenderer and validate through the simulator."""

    def test_render_and_parse_simple(self, simple_template, row_data, zpl_printer):
        renderer = ZplRenderer(simple_template)
        raw = renderer.render(row_data)

        job = zpl_printer.receive(raw)
        assert job.is_valid
        assert job.language == CommandLanguage.ZPL

        texts = job.get_texts()
        barcodes = job.get_barcodes()
        assert "Widget X-700" in texts
        assert "WDG700001" in barcodes

    def test_render_with_xaxz_framing(self, simple_template, row_data):
        renderer = ZplRenderer(simple_template)
        raw = renderer.render(row_data)
        text = raw.decode("utf-8")

        assert text.strip().startswith("^XA")
        assert text.strip().endswith("^XZ")

    def test_render_complex_label(self, complex_template, complex_row_data, zpl_printer):
        renderer = ZplRenderer(complex_template)
        raw = renderer.render(complex_row_data)

        job = zpl_printer.receive(raw)
        assert job.is_valid

        texts = job.get_texts()
        barcodes = job.get_barcodes()
        assert "ACME Corp" in texts
        assert "PN42X-LOT99" in barcodes

    def test_render_pw_and_ll(self, simple_template):
        """Verify ^PW (width) and ^LL (length) commands are present."""
        renderer = ZplRenderer(simple_template)
        raw = renderer.render({"product_name": "X", "barcode1": "Y"})
        text = raw.decode("utf-8")
        assert "^PW" in text
        assert "^LL" in text

    def test_render_ci28_encoding(self, simple_template):
        """Verify ^CI28 (UTF-8) encoding command."""
        renderer = ZplRenderer(simple_template)
        raw = renderer.render({"product_name": "X", "barcode1": "Y"})
        text = raw.decode("utf-8")
        assert "^CI28" in text

    def test_render_multi_label_sheet(self, simple_template, zpl_printer):
        renderer = ZplRenderer(simple_template)
        layout = SheetLayout(cols=1, rows=1)
        rows = [
            {"product_name": f"Item {i}", "barcode1": f"ZPL{i:05d}"}
            for i in range(3)
        ]
        raw = renderer.render_sheet(rows, layout)

        job = zpl_printer.receive(raw)
        assert job.is_valid
        assert len(job.labels) == 3


# ══════════════════════════════════════════════════════════════════
# 8. PDF Renderer → Simulator (End-to-End)
# ══════════════════════════════════════════════════════════════════

class TestPdfRendererToSimulator:
    """Render PDF via RowRenderer and validate through the simulator."""

    def test_render_and_validate(self, simple_template, row_data, virtual_printer):
        renderer = RowRenderer(simple_template)
        pdf = renderer.render(row_data)

        job = virtual_printer.receive(pdf)
        assert job.is_valid
        assert job.language == CommandLanguage.PDF
        assert job.total_labels >= 1

    def test_render_complex_label(self, complex_template, complex_row_data, virtual_printer):
        renderer = RowRenderer(complex_template)
        pdf = renderer.render(complex_row_data)

        job = virtual_printer.receive(pdf)
        assert job.is_valid


# ══════════════════════════════════════════════════════════════════
# 9. Virtual Printer
# ══════════════════════════════════════════════════════════════════

class TestVirtualPrinter:
    """Test the VirtualPrinter class directly."""

    def test_receive_tspl(self, virtual_printer):
        data = (
            b"SIZE 50 mm, 30 mm\r\n"
            b"CLS\r\n"
            b'TEXT 10,10,"3",0,1,1,"Hello"\r\n'
            b"PRINT 1,1\r\n"
        )
        job = virtual_printer.receive(data)
        assert job.is_valid
        assert job.language == CommandLanguage.TSPL
        assert virtual_printer.job_count == 1
        assert virtual_printer.last_job is job

    def test_receive_zpl(self, virtual_printer):
        data = b"^XA\n^FO10,10^A0N,20,20^FDHello^FS\n^XZ\n"
        job = virtual_printer.receive(data)
        assert job.is_valid
        assert job.language == CommandLanguage.ZPL

    def test_receive_pdf(self, virtual_printer, simple_template, row_data):
        renderer = RowRenderer(simple_template)
        pdf = renderer.render(row_data)
        job = virtual_printer.receive_pdf(pdf)
        assert job.is_valid
        assert job.language == CommandLanguage.PDF

    def test_unsupported_language(self):
        """Printer that only supports TSPL should reject ZPL."""
        tspl_only = VirtualPrinter(
            name="TSPL Only",
            supported_languages=[CommandLanguage.TSPL],
        )
        zpl_data = b"^XA\n^FO10,10^A0N,20,20^FDHello^FS\n^XZ\n"
        job = tspl_only.receive(zpl_data)
        assert not job.is_valid
        assert any("not supported" in e for e in job.errors)

    def test_get_all_texts(self, virtual_printer):
        virtual_printer.receive(
            b"SIZE 50 mm, 30 mm\r\nCLS\r\n"
            b'TEXT 10,10,"3",0,1,1,"First"\r\nPRINT 1,1\r\n'
        )
        virtual_printer.receive(
            b"SIZE 50 mm, 30 mm\r\nCLS\r\n"
            b'TEXT 10,10,"3",0,1,1,"Second"\r\nPRINT 1,1\r\n'
        )
        assert virtual_printer.get_all_texts() == ["First", "Second"]

    def test_get_all_barcodes(self, virtual_printer):
        virtual_printer.receive(
            b"SIZE 50 mm, 30 mm\r\nCLS\r\n"
            b'BARCODE 10,50,"128M",80,1,0,2,4,"BC001"\r\nPRINT 1,1\r\n'
        )
        assert virtual_printer.get_all_barcodes() == ["BC001"]

    def test_clear(self, virtual_printer):
        virtual_printer.receive(b"SIZE 50 mm, 30 mm\r\nCLS\r\nPRINT 1,1\r\n")
        assert virtual_printer.job_count == 1
        virtual_printer.clear()
        assert virtual_printer.job_count == 0
        assert virtual_printer.total_bytes_received == 0

    def test_byte_count(self, virtual_printer):
        data = b"SIZE 50 mm, 30 mm\r\nCLS\r\nPRINT 1,1\r\n"
        virtual_printer.receive(data)
        assert virtual_printer.total_bytes_received == len(data)


# ══════════════════════════════════════════════════════════════════
# 10. Simulated Dispatcher
# ══════════════════════════════════════════════════════════════════

class TestSimulatedDispatcher:
    """Test the SimulatedDispatcher (drop-in for real dispatchers)."""

    def test_list_printers(self, dispatcher):
        printers = dispatcher.list_printers()
        assert len(printers) >= 5
        assert "Zebra ZD420" in printers
        assert "TOSHIBA B-FV4 (203 dpi)" in printers
        assert "HP LaserJet Pro" in printers
        assert "Microsoft Print to PDF" in printers

    def test_default_printer(self, dispatcher):
        assert dispatcher.get_default_printer() == "HP LaserJet Pro"

    def test_print_pdf_to_any_printer(self, dispatcher, simple_template, row_data):
        """PDF should be accepted by ALL printers."""
        renderer = RowRenderer(simple_template)
        pdf = renderer.render(row_data)

        for printer_name in dispatcher.list_printers():
            assert dispatcher.print_pdf(pdf, printer_name)

    def test_print_tspl_to_toshiba(self, dispatcher, simple_template, row_data):
        """Raw TSPL should be accepted by Toshiba printers."""
        renderer = TsplRenderer(simple_template)
        raw = renderer.render(row_data)

        assert dispatcher.print_raw(raw, "TOSHIBA B-FV4 (203 dpi)")

        vp = dispatcher.get_printer("TOSHIBA B-FV4 (203 dpi)")
        assert vp.job_count == 1
        assert vp.last_job.is_valid

    def test_print_zpl_to_zebra(self, dispatcher, simple_template, row_data):
        """Raw ZPL should be accepted by Zebra printers."""
        renderer = ZplRenderer(simple_template)
        raw = renderer.render(row_data)

        assert dispatcher.print_raw(raw, "Zebra ZD420")

        vp = dispatcher.get_printer("Zebra ZD420")
        assert vp.job_count == 1
        assert vp.last_job.is_valid

    def test_print_raw_to_wrong_printer_fails(self, dispatcher, simple_template, row_data):
        """Sending TSPL to a Zebra printer should fail."""
        renderer = TsplRenderer(simple_template)
        raw = renderer.render(row_data)

        with pytest.raises(RuntimeError, match="Invalid"):
            dispatcher.print_raw(raw, "Zebra ZD420")

    def test_print_to_nonexistent_printer(self, dispatcher, simple_template, row_data):
        renderer = RowRenderer(simple_template)
        pdf = renderer.render(row_data)

        with pytest.raises(ValueError, match="not found"):
            dispatcher.print_pdf(pdf, "Nonexistent Printer")

    def test_add_custom_printer(self, dispatcher):
        vp = dispatcher.add_printer("Custom Label Printer", [CommandLanguage.TSPL])
        assert "Custom Label Printer" in dispatcher.list_printers()
        assert isinstance(vp, VirtualPrinter)

    def test_multi_copy_print(self, dispatcher, simple_template, row_data):
        renderer = RowRenderer(simple_template)
        pdf = renderer.render(row_data)

        dispatcher.print_pdf(pdf, "HP LaserJet Pro", copies=3)

        vp = dispatcher.get_printer("HP LaserJet Pro")
        assert vp.job_count == 3

    def test_inspect_printed_content(self, dispatcher, simple_template, row_data):
        """After printing, we can inspect what was actually sent."""
        renderer = TsplRenderer(simple_template)
        raw = renderer.render(row_data)

        dispatcher.print_raw(raw, "TSC TE200")

        vp = dispatcher.get_printer("TSC TE200")
        assert vp.get_all_texts() == ["Widget X-700"]
        assert vp.get_all_barcodes() == ["WDG700001"]


# ══════════════════════════════════════════════════════════════════
# 11. Cross-Language Consistency
# ══════════════════════════════════════════════════════════════════

class TestCrossLanguageConsistency:
    """Verify the same template renders consistently across languages."""

    def test_same_data_all_renderers(self, simple_template, row_data):
        """All renderers should produce the same text/barcode data."""
        tspl_raw = TsplRenderer(simple_template).render(row_data)
        zpl_raw = ZplRenderer(simple_template).render(row_data)
        pdf_raw = RowRenderer(simple_template).render(row_data)

        printer = VirtualPrinter("Multi-Language")

        tspl_job = printer.receive(tspl_raw)
        zpl_job = printer.receive(zpl_raw)
        pdf_job = printer.receive(pdf_raw)

        # All should be valid
        assert tspl_job.is_valid
        assert zpl_job.is_valid
        assert pdf_job.is_valid

        # Text and barcode data should match across TSPL and ZPL
        # (PDF doesn't expose text through our basic parser)
        assert "Widget X-700" in tspl_job.get_texts()
        assert "Widget X-700" in zpl_job.get_texts()
        assert "WDG700001" in tspl_job.get_barcodes()
        assert "WDG700001" in zpl_job.get_barcodes()

    def test_label_dimensions_consistent(self, simple_template, row_data):
        """TSPL and ZPL should report similar label dimensions."""
        tspl_raw = TsplRenderer(simple_template).render(row_data)
        zpl_raw = ZplRenderer(simple_template).render(row_data)

        tspl_job = TsplParser().parse(tspl_raw)
        zpl_job = ZplParser().parse(zpl_raw)

        tspl_label = tspl_job.labels[0]
        zpl_label = zpl_job.labels[0]

        # TSPL uses exact mm, ZPL derives from dots
        assert tspl_label.width_mm == pytest.approx(77.5, abs=0.1)
        assert zpl_label.width_mm == pytest.approx(77.5, abs=1.0)


# ══════════════════════════════════════════════════════════════════
# 12. Edge Cases & Error Handling
# ══════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Test edge cases and error recovery."""

    def test_unicode_text(self, tspl_printer):
        """Unicode characters should be handled."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="unicode", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value="Ünîcödé",
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"unicode": "Ünîcödé"})
        job = tspl_printer.receive(raw)
        assert job.is_valid

    def test_special_characters_in_barcode(self, tspl_printer):
        """Barcode data with special chars."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="bc", type="barcode",
                    x_mm=5, y_mm=5, width_mm=40, height_mm=15,
                    value="ABC-123/456", symbology="code128",
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"bc": "ABC-123/456"})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        assert "ABC-123/456" in job.get_barcodes()

    def test_very_small_label(self, tspl_printer):
        """Extremely small label should still render."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=10, height_mm=5, dpi=203),
            elements=[
                CanvasElement(
                    id="t", type="text",
                    x_mm=1, y_mm=1, width_mm=8, height_mm=3,
                    font_size=6, value="TINY",
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"t": "TINY"})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        assert "TINY" in job.get_texts()

    def test_very_large_label(self, virtual_printer):
        """Large label (A4 size) should work."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=210, height_mm=297, dpi=203),
            elements=[
                CanvasElement(
                    id="t", type="text",
                    x_mm=10, y_mm=10, width_mm=190, height_mm=20,
                    font_size=24, value="LARGE LABEL",
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"t": "LARGE LABEL"})
        job = virtual_printer.receive(raw)
        assert job.is_valid

    def test_quote_in_text(self, tspl_printer):
        """Double quotes in text should be escaped."""
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="t", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value='Hello "World"',
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"t": 'He said "yes"'})
        # Should not crash and should produce valid TSPL
        job = tspl_printer.receive(raw)
        assert job.is_valid

    def test_zero_rotation(self, tspl_printer):
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="t", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value="No Rotation", rotation=0,
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"t": "No Rotation"})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        text_elems = [e for l in job.labels for e in l.elements if e.element_type == "text"]
        assert text_elems[0].rotation == 0

    def test_90_degree_rotation(self, tspl_printer):
        template = TemplateDocument(
            label=LabelConfig(width_mm=50, height_mm=30, dpi=203),
            elements=[
                CanvasElement(
                    id="t", type="text",
                    x_mm=5, y_mm=5, width_mm=30, height_mm=8,
                    font_size=12, value="Rotated", rotation=90,
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"t": "Rotated"})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        text_elems = [e for l in job.labels for e in l.elements if e.element_type == "text"]
        assert text_elems[0].rotation == 90


# ══════════════════════════════════════════════════════════════════
# 13. Symbology Coverage
# ══════════════════════════════════════════════════════════════════

class TestSymbologyCoverage:
    """Test various barcode symbologies through the full pipeline."""

    SYMBOLOGIES = [
        ("code128", "ABC123"),
        ("code39", "ABC123"),
        ("ean13", "5901234123457"),
        ("ean8", "96385074"),
        ("upca", "012345678905"),
        ("codabar", "A12345B"),
        ("code93", "TEST93"),
    ]

    @pytest.mark.parametrize("sym,data", SYMBOLOGIES)
    def test_tspl_symbology(self, sym, data, tspl_printer):
        template = TemplateDocument(
            label=LabelConfig(width_mm=60, height_mm=40, dpi=203),
            elements=[
                CanvasElement(
                    id="bc", type="barcode",
                    x_mm=5, y_mm=5, width_mm=50, height_mm=20,
                    value=data, symbology=sym,
                ),
            ],
        )
        renderer = TsplRenderer(template)
        raw = renderer.render({"bc": data})
        job = tspl_printer.receive(raw)
        assert job.is_valid
        assert data in job.get_barcodes()

    @pytest.mark.parametrize("sym,data", [
        ("code128", "ABC123"),
        ("ean13", "5901234123457"),
        ("qrcode", "https://example.com"),
    ])
    def test_zpl_symbology(self, sym, data, zpl_printer):
        elem_type = "qrcode" if sym == "qrcode" else "barcode"
        template = TemplateDocument(
            label=LabelConfig(width_mm=60, height_mm=40, dpi=203),
            elements=[
                CanvasElement(
                    id="bc", type=elem_type,
                    x_mm=5, y_mm=5, width_mm=50, height_mm=20,
                    value=data, symbology=sym,
                ),
            ],
        )
        renderer = ZplRenderer(template)
        raw = renderer.render({"bc": data})
        job = zpl_printer.receive(raw)
        assert job.is_valid
