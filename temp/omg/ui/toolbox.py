# FILE: omg/ui/toolbox.py
# Toolbox Panel — SEC 10 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QLabel, QGroupBox,
    QSpinBox, QDoubleSpinBox, QComboBox, QFormLayout,
)
from PyQt6.QtCore import Qt

from omg.core.template_engine import TemplateEngine, CanvasElement


class ToolboxPanel(QWidget):
    """Left sidebar panel with insert tools and label settings."""

    def __init__(self, engine: TemplateEngine, parent=None):
        super().__init__(parent)
        self.engine = engine
        self.setMinimumWidth(200)
        self.setMaximumWidth(260)
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(12)

        # ── Insert Elements ──
        insert_group = QGroupBox("Insert Elements")
        insert_layout = QVBoxLayout(insert_group)

        btn_text = QPushButton("A  Text Field")
        btn_text.clicked.connect(lambda: self._insert("text"))
        insert_layout.addWidget(btn_text)

        btn_barcode = QPushButton("▮  Barcode")
        btn_barcode.clicked.connect(lambda: self._insert("barcode"))
        insert_layout.addWidget(btn_barcode)

        btn_qr = QPushButton("◻  QR Code")
        btn_qr.clicked.connect(lambda: self._insert("qrcode"))
        insert_layout.addWidget(btn_qr)

        btn_image = QPushButton("🖼  Image")
        btn_image.clicked.connect(lambda: self._insert("image"))
        insert_layout.addWidget(btn_image)

        btn_rect = QPushButton("▭  Rectangle")
        btn_rect.clicked.connect(lambda: self._insert("rect"))
        insert_layout.addWidget(btn_rect)

        btn_line = QPushButton("—  Line")
        btn_line.clicked.connect(lambda: self._insert("line"))
        insert_layout.addWidget(btn_line)

        layout.addWidget(insert_group)

        # ── Label Settings ──
        label_group = QGroupBox("Label Size")
        label_form = QFormLayout(label_group)

        self.width_spin = QDoubleSpinBox()
        self.width_spin.setRange(10, 500)
        self.width_spin.setSuffix(" mm")
        self.width_spin.setDecimals(1)
        self.width_spin.setValue(100.0)
        self.width_spin.valueChanged.connect(self._on_label_size_changed)
        label_form.addRow("Width:", self.width_spin)

        self.height_spin = QDoubleSpinBox()
        self.height_spin.setRange(10, 500)
        self.height_spin.setSuffix(" mm")
        self.height_spin.setDecimals(1)
        self.height_spin.setValue(70.0)
        self.height_spin.valueChanged.connect(self._on_label_size_changed)
        label_form.addRow("Height:", self.height_spin)

        self.dpi_combo = QComboBox()
        self.dpi_combo.addItems(["150", "200", "203", "300", "600"])
        self.dpi_combo.setCurrentText("300")
        self.dpi_combo.currentTextChanged.connect(self._on_dpi_changed)
        label_form.addRow("DPI:", self.dpi_combo)

        layout.addWidget(label_group)

        # ── Presets ──
        preset_group = QGroupBox("Label Presets")
        preset_layout = QVBoxLayout(preset_group)

        presets = [
            ("4″ × 6″ Shipping", 101.6, 152.4),
            ("2″ × 1″ Product", 50.8, 25.4),
            ("4″ × 3″ GHS", 101.6, 76.2),
            ("100 × 70 mm", 100.0, 70.0),
            ("148 × 105 mm (A6)", 148.0, 105.0),
        ]
        for label, w, h in presets:
            btn = QPushButton(label)
            btn.clicked.connect(lambda _, w=w, h=h: self._apply_preset(w, h))
            preset_layout.addWidget(btn)

        layout.addWidget(preset_group)

        layout.addStretch()

        # Sync with engine
        self.engine.add_observer(self._on_template_event)

    def _insert(self, elem_type: str) -> None:
        defaults = {
            "text": {"width_mm": 40, "height_mm": 10, "value": "Text"},
            "barcode": {"width_mm": 50, "height_mm": 15, "value": "12345678", "symbology": "code128"},
            "qrcode": {"width_mm": 20, "height_mm": 20, "value": "https://example.com", "symbology": "qrcode"},
            "image": {"width_mm": 30, "height_mm": 30},
            "rect": {"width_mm": 30, "height_mm": 20},
            "line": {"width_mm": 50, "height_mm": 1},
        }
        kwargs = defaults.get(elem_type, {})
        elem = CanvasElement(type=elem_type, x_mm=10, y_mm=10, **kwargs)
        self.engine.add_element(elem)

    def _on_label_size_changed(self) -> None:
        if self.engine.document:
            self.engine.document.label.width_mm = self.width_spin.value()
            self.engine.document.label.height_mm = self.height_spin.value()
            self.engine.document.dirty = True
            self.engine._notify("changed")

    def _on_dpi_changed(self, text: str) -> None:
        if self.engine.document:
            self.engine.document.label.dpi = int(text)

    def _apply_preset(self, w: float, h: float) -> None:
        self.width_spin.setValue(w)
        self.height_spin.setValue(h)

    def _on_template_event(self, event: str, doc) -> None:
        if doc:
            self.width_spin.blockSignals(True)
            self.height_spin.blockSignals(True)
            self.width_spin.setValue(doc.label.width_mm)
            self.height_spin.setValue(doc.label.height_mm)
            self.width_spin.blockSignals(False)
            self.height_spin.blockSignals(False)
