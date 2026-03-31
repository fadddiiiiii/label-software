# FILE: omg/ui/properties_panel.py
# Properties Panel — SEC 10 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Right sidebar showing editable properties for the selected element.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Optional

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QGroupBox, QLabel,
    QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox, QCheckBox,
    QPushButton, QColorDialog,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor

from omg.core.template_engine import TemplateEngine, CanvasElement
from omg.core.barcode_engine import BarcodeRenderer


class PropertiesPanel(QWidget):
    """Right sidebar for editing selected element properties."""

    def __init__(self, engine: TemplateEngine, parent=None):
        super().__init__(parent)
        self.engine = engine
        self.setMinimumWidth(220)
        self.setMaximumWidth(280)
        self._current_elem_id: Optional[str] = None
        self._build_ui()
        self.engine.add_observer(self._on_template_event)

    def _build_ui(self) -> None:
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(8, 8, 8, 8)

        self._no_selection_label = QLabel("Select an element to edit its properties")
        self._no_selection_label.setWordWrap(True)
        self._no_selection_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.main_layout.addWidget(self._no_selection_label)

        # Properties form (hidden until selection)
        self._props_widget = QWidget()
        self._props_layout = QVBoxLayout(self._props_widget)
        self._props_layout.setContentsMargins(0, 0, 0, 0)

        # ── Position / Size group ──
        pos_group = QGroupBox("Position && Size")
        pos_form = QFormLayout(pos_group)

        self.x_spin = QDoubleSpinBox()
        self.x_spin.setRange(0, 500)
        self.x_spin.setSuffix(" mm")
        self.x_spin.setDecimals(1)
        self.x_spin.valueChanged.connect(lambda v: self._set_prop("x_mm", v))
        pos_form.addRow("X:", self.x_spin)

        self.y_spin = QDoubleSpinBox()
        self.y_spin.setRange(0, 500)
        self.y_spin.setSuffix(" mm")
        self.y_spin.setDecimals(1)
        self.y_spin.valueChanged.connect(lambda v: self._set_prop("y_mm", v))
        pos_form.addRow("Y:", self.y_spin)

        self.w_spin = QDoubleSpinBox()
        self.w_spin.setRange(1, 500)
        self.w_spin.setSuffix(" mm")
        self.w_spin.setDecimals(1)
        self.w_spin.valueChanged.connect(lambda v: self._set_prop("width_mm", v))
        pos_form.addRow("Width:", self.w_spin)

        self.h_spin = QDoubleSpinBox()
        self.h_spin.setRange(1, 500)
        self.h_spin.setSuffix(" mm")
        self.h_spin.setDecimals(1)
        self.h_spin.valueChanged.connect(lambda v: self._set_prop("height_mm", v))
        pos_form.addRow("Height:", self.h_spin)

        self._props_layout.addWidget(pos_group)

        # ── Text group ──
        self.text_group = QGroupBox("Text")
        text_form = QFormLayout(self.text_group)

        self.value_edit = QLineEdit()
        self.value_edit.textChanged.connect(lambda v: self._set_prop("value", v))
        text_form.addRow("Value:", self.value_edit)

        self.font_name_combo = QComboBox()
        self.font_name_combo.addItems([
            "Helvetica", "Courier", "Times-Roman",
            "Arial", "Verdana", "Tahoma",
        ])
        self.font_name_combo.currentTextChanged.connect(
            lambda v: self._set_prop("font_name", v))
        text_form.addRow("Font:", self.font_name_combo)

        self.font_size_spin = QSpinBox()
        self.font_size_spin.setRange(4, 200)
        self.font_size_spin.setValue(12)
        self.font_size_spin.setSuffix(" pt")
        self.font_size_spin.valueChanged.connect(
            lambda v: self._set_prop("font_size", v))
        text_form.addRow("Size:", self.font_size_spin)

        self.align_combo = QComboBox()
        self.align_combo.addItems(["left", "center", "right"])
        self.align_combo.currentTextChanged.connect(
            lambda v: self._set_prop("align", v))
        text_form.addRow("Align:", self.align_combo)

        self.color_btn = QPushButton("  ■ Color")
        self.color_btn.clicked.connect(self._pick_color)
        text_form.addRow("Color:", self.color_btn)

        self._props_layout.addWidget(self.text_group)

        # ── Barcode group ──
        self.barcode_group = QGroupBox("Barcode")
        bc_form = QFormLayout(self.barcode_group)

        self.symbology_combo = QComboBox()
        self.symbology_combo.addItems(BarcodeRenderer.get_supported_symbologies())
        self.symbology_combo.currentTextChanged.connect(
            lambda v: self._set_prop("symbology", v))
        bc_form.addRow("Symbology:", self.symbology_combo)

        self.show_text_check = QCheckBox("Show human-readable text")
        self.show_text_check.stateChanged.connect(
            lambda st: self._set_prop("show_text", st == Qt.CheckState.Checked.value))
        bc_form.addRow(self.show_text_check)

        self._props_layout.addWidget(self.barcode_group)

        # ── Shape group ──
        self.shape_group = QGroupBox("Shape")
        shape_form = QFormLayout(self.shape_group)

        self.border_width_spin = QSpinBox()
        self.border_width_spin.setRange(0, 10)
        self.border_width_spin.setValue(1)
        self.border_width_spin.setSuffix(" pt")
        self.border_width_spin.valueChanged.connect(
            lambda v: self._set_prop("border_width", v))
        shape_form.addRow("Border:", self.border_width_spin)

        self.filled_check = QCheckBox("Filled")
        self.filled_check.stateChanged.connect(
            lambda st: self._set_prop("filled", st == Qt.CheckState.Checked.value))
        shape_form.addRow(self.filled_check)

        self._props_layout.addWidget(self.shape_group)

        # ── Binding group ──
        self.bind_group = QGroupBox("Data Binding")
        bind_form = QFormLayout(self.bind_group)

        self.bind_label = QLabel("Not bound")
        bind_form.addRow("Status:", self.bind_label)

        self.formula_edit = QLineEdit()
        self.formula_edit.setPlaceholderText("e.g. upper({PartNumber})")
        bind_form.addRow("Formula:", self.formula_edit)

        self._props_layout.addWidget(self.bind_group)

        self._props_layout.addStretch()
        self._props_widget.hide()
        self.main_layout.addWidget(self._props_widget)

    def show_element(self, elem_id: str) -> None:
        """Show properties for the specified element."""
        if not self.engine.document:
            return

        elem = self.engine.document.get_element(elem_id)
        if not elem:
            self.clear()
            return

        self._current_elem_id = elem_id
        self._no_selection_label.hide()
        self._props_widget.show()

        # Block signals during population
        for w in [self.x_spin, self.y_spin, self.w_spin, self.h_spin,
                  self.value_edit, self.font_size_spin]:
            w.blockSignals(True)

        # Position
        self.x_spin.setValue(elem.x_mm)
        self.y_spin.setValue(elem.y_mm)
        self.w_spin.setValue(elem.width_mm)
        self.h_spin.setValue(elem.height_mm)

        # Value
        self.value_edit.setText(elem.value)

        # Font
        self.font_name_combo.setCurrentText(elem.font_name)
        self.font_size_spin.setValue(elem.font_size)
        self.align_combo.setCurrentText(elem.align)

        # Show/hide type-specific groups
        is_text = elem.type == "text"
        is_barcode = elem.type in ("barcode", "qrcode")
        is_shape = elem.type in ("rect", "line")

        self.text_group.setVisible(is_text or is_barcode)
        self.barcode_group.setVisible(is_barcode)
        self.shape_group.setVisible(is_shape)
        self.bind_group.setVisible(is_text or is_barcode)

        if is_barcode:
            self.symbology_combo.setCurrentText(elem.symbology or "code128")
            self.show_text_check.setChecked(elem.show_text)

        if is_shape:
            self.border_width_spin.setValue(int(elem.border_width))
            self.filled_check.setChecked(elem.filled)

        # Binding info
        if elem.binding:
            self.bind_label.setText(
                f"Bound: {elem.binding.source_id}/{elem.binding.column}")
            self.formula_edit.setText(elem.binding.formula or "")
        else:
            self.bind_label.setText("Not bound")
            self.formula_edit.clear()

        for w in [self.x_spin, self.y_spin, self.w_spin, self.h_spin,
                  self.value_edit, self.font_size_spin]:
            w.blockSignals(False)

    def clear(self) -> None:
        """Clear the panel when nothing is selected."""
        self._current_elem_id = None
        self._props_widget.hide()
        self._no_selection_label.show()

    def _set_prop(self, prop: str, value) -> None:
        """Apply a property change to the current element."""
        if not self._current_elem_id or not self.engine.document:
            return
        try:
            self.engine.edit_element(self._current_elem_id, prop, value)
        except Exception:
            pass

    def _pick_color(self) -> None:
        if not self._current_elem_id or not self.engine.document:
            return
        elem = self.engine.document.get_element(self._current_elem_id)
        if not elem:
            return

        color = QColorDialog.getColor(QColor(elem.color), self, "Pick Color")
        if color.isValid():
            self._set_prop("color", color.name())
            self.color_btn.setStyleSheet(f"background-color: {color.name()};")

    def _on_template_event(self, event: str, doc) -> None:
        if event == "changed" and self._current_elem_id and doc:
            elem = doc.get_element(self._current_elem_id)
            if elem:
                self.show_element(self._current_elem_id)
