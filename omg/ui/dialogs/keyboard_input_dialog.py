# FILE: omg/ui/dialogs/keyboard_input_dialog.py
# GAP-02: Keyboard Input Dialog
# ═══════════════════════════════════════════════════════════════════
# Shown before a batch print job starts if any field has a
# KeyboardBinding. Collects one typed value per keyboard-bound field
# from the operator. Returns a dict: {field_id: entered_value}
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Dict, List

from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLabel,
    QLineEdit, QDialogButtonBox
)


class KeyboardInputDialog(QDialog):
    """Prompts the operator for keyboard-entered values before printing."""

    def __init__(self, keyboard_bindings: list, parent=None):
        """
        Args:
            keyboard_bindings: List of KeyboardBinding objects with
                               field_id, prompt_label, default_value
        """
        super().__init__(parent)
        self.setWindowTitle("Enter Print Values")
        self.setMinimumWidth(400)
        self._inputs: Dict[str, QLineEdit] = {}

        layout = QVBoxLayout()
        layout.addWidget(QLabel(
            "The following values are required before printing begins."
        ))

        form = QFormLayout()
        for binding in keyboard_bindings:
            line = QLineEdit(binding.default_value)
            line.setPlaceholderText(binding.prompt_label)
            form.addRow(binding.prompt_label + ":", line)
            self._inputs[binding.field_id] = line

        layout.addLayout(form)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok |
            QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self.setLayout(layout)

    def get_values(self) -> Dict[str, str]:
        """Call after exec() returns QDialog.Accepted."""
        return {fid: widget.text() for fid, widget in self._inputs.items()}
