# FILE: omg/ui/main_window.py
# Main Window — SEC 10 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Central application window with menu bar, toolbox sidebar,
# canvas center, properties panel right, and status bar.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Optional

from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QMenuBar, QMenu, QToolBar, QStatusBar, QSplitter,
    QDockWidget, QLabel, QFileDialog, QMessageBox,
)
from PyQt6.QtCore import Qt, QSize, pyqtSignal
from PyQt6.QtGui import QAction, QKeySequence
from loguru import logger

from omg.core.template_engine import TemplateEngine, CanvasElement, TemplateDocument
from omg.db.db_manager import DbManager
from omg.platform_utils import get_db_path, IS_MACOS


class MainWindow(QMainWindow):
    """OMG main application window."""

    # Signals
    template_changed = pyqtSignal()
    status_message = pyqtSignal(str, int)  # message, timeout_ms

    def __init__(self, engine: Optional[TemplateEngine] = None,
                 db: Optional[DbManager] = None):
        super().__init__()

        self.engine = engine or TemplateEngine()
        self.db = db or DbManager(get_db_path())

        self.setWindowTitle("OMG — Professional Label Intelligence Platform")
        self.setMinimumSize(1280, 800)
        self.resize(1440, 900)

        # Register as template observer
        self.engine.add_observer(self._on_template_event)

        # Build UI
        self._create_menus()
        self._create_toolbar()
        self._create_central_area()
        self._create_dock_panels()
        self._create_status_bar()

        # Initialize with a new blank template
        self.engine.new()

        logger.info("MainWindow initialized")

    # ── Menu Bar ─────────────────────────────────────────────────────

    def _create_menus(self) -> None:
        menu_bar = self.menuBar()

        # File menu
        file_menu = menu_bar.addMenu("&File")
        self._add_action(file_menu, "&New", self._on_new, QKeySequence.StandardKey.New)
        self._add_action(file_menu, "&Open...", self._on_open, QKeySequence.StandardKey.Open)
        file_menu.addSeparator()
        self._add_action(file_menu, "&Save", self._on_save, QKeySequence.StandardKey.Save)
        self._add_action(file_menu, "Save &As...", self._on_save_as,
                         QKeySequence("Ctrl+Shift+S"))
        file_menu.addSeparator()
        self._add_action(file_menu, "E&xport PDF...", self._on_export_pdf,
                         QKeySequence("Ctrl+E"))
        file_menu.addSeparator()
        if not IS_MACOS:
            self._add_action(file_menu, "E&xit", self.close, QKeySequence("Alt+F4"))

        # Edit menu
        edit_menu = menu_bar.addMenu("&Edit")
        self._undo_action = self._add_action(
            edit_menu, "&Undo", self._on_undo, QKeySequence.StandardKey.Undo)
        self._redo_action = self._add_action(
            edit_menu, "&Redo", self._on_redo, QKeySequence.StandardKey.Redo)
        edit_menu.addSeparator()
        self._add_action(edit_menu, "Cu&t", self._on_cut, QKeySequence.StandardKey.Cut)
        self._add_action(edit_menu, "&Copy", self._on_copy, QKeySequence.StandardKey.Copy)
        self._add_action(edit_menu, "&Paste", self._on_paste, QKeySequence.StandardKey.Paste)
        self._add_action(edit_menu, "&Delete", self._on_delete, QKeySequence.StandardKey.Delete)

        # Insert menu
        insert_menu = menu_bar.addMenu("&Insert")
        self._add_action(insert_menu, "&Text Field", self._on_insert_text)
        self._add_action(insert_menu, "&Barcode", self._on_insert_barcode)
        self._add_action(insert_menu, "&QR Code", self._on_insert_qrcode)
        self._add_action(insert_menu, "&Image", self._on_insert_image)
        insert_menu.addSeparator()
        self._add_action(insert_menu, "&Rectangle", self._on_insert_rect)
        self._add_action(insert_menu, "&Line", self._on_insert_line)

        # Data menu
        data_menu = menu_bar.addMenu("&Data")
        self._add_action(data_menu, "Attach &Data Source...", self._on_attach_data)
        self._add_action(data_menu, "&Bind Fields...", self._on_bind_fields)
        data_menu.addSeparator()
        self._add_action(data_menu, "&Preview Row...", self._on_preview_row)

        # Print menu
        print_menu = menu_bar.addMenu("&Print")
        self._add_action(print_menu, "&Print...", self._on_print, QKeySequence.StandardKey.Print)
        self._add_action(print_menu, "Print &Console", self._on_print_console)
        print_menu.addSeparator()
        self._add_action(print_menu, "Print &History", self._on_print_history)

        # View menu
        view_menu = menu_bar.addMenu("&View")
        self._add_action(view_menu, "Zoom &In", self._on_zoom_in, QKeySequence("Ctrl+="))
        self._add_action(view_menu, "Zoom &Out", self._on_zoom_out, QKeySequence("Ctrl+-"))
        self._add_action(view_menu, "&Fit to Window", self._on_zoom_fit, QKeySequence("Ctrl+0"))
        view_menu.addSeparator()
        self._add_action(view_menu, "Show &Grid", self._on_toggle_grid)

        # Help menu
        help_menu = menu_bar.addMenu("&Help")
        self._add_action(help_menu, "&About OMG", self._on_about)

    def _add_action(self, menu: QMenu, text: str, slot,
                    shortcut=None) -> QAction:
        action = QAction(text, self)
        if shortcut:
            action.setShortcut(shortcut)
        action.triggered.connect(slot)
        menu.addAction(action)
        return action

    # ── Toolbar ──────────────────────────────────────────────────────

    def _create_toolbar(self) -> None:
        self.toolbar = QToolBar("Main Toolbar")
        self.toolbar.setMovable(False)
        self.toolbar.setIconSize(QSize(20, 20))
        self.addToolBar(self.toolbar)

        # Add toolbar buttons
        self.toolbar.addAction("📄 New").triggered.connect(self._on_new)
        self.toolbar.addAction("📂 Open").triggered.connect(self._on_open)
        self.toolbar.addAction("💾 Save").triggered.connect(self._on_save)
        self.toolbar.addSeparator()
        self.toolbar.addAction("↩️ Undo").triggered.connect(self._on_undo)
        self.toolbar.addAction("↪️ Redo").triggered.connect(self._on_redo)
        self.toolbar.addSeparator()
        self.toolbar.addAction("A Text").triggered.connect(self._on_insert_text)
        self.toolbar.addAction("▮ Barcode").triggered.connect(self._on_insert_barcode)
        self.toolbar.addAction("◻ QR").triggered.connect(self._on_insert_qrcode)
        self.toolbar.addAction("🖼 Image").triggered.connect(self._on_insert_image)
        self.toolbar.addSeparator()
        self.toolbar.addAction("🖨 Print").triggered.connect(self._on_print)

    # ── Central Area (Canvas) ────────────────────────────────────────

    def _create_central_area(self) -> None:
        from omg.ui.canvas_renderer import CanvasWidget

        self.canvas = CanvasWidget(self.engine)
        self.setCentralWidget(self.canvas)

    # ── Dock Panels ──────────────────────────────────────────────────

    def _create_dock_panels(self) -> None:
        # Left dock: Toolbox
        from omg.ui.toolbox import ToolboxPanel
        self.toolbox_dock = QDockWidget("Toolbox", self)
        self.toolbox_dock.setAllowedAreas(Qt.DockWidgetArea.LeftDockWidgetArea)
        self.toolbox_panel = ToolboxPanel(self.engine)
        self.toolbox_dock.setWidget(self.toolbox_panel)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, self.toolbox_dock)

        # Right dock: Properties
        from omg.ui.properties_panel import PropertiesPanel
        self.properties_dock = QDockWidget("Properties", self)
        self.properties_dock.setAllowedAreas(Qt.DockWidgetArea.RightDockWidgetArea)
        self.properties_panel = PropertiesPanel(self.engine)
        self.properties_dock.setWidget(self.properties_panel)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, self.properties_dock)

    # ── Status Bar ───────────────────────────────────────────────────

    def _create_status_bar(self) -> None:
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)

        self._status_label = QLabel("Ready")
        self._zoom_label = QLabel("100%")
        self._element_count_label = QLabel("Elements: 0")

        self.status_bar.addWidget(self._status_label, 1)
        self.status_bar.addPermanentWidget(self._element_count_label)
        self.status_bar.addPermanentWidget(self._zoom_label)

    def _update_status_bar(self) -> None:
        if self.engine.document:
            count = len(self.engine.document.elements)
            self._element_count_label.setText(f"Elements: {count}")
            title = "OMG"
            if self.engine.document.file_path:
                from pathlib import Path
                title += f" — {Path(self.engine.document.file_path).name}"
            if self.engine.document.dirty:
                title += " •"
            self.setWindowTitle(title)

    # ── Template Observer ────────────────────────────────────────────

    def _on_template_event(self, event: str, doc: Optional[TemplateDocument]) -> None:
        self._update_status_bar()
        self.template_changed.emit()

    # ── File Actions ─────────────────────────────────────────────────

    def _on_new(self) -> None:
        if self.engine.document and self.engine.document.dirty:
            reply = QMessageBox.question(
                self, "Unsaved Changes",
                "Save changes before creating a new template?",
                QMessageBox.StandardButton.Save |
                QMessageBox.StandardButton.Discard |
                QMessageBox.StandardButton.Cancel,
            )
            if reply == QMessageBox.StandardButton.Save:
                self._on_save()
            elif reply == QMessageBox.StandardButton.Cancel:
                return

        self.engine.new()
        self._status_label.setText("New template created")

    def _on_open(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Template", "",
            "OMG Templates (*.lft);;All Files (*)"
        )
        if path:
            try:
                self.engine.load(path)
                self._status_label.setText(f"Loaded: {path}")
            except Exception as e:
                QMessageBox.critical(self, "Open Error", str(e))

    def _on_save(self) -> None:
        if self.engine.document and self.engine.document.file_path:
            self.engine.save()
            self._status_label.setText("Saved")
        else:
            self._on_save_as()

    def _on_save_as(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Template As", "",
            "OMG Templates (*.lft);;All Files (*)"
        )
        if path:
            if not path.endswith(".lft"):
                path += ".lft"
            self.engine.save(path)
            self._status_label.setText(f"Saved: {path}")

    def _on_export_pdf(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self, "Export PDF", "", "PDF Files (*.pdf)"
        )
        if path and self.engine.document:
            from omg.print.row_renderer import RowRenderer
            renderer = RowRenderer(self.engine.document)
            # Render with static values (no data binding)
            row_data = {e.id: e.value for e in self.engine.document.elements}
            pdf = renderer.render(row_data)
            from pathlib import Path
            Path(path).write_bytes(pdf)
            self._status_label.setText(f"PDF exported: {path}")

    # ── Edit Actions ─────────────────────────────────────────────────

    def _on_undo(self) -> None:
        self.engine.undo()

    def _on_redo(self) -> None:
        self.engine.redo()

    def _on_cut(self) -> None:
        # TODO: Implement clipboard cut
        pass

    def _on_copy(self) -> None:
        # TODO: Implement clipboard copy
        pass

    def _on_paste(self) -> None:
        # TODO: Implement clipboard paste
        pass

    def _on_delete(self) -> None:
        if hasattr(self, 'canvas') and self.canvas.selected_element_id:
            self.engine.remove_element(self.canvas.selected_element_id)
            self.canvas.selected_element_id = None

    # ── Insert Actions ───────────────────────────────────────────────

    def _on_insert_text(self) -> None:
        elem = CanvasElement(type="text", x_mm=10, y_mm=10,
                             width_mm=40, height_mm=10, value="Text")
        self.engine.add_element(elem)
        self._status_label.setText(f"Text field added: {elem.id}")

    def _on_insert_barcode(self) -> None:
        elem = CanvasElement(type="barcode", x_mm=10, y_mm=25,
                             width_mm=50, height_mm=15, value="12345678",
                             symbology="code128")
        self.engine.add_element(elem)
        self._status_label.setText(f"Barcode added: {elem.id}")

    def _on_insert_qrcode(self) -> None:
        elem = CanvasElement(type="qrcode", x_mm=10, y_mm=25,
                             width_mm=20, height_mm=20,
                             value="https://example.com", symbology="qrcode")
        self.engine.add_element(elem)
        self._status_label.setText(f"QR Code added: {elem.id}")

    def _on_insert_image(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Select Image", "",
            "Images (*.png *.jpg *.jpeg *.bmp *.svg);;All Files (*)"
        )
        if path:
            elem = CanvasElement(type="image", x_mm=10, y_mm=10,
                                 width_mm=30, height_mm=30, image_path=path)
            self.engine.add_element(elem)
            self._status_label.setText(f"Image added: {elem.id}")

    def _on_insert_rect(self) -> None:
        elem = CanvasElement(type="rect", x_mm=10, y_mm=10,
                             width_mm=30, height_mm=20)
        self.engine.add_element(elem)

    def _on_insert_line(self) -> None:
        elem = CanvasElement(type="line", x_mm=10, y_mm=10,
                             width_mm=50, height_mm=1)
        self.engine.add_element(elem)

    # ── Data Actions ─────────────────────────────────────────────────

    def _on_attach_data(self) -> None:
        # TODO: Open DataSourceDialog
        self._status_label.setText("Data source dialog — not yet implemented")

    def _on_bind_fields(self) -> None:
        # TODO: Open BindingPanel
        self._status_label.setText("Binding panel — not yet implemented")

    def _on_preview_row(self) -> None:
        # TODO: Preview with live data
        self._status_label.setText("Row preview — not yet implemented")

    # ── Print Actions ────────────────────────────────────────────────

    def _on_print(self) -> None:
        # TODO: Open PrintConsole dialog
        self._status_label.setText("Print console — not yet implemented")

    def _on_print_console(self) -> None:
        self._status_label.setText("Print console — not yet implemented")

    def _on_print_history(self) -> None:
        self._status_label.setText("Print history — not yet implemented")

    # ── View Actions ─────────────────────────────────────────────────

    def _on_zoom_in(self) -> None:
        if hasattr(self, 'canvas'):
            self.canvas.zoom_in()
            self._zoom_label.setText(f"{int(self.canvas.zoom_level * 100)}%")

    def _on_zoom_out(self) -> None:
        if hasattr(self, 'canvas'):
            self.canvas.zoom_out()
            self._zoom_label.setText(f"{int(self.canvas.zoom_level * 100)}%")

    def _on_zoom_fit(self) -> None:
        if hasattr(self, 'canvas'):
            self.canvas.zoom_fit()
            self._zoom_label.setText(f"{int(self.canvas.zoom_level * 100)}%")

    def _on_toggle_grid(self) -> None:
        if hasattr(self, 'canvas'):
            self.canvas.show_grid = not self.canvas.show_grid
            self.canvas.update()

    # ── Help Actions ─────────────────────────────────────────────────

    def _on_about(self) -> None:
        QMessageBox.about(
            self, "About OMG",
            "<h2>OMG v1.0.0</h2>"
            "<p>Professional Label Intelligence Platform</p>"
            "<p>Design, manage, and print enterprise-grade barcode labels.</p>"
            "<p>Python 3.11 • PyQt6 • ReportLab</p>"
        )

    # ── Close Event ──────────────────────────────────────────────────

    def closeEvent(self, event) -> None:
        if self.engine.document and self.engine.document.dirty:
            reply = QMessageBox.question(
                self, "Quit",
                "Save changes before quitting?",
                QMessageBox.StandardButton.Save |
                QMessageBox.StandardButton.Discard |
                QMessageBox.StandardButton.Cancel,
            )
            if reply == QMessageBox.StandardButton.Save:
                self._on_save()
                event.accept()
            elif reply == QMessageBox.StandardButton.Discard:
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()
