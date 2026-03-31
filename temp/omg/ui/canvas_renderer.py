# FILE: omg/ui/canvas_renderer.py
# Canvas Renderer — SEC 10 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# QWidget-based WYSIWYG label canvas. Renders element outlines,
# selection handles, and live barcode previews. Supports drag-move,
# drag-resize, zoom, and grid overlay.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from typing import Optional

from PyQt6.QtWidgets import QWidget, QScrollArea, QVBoxLayout
from PyQt6.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt6.QtGui import (
    QPainter, QPen, QBrush, QColor, QFont, QPixmap, QPainterPath,
)
from loguru import logger

from omg.core.template_engine import TemplateEngine, TemplateDocument, CanvasElement
from omg.platform_utils import get_device_pixel_ratio


# ── Constants ────────────────────────────────────────────────────────

HANDLE_SIZE = 6  # pixels
CANVAS_MARGIN = 30  # pixels around the label
GRID_SPACING_MM = 5  # mm between grid lines


# ── Canvas Widget ────────────────────────────────────────────────────

class CanvasWidget(QWidget):
    """WYSIWYG label canvas with zoom, grid, and element interaction."""

    element_selected = pyqtSignal(str)       # element_id
    element_deselected = pyqtSignal()
    element_moved = pyqtSignal(str, float, float)  # id, x_mm, y_mm

    def __init__(self, engine: TemplateEngine, parent=None):
        super().__init__(parent)
        self.engine = engine
        self.engine.add_observer(self._on_template_event)

        # View state
        self.zoom_level: float = 1.0
        self.show_grid: bool = True
        self.selected_element_id: Optional[str] = None

        # Interaction state
        self._dragging = False
        self._drag_start: Optional[QPointF] = None
        self._drag_elem_start_x: float = 0
        self._drag_elem_start_y: float = 0
        self._resizing = False
        self._resize_handle: Optional[str] = None

        self.setMinimumSize(400, 300)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

    # ── Coordinate Helpers ───────────────────────────────────────────

    def _mm_to_px(self, mm_val: float) -> float:
        """Convert mm to pixels at current zoom assuming 96 DPI screen."""
        # 1mm = 96/25.4 px ≈ 3.78 px at 100% zoom
        return mm_val * (96 / 25.4) * self.zoom_level

    def _px_to_mm(self, px_val: float) -> float:
        """Convert pixels to mm at current zoom."""
        return px_val / ((96 / 25.4) * self.zoom_level)

    def _label_rect(self) -> QRectF:
        """Return the label area rectangle in widget pixels."""
        if not self.engine.document:
            return QRectF(0, 0, 0, 0)
        w = self._mm_to_px(self.engine.document.label.width_mm)
        h = self._mm_to_px(self.engine.document.label.height_mm)
        x = CANVAS_MARGIN
        y = CANVAS_MARGIN
        return QRectF(x, y, w, h)

    def _element_rect(self, elem: CanvasElement) -> QRectF:
        """Return element rect in widget pixels relative to label origin."""
        label = self._label_rect()
        x = label.x() + self._mm_to_px(elem.x_mm)
        y = label.y() + self._mm_to_px(elem.y_mm)
        w = self._mm_to_px(elem.width_mm)
        h = self._mm_to_px(elem.height_mm)
        return QRectF(x, y, w, h)

    # ── Zoom ─────────────────────────────────────────────────────────

    def zoom_in(self) -> None:
        self.zoom_level = min(self.zoom_level * 1.25, 5.0)
        self.update()

    def zoom_out(self) -> None:
        self.zoom_level = max(self.zoom_level / 1.25, 0.25)
        self.update()

    def zoom_fit(self) -> None:
        if not self.engine.document:
            return
        label_w = self._mm_to_px(self.engine.document.label.width_mm) / self.zoom_level
        label_h = self._mm_to_px(self.engine.document.label.height_mm) / self.zoom_level
        avail_w = self.width() - 2 * CANVAS_MARGIN
        avail_h = self.height() - 2 * CANVAS_MARGIN
        if label_w > 0 and label_h > 0:
            self.zoom_level = min(avail_w / label_w, avail_h / label_h)
        self.update()

    # ── Paint ────────────────────────────────────────────────────────

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Background
        painter.fillRect(self.rect(), QColor("#0D0F14"))

        if not self.engine.document:
            painter.end()
            return

        label_rect = self._label_rect()

        # Label paper area
        painter.fillRect(label_rect, QColor("#FFFFFF"))
        painter.setPen(QPen(QColor("#374151"), 1))
        painter.drawRect(label_rect)

        # Grid
        if self.show_grid:
            self._draw_grid(painter, label_rect)

        # Elements
        sorted_elements = sorted(
            self.engine.document.elements, key=lambda e: e.z_index
        )
        for elem in sorted_elements:
            self._draw_element(painter, elem)

        # Selection handles
        if self.selected_element_id:
            elem = self.engine.document.get_element(self.selected_element_id)
            if elem:
                self._draw_selection_handles(painter, elem)

        painter.end()

    def _draw_grid(self, painter: QPainter, label_rect: QRectF) -> None:
        """Draw a grid overlay on the label."""
        painter.setPen(QPen(QColor(200, 200, 200, 40), 0.5))
        step = self._mm_to_px(GRID_SPACING_MM)

        # Vertical lines
        x = label_rect.x()
        while x <= label_rect.right():
            painter.drawLine(
                int(x), int(label_rect.y()),
                int(x), int(label_rect.bottom())
            )
            x += step

        # Horizontal lines
        y = label_rect.y()
        while y <= label_rect.bottom():
            painter.drawLine(
                int(label_rect.x()), int(y),
                int(label_rect.right()), int(y)
            )
            y += step

    def _draw_element(self, painter: QPainter, elem: CanvasElement) -> None:
        """Draw a single canvas element."""
        rect = self._element_rect(elem)

        if elem.type == "text":
            # Text element
            painter.setPen(QPen(QColor(elem.color), 1))
            font = QFont(elem.font_name, int(elem.font_size * self.zoom_level))
            painter.setFont(font)

            align_flag = Qt.AlignmentFlag.AlignLeft
            if elem.align == "center":
                align_flag = Qt.AlignmentFlag.AlignHCenter
            elif elem.align == "right":
                align_flag = Qt.AlignmentFlag.AlignRight

            painter.drawText(
                rect.toRect(),
                int(align_flag | Qt.AlignmentFlag.AlignVCenter),
                elem.value or "[Text]"
            )

            # Dashed border
            painter.setPen(QPen(QColor(150, 150, 150, 80), 1, Qt.PenStyle.DashLine))
            painter.drawRect(rect)

        elif elem.type in ("barcode", "qrcode"):
            # Barcode placeholder
            painter.setPen(QPen(QColor("#000000"), 1))
            painter.setBrush(QBrush(QColor("#EEEEEE")))
            painter.drawRect(rect)

            # Label text
            font = QFont("Helvetica", max(8, int(9 * self.zoom_level)))
            painter.setFont(font)
            label_text = elem.symbology or elem.type
            painter.drawText(rect.toRect(),
                             int(Qt.AlignmentFlag.AlignCenter), f"[{label_text}]\n{elem.value}")

        elif elem.type == "image":
            # Image placeholder
            painter.setPen(QPen(QColor("#9CA3AF"), 1, Qt.PenStyle.DashLine))
            painter.setBrush(QBrush(QColor("#F3F4F6")))
            painter.drawRect(rect)
            font = QFont("Helvetica", max(8, int(9 * self.zoom_level)))
            painter.setFont(font)
            painter.setPen(QColor("#6B7280"))
            painter.drawText(rect.toRect(),
                             int(Qt.AlignmentFlag.AlignCenter), "[Image]")

        elif elem.type == "rect":
            painter.setPen(QPen(QColor(elem.border_color), elem.border_width))
            if elem.filled:
                painter.setBrush(QBrush(QColor(elem.fill_color)))
            else:
                painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawRect(rect)

        elif elem.type == "line":
            painter.setPen(QPen(QColor(elem.border_color), elem.border_width))
            y_mid = rect.y() + rect.height() / 2
            painter.drawLine(int(rect.x()), int(y_mid),
                             int(rect.right()), int(y_mid))

    def _draw_selection_handles(self, painter: QPainter, elem: CanvasElement) -> None:
        """Draw blue selection outline and resize handles."""
        rect = self._element_rect(elem)

        # Selection outline
        painter.setPen(QPen(QColor("#00C9C8"), 2))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawRect(rect)

        # Corner handles
        painter.setBrush(QBrush(QColor("#00C9C8")))
        hs = HANDLE_SIZE
        for x, y in [
            (rect.left(), rect.top()),
            (rect.right(), rect.top()),
            (rect.left(), rect.bottom()),
            (rect.right(), rect.bottom()),
        ]:
            painter.drawRect(QRectF(x - hs / 2, y - hs / 2, hs, hs))

    # ── Mouse Events ─────────────────────────────────────────────────

    def mousePressEvent(self, event) -> None:
        if event.button() != Qt.MouseButton.LeftButton or not self.engine.document:
            return

        pos = event.position()

        # Hit test elements (reverse z-order for top-first)
        hit = None
        for elem in reversed(sorted(
            self.engine.document.elements, key=lambda e: e.z_index
        )):
            if self._element_rect(elem).contains(pos):
                hit = elem
                break

        if hit:
            self.selected_element_id = hit.id
            self.element_selected.emit(hit.id)
            self._dragging = True
            self._drag_start = pos
            self._drag_elem_start_x = hit.x_mm
            self._drag_elem_start_y = hit.y_mm
        else:
            self.selected_element_id = None
            self.element_deselected.emit()

        self.update()

    def mouseMoveEvent(self, event) -> None:
        if not self._dragging or not self._drag_start or not self.selected_element_id:
            return

        pos = event.position()
        dx_px = pos.x() - self._drag_start.x()
        dy_px = pos.y() - self._drag_start.y()

        new_x = self._drag_elem_start_x + self._px_to_mm(dx_px)
        new_y = self._drag_elem_start_y + self._px_to_mm(dy_px)

        # Snap to grid
        if self.show_grid:
            new_x = round(new_x / GRID_SPACING_MM) * GRID_SPACING_MM
            new_y = round(new_y / GRID_SPACING_MM) * GRID_SPACING_MM

        elem = self.engine.document.get_element(self.selected_element_id)
        if elem:
            elem.x_mm = max(0, new_x)
            elem.y_mm = max(0, new_y)
            self.update()

    def mouseReleaseEvent(self, event) -> None:
        if self._dragging and self.selected_element_id and self.engine.document:
            elem = self.engine.document.get_element(self.selected_element_id)
            if elem and (elem.x_mm != self._drag_elem_start_x or
                         elem.y_mm != self._drag_elem_start_y):
                # Commit move via command (for undo)
                from omg.core.template_engine import MoveElementCommand
                cmd = MoveElementCommand(
                    self.engine.document, self.selected_element_id,
                    self._drag_elem_start_x, self._drag_elem_start_y,
                    elem.x_mm, elem.y_mm
                )
                self.engine.command_stack.push(cmd)
                self.engine.document.dirty = True
                self.element_moved.emit(self.selected_element_id, elem.x_mm, elem.y_mm)

        self._dragging = False
        self._drag_start = None

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Delete and self.selected_element_id:
            self.engine.remove_element(self.selected_element_id)
            self.selected_element_id = None
            self.element_deselected.emit()
            self.update()

    # ── Observer ─────────────────────────────────────────────────────

    def _on_template_event(self, event: str, doc):
        self.update()
