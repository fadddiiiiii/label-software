# FILE: omg/core/template_engine.py
# Template Engine — SEC 03 of Technical Specification
# ═══════════════════════════════════════════════════════════════════
# Central state manager for a label design session. Owns the in-memory
# object graph and handles serialization to/from the .lft JSON format.
# Uses the Command pattern for undo/redo and Observer pattern for UI sync.
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import json
import uuid
from collections import deque
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator
from loguru import logger


# ── Data Models ──────────────────────────────────────────────────────

class LabelConfig(BaseModel):
    """Physical label dimensions and rendering settings."""
    width_mm: float = 100.0
    height_mm: float = 70.0
    dpi: int = 300
    background_color: str = "#FFFFFF"
    # GAP-03: Label shape
    shape: Literal["rect", "round_rect", "ellipse"] = "rect"
    corner_radius_mm: float = 3.0  # Used when shape == "round_rect"
    show_border: bool = True


class SheetLayout(BaseModel):
    """GAP-01: Multi-label sheet layout for tiling labels on a page."""
    cols: int = 1
    rows: int = 1
    h_gap_mm: float = 3.0
    v_gap_mm: float = 3.0
    margin_top_mm: float = 5.0
    margin_left_mm: float = 5.0
    page_width_mm: float = 210.0   # A4 default
    page_height_mm: float = 297.0  # A4 default

    @property
    def labels_per_sheet(self) -> int:
        return self.cols * self.rows

    def label_origin(self, index: int, label_w_mm: float,
                     label_h_mm: float) -> tuple[float, float]:
        """Returns (x_mm, y_mm) origin for label at zero-based position index."""
        col = index % self.cols
        row = index // self.cols
        x = self.margin_left_mm + col * (label_w_mm + self.h_gap_mm)
        y = self.margin_top_mm + row * (label_h_mm + self.v_gap_mm)
        return (x, y)


class BindingConfig(BaseModel):
    """Data binding configuration for a canvas element."""
    source_id: str
    column: str
    formula: Optional[str] = None


# ── GAP-02: Extended Binding Types ───────────────────────────────────

class KeyboardBinding(BaseModel):
    """Field prompts operator for a typed value before printing."""
    field_id: str
    source_type: Literal["keyboard"] = "keyboard"
    prompt_label: str  # e.g. "Enter Lot Number"
    default_value: str = ""
    apply_to_batch: bool = True  # True=ask once; False=ask per label


class SerialBinding(BaseModel):
    """Auto-incrementing serial number."""
    field_id: str
    source_type: Literal["serial"] = "serial"
    start_value: int = 1
    increment: int = 1
    pad_to_length: int = 0  # 0 = no padding
    prefix: str = ""
    suffix: str = ""


class DateBinding(BaseModel):
    """Current date formatted at print time."""
    field_id: str
    source_type: Literal["date"] = "date"
    format_str: str = "%Y%m%d"


class TimeBinding(BaseModel):
    """Current time formatted at print time."""
    field_id: str
    source_type: Literal["time"] = "time"
    format_str: str = "%H:%M:%S"


class DataSourceRef(BaseModel):
    """Reference to an attached data source."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["csv", "excel", "sql"] = "csv"
    path: Optional[str] = None
    connection_str: Optional[str] = None
    query: Optional[str] = None
    sheet: Optional[str] = None
    join_key: Optional[str] = None


class CanvasElement(BaseModel):
    """Base class for all placeable objects on the label canvas."""
    id: str = Field(default_factory=lambda: f"field_{uuid.uuid4().hex[:6]}")
    type: Literal["text", "barcode", "qrcode", "image", "rect", "circle", "line"]
    name: str = "Layer"
    x_mm: float = 0.0
    y_mm: float = 0.0
    width_mm: float = 40.0
    height_mm: float = 10.0
    rotation: float = 0.0
    z_index: int = 0
    locked: bool = False
    hidden: bool = False
    do_not_print: bool = False
    opacity: float = 100.0

    # Text-specific
    font_name: str = "Helvetica"
    font_size: float = 12.0
    align: Literal["left", "center", "right"] = "left"
    vertical_align: Literal["top", "middle", "bottom"] = "top"
    bold: bool = False
    italic: bool = False
    font_weight: Union[str, int] = "normal"
    font_italic: bool = False
    color: str = "#000000"
    value: str = ""
    # Styling & Advanced Text
    overflow_mode: str = "shrink" # shrink, wrap, strict, expand
    line_spacing_mm: float = 0.0
    char_spacing_mm: float = 0.0
    min_font_size_mm: float = 1.0
    max_font_size_mm: float = 99.0
    justify: bool = False
    inverse: bool = False
    mirror: bool = False
    underline: bool = False
    strikeout: bool = False
    rtl: bool = False
    background_color: str = "transparent"
    border_enabled: bool = False

    # Barcode/QR specific
    symbology: Optional[str] = None  # code128, qrcode, etc.
    show_text: bool = True
    text_on_top: bool = False
    auto_font_scale: bool = True
    text_font_size_mm: float = 2.5
    text_font_name: str = "Helvetica"
    text_font_bold: bool = False
    text_font_italic: bool = False
    text_anchor: Literal["left", "center", "right"] = "center"
    barcode_char_space: float = 0.0
    text_format: str = ""
    text_offset_x: float = 0.0
    text_offset_y: float = 0.0
    lock_bar_size: bool = False
    user_input: bool = False
    barcode_rotation: int = 0
    x_dimension_mil: float = 13.33
    barcode_color: str = "#000000"
    barcode_order: int = 0
    barcode_text_margin_mm: float = 1.0
    special_settings: Dict[str, Any] = Field(default_factory=dict)

    # Image-specific
    image_path: Optional[str] = None
    image_b64: Optional[str] = None
    maintain_aspect_ratio: bool = True
    image_fit_mode: Literal["stretch", "fit", "tile"] = "fit"
    monochrome: bool = False

    # Shape/Line specific
    border_color: str = "#000000"
    fill_color: str = "#FFFFFF"
    filled: bool = False
    border_width: float = 1.0
    line_style: Literal["solid", "dashed", "dotted", "dash-dot"] = "solid"
    line_cap: Literal["square", "round", "flat"] = "square"
    arrow_head: Literal["none", "start", "end", "both"] = "none"
    corner_radius_mm: float = 0.0  # Rounded corners for rect elements

    # Binding (null if not bound to data)
    binding: Optional[BindingConfig] = None


class TemplateDocument(BaseModel):
    """Root document holding the full label template state."""
    schema_version: str = "1.0"
    label: LabelConfig = Field(default_factory=LabelConfig)
    sheet_layout: SheetLayout = Field(default_factory=SheetLayout)  # GAP-01
    elements: List[CanvasElement] = Field(default_factory=list)
    data_sources: List[DataSourceRef] = Field(default_factory=list)

    # Runtime state (not serialized to JSON)
    dirty: bool = Field(default=False, exclude=True)
    file_path: Optional[str] = Field(default=None, exclude=True)

    def get_element(self, element_id: str) -> Optional[CanvasElement]:
        """Find an element by its ID."""
        for elem in self.elements:
            if elem.id == element_id:
                return elem
        return None

    def add_element(self, element: CanvasElement) -> None:
        """Add an element to the canvas."""
        self.elements.append(element)

    def remove_element(self, element_id: str) -> Optional[CanvasElement]:
        """Remove and return an element by ID."""
        for i, elem in enumerate(self.elements):
            if elem.id == element_id:
                return self.elements.pop(i)
        return None

    def get_next_z_index(self) -> int:
        """Return the next available z-index."""
        if not self.elements:
            return 0
        return max(e.z_index for e in self.elements) + 1


# ── Command Pattern (Undo/Redo) ─────────────────────────────────────

class Command:
    """Base class for undoable commands."""

    def do(self) -> None:
        raise NotImplementedError

    def undo(self) -> None:
        raise NotImplementedError

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}"


class MoveElementCommand(Command):
    """Records an element move for undo/redo."""

    def __init__(self, document: TemplateDocument, element_id: str,
                 old_x: float, old_y: float, new_x: float, new_y: float):
        self.document = document
        self.element_id = element_id
        self.old_x = old_x
        self.old_y = old_y
        self.new_x = new_x
        self.new_y = new_y

    def do(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            elem.x_mm = self.new_x
            elem.y_mm = self.new_y

    def undo(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            elem.x_mm = self.old_x
            elem.y_mm = self.old_y


class ResizeElementCommand(Command):
    """Records an element resize for undo/redo."""

    def __init__(self, document: TemplateDocument, element_id: str,
                 old_x: float, old_y: float, old_w: float, old_h: float,
                 new_x: float, new_y: float, new_w: float, new_h: float):
        self.document = document
        self.element_id = element_id
        self.old_x, self.old_y, self.old_w, self.old_h = old_x, old_y, old_w, old_h
        self.new_x, self.new_y, self.new_w, self.new_h = new_x, new_y, new_w, new_h

    def do(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            elem.x_mm, elem.y_mm = self.new_x, self.new_y
            elem.width_mm, elem.height_mm = self.new_w, self.new_h

    def undo(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            elem.x_mm, elem.y_mm = self.old_x, self.old_y
            elem.width_mm, elem.height_mm = self.old_w, self.old_h


class AddElementCommand(Command):
    """Records adding an element to the canvas."""

    def __init__(self, document: TemplateDocument, element: CanvasElement):
        self.document = document
        self.element = element

    def do(self) -> None:
        self.document.add_element(self.element)

    def undo(self) -> None:
        self.document.remove_element(self.element.id)


class RemoveElementCommand(Command):
    """Records removing an element from the canvas."""

    def __init__(self, document: TemplateDocument, element_id: str):
        self.document = document
        self.element_id = element_id
        self._removed: Optional[CanvasElement] = None

    def do(self) -> None:
        self._removed = self.document.remove_element(self.element_id)

    def undo(self) -> None:
        if self._removed:
            self.document.add_element(self._removed)


class EditElementCommand(Command):
    """Records a property edit on an element."""

    def __init__(self, document: TemplateDocument, element_id: str,
                 prop_name: str, old_value: Any, new_value: Any):
        self.document = document
        self.element_id = element_id
        self.prop_name = prop_name
        self.old_value = old_value
        self.new_value = new_value

    def do(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            setattr(elem, self.prop_name, self.new_value)

    def undo(self) -> None:
        elem = self.document.get_element(self.element_id)
        if elem:
            setattr(elem, self.prop_name, self.old_value)


class CommandStack:
    """Manages undo/redo history with a fixed depth."""

    def __init__(self, max_depth: int = 50):
        self.max_depth = max_depth
        self._undo_stack: deque[Command] = deque(maxlen=max_depth)
        self._redo_stack: deque[Command] = deque(maxlen=max_depth)

    def push(self, command: Command) -> None:
        """Push a command after execution; clears the redo stack."""
        self._undo_stack.append(command)
        self._redo_stack.clear()

    def pop_undo(self) -> Optional[Command]:
        """Pop the last command for undo; push to redo stack."""
        if self._undo_stack:
            cmd = self._undo_stack.pop()
            self._redo_stack.append(cmd)
            return cmd
        return None

    def pop_redo(self) -> Optional[Command]:
        """Pop the last undone command for redo; push back to undo stack."""
        if self._redo_stack:
            cmd = self._redo_stack.pop()
            self._undo_stack.append(cmd)
            return cmd
        return None

    def clear(self) -> None:
        self._undo_stack.clear()
        self._redo_stack.clear()

    @property
    def can_undo(self) -> bool:
        return len(self._undo_stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0


# ── Template Engine ──────────────────────────────────────────────────

class TemplateEngine:
    """Central controller for template state, serialization, and undo/redo."""

    def __init__(self):
        self.document: Optional[TemplateDocument] = None
        self.command_stack = CommandStack(max_depth=50)
        self._observers: List[Callable[[str, Optional[TemplateDocument]], None]] = []

    # ── Observer Pattern ──

    def add_observer(self, callback: Callable[[str, Optional[TemplateDocument]], None]) -> None:
        """Register a callback that fires on state changes."""
        self._observers.append(callback)

    def remove_observer(self, callback: Callable) -> None:
        self._observers = [cb for cb in self._observers if cb is not callback]

    def notify_observers(self, event: str) -> None:
        """Broadcast a state change event to all registered observers."""
        for callback in self._observers:
            try:
                callback(event, self.document)
            except Exception as e:
                logger.error(f"Observer error on event '{event}': {e}")

    # Shorthand alias used by UI panels
    _notify = notify_observers

    # ── File Operations ──

    def new(self, width_mm: float = 100.0, height_mm: float = 70.0, dpi: int = 300) -> TemplateDocument:
        """Create a new blank template."""
        self.document = TemplateDocument(
            label=LabelConfig(width_mm=width_mm, height_mm=height_mm, dpi=dpi)
        )
        self.command_stack.clear()
        self.notify_observers("new")
        logger.info(f"New template: {width_mm}x{height_mm}mm @ {dpi}dpi")
        return self.document

    def load(self, path: str) -> TemplateDocument:
        """Load a template from a .lft JSON file."""
        file_path = Path(path)
        if not file_path.exists():
            raise FileNotFoundError(f"Template not found: {path}")

        raw = file_path.read_text(encoding="utf-8")
        data = json.loads(raw)
        self.document = TemplateDocument.model_validate(data)
        self.document.file_path = str(file_path)
        self.document.dirty = False
        self.command_stack.clear()
        self.notify_observers("loaded")
        logger.info(f"Template loaded: {path} ({len(self.document.elements)} elements)")
        return self.document

    def save(self, path: Optional[str] = None) -> None:
        """Save the current template to a .lft JSON file."""
        if self.document is None:
            raise ValueError("No template loaded to save")

        save_path = path or self.document.file_path
        if save_path is None:
            raise ValueError("No file path specified for save")

        data = self.document.model_dump(exclude={"dirty", "file_path"})
        raw = json.dumps(data, indent=2, ensure_ascii=False)
        Path(save_path).write_text(raw, encoding="utf-8")
        self.document.file_path = save_path
        self.document.dirty = False
        self.notify_observers("saved")
        logger.info(f"Template saved: {save_path}")

    # ── Command Execution ──

    def execute(self, command: Command) -> None:
        """Execute a command and push it to the undo stack."""
        command.do()
        self.command_stack.push(command)
        if self.document:
            self.document.dirty = True
        self.notify_observers("changed")

    def undo(self) -> bool:
        """Undo the last command. Returns True if an undo was performed."""
        cmd = self.command_stack.pop_undo()
        if cmd is not None:
            cmd.undo()
            self.notify_observers("changed")
            return True
        return False

    def redo(self) -> bool:
        """Redo the last undone command. Returns True if a redo was performed."""
        cmd = self.command_stack.pop_redo()
        if cmd is not None:
            cmd.do()
            self.notify_observers("changed")
            return True
        return False

    # ── Convenience Methods ──

    def add_element(self, element: CanvasElement) -> None:
        """Add an element via command (undoable)."""
        if self.document is None:
            raise ValueError("No template loaded")
        element.z_index = self.document.get_next_z_index()
        self.execute(AddElementCommand(self.document, element))

    def remove_element(self, element_id: str) -> None:
        """Remove an element via command (undoable)."""
        if self.document is None:
            raise ValueError("No template loaded")
        self.execute(RemoveElementCommand(self.document, element_id))

    def move_element(self, element_id: str, new_x: float, new_y: float) -> None:
        """Move an element via command (undoable)."""
        if self.document is None:
            raise ValueError("No template loaded")
        elem = self.document.get_element(element_id)
        if elem is None:
            raise ValueError(f"Element not found: {element_id}")
        self.execute(MoveElementCommand(
            self.document, element_id,
            elem.x_mm, elem.y_mm, new_x, new_y
        ))

    def edit_element(self, element_id: str, prop_name: str, new_value: Any) -> None:
        """Edit an element property via command (undoable)."""
        if self.document is None:
            raise ValueError("No template loaded")
        elem = self.document.get_element(element_id)
        if elem is None:
            raise ValueError(f"Element not found: {element_id}")
        old_value = getattr(elem, prop_name)
        self.execute(EditElementCommand(
            self.document, element_id, prop_name, old_value, new_value
        ))

    def validate(self) -> List[str]:
        """Validate template integrity. Returns a list of warning messages."""
        warnings = []
        if self.document is None:
            return ["No template loaded"]

        for elem in self.document.elements:
            # Check out-of-bounds elements
            if elem.x_mm < 0 or elem.y_mm < 0:
                warnings.append(f"Element '{elem.id}' has negative position")
            if elem.x_mm + elem.width_mm > self.document.label.width_mm:
                warnings.append(f"Element '{elem.id}' extends beyond label width")
            if elem.y_mm + elem.height_mm > self.document.label.height_mm:
                warnings.append(f"Element '{elem.id}' extends beyond label height")

            # Check missing bindings
            if elem.binding:
                src_ids = {s.id for s in self.document.data_sources}
                if elem.binding.source_id not in src_ids:
                    warnings.append(
                        f"Element '{elem.id}' bound to unknown source '{elem.binding.source_id}'"
                    )

        return warnings
