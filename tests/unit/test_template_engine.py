# FILE: tests/unit/test_template_engine.py
# Unit tests for the Template Engine — SEC 12
# ═══════════════════════════════════════════════════════════════════

import json
import os
import tempfile

import pytest

from omg.core.template_engine import (
    TemplateEngine, TemplateDocument, CanvasElement, LabelConfig,
    BindingConfig, DataSourceRef, CommandStack,
    MoveElementCommand, AddElementCommand, RemoveElementCommand, EditElementCommand,
)


class TestTemplateDocument:
    """Tests for the TemplateDocument Pydantic model."""

    def test_create_default_document(self):
        doc = TemplateDocument()
        assert doc.schema_version == "1.0"
        assert doc.label.width_mm == 100.0
        assert doc.label.height_mm == 70.0
        assert doc.label.dpi == 300
        assert len(doc.elements) == 0

    def test_add_and_get_element(self):
        doc = TemplateDocument()
        elem = CanvasElement(id="f1", type="text", x_mm=5.0, y_mm=10.0, value="Hello")
        doc.add_element(elem)
        assert len(doc.elements) == 1
        assert doc.get_element("f1") is elem

    def test_remove_element(self):
        doc = TemplateDocument()
        elem = CanvasElement(id="f1", type="text")
        doc.add_element(elem)
        removed = doc.remove_element("f1")
        assert removed is elem
        assert len(doc.elements) == 0

    def test_get_next_z_index(self):
        doc = TemplateDocument()
        assert doc.get_next_z_index() == 0
        doc.add_element(CanvasElement(id="f1", type="text", z_index=5))
        assert doc.get_next_z_index() == 6

    def test_serialization_roundtrip(self):
        """Save to JSON and reload — must produce identical document."""
        doc = TemplateDocument(
            label=LabelConfig(width_mm=148.0, height_mm=105.0, dpi=300),
            elements=[
                CanvasElement(id="f1", type="text", x_mm=5.0, y_mm=3.0, value="Part A"),
                CanvasElement(id="f2", type="barcode", x_mm=5.0, y_mm=20.0, symbology="code128"),
            ],
            data_sources=[
                DataSourceRef(id="src1", type="csv", path="/data/parts.csv"),
            ],
        )
        data = doc.model_dump(exclude={"dirty", "file_path"})
        raw = json.dumps(data)
        reloaded = TemplateDocument.model_validate(json.loads(raw))
        assert reloaded.label.width_mm == 148.0
        assert len(reloaded.elements) == 2
        assert reloaded.elements[0].value == "Part A"
        assert reloaded.elements[1].symbology == "code128"

    def test_element_with_binding(self):
        elem = CanvasElement(
            id="f1", type="text",
            binding=BindingConfig(source_id="src1", column="PartNumber", formula="upper({value})")
        )
        assert elem.binding is not None
        assert elem.binding.column == "PartNumber"


class TestCommandStack:
    """Tests for undo/redo command stack."""

    def test_push_and_undo(self):
        stack = CommandStack(max_depth=10)
        doc = TemplateDocument()
        doc.add_element(CanvasElement(id="f1", type="text", x_mm=0, y_mm=0))

        cmd = MoveElementCommand(doc, "f1", 0, 0, 10, 20)
        cmd.do()
        stack.push(cmd)

        assert doc.get_element("f1").x_mm == 10
        assert stack.can_undo

        undone = stack.pop_undo()
        undone.undo()
        assert doc.get_element("f1").x_mm == 0
        assert stack.can_redo

    def test_redo(self):
        stack = CommandStack()
        doc = TemplateDocument()
        doc.add_element(CanvasElement(id="f1", type="text", x_mm=0, y_mm=0))

        cmd = MoveElementCommand(doc, "f1", 0, 0, 10, 20)
        cmd.do()
        stack.push(cmd)
        stack.pop_undo().undo()

        redone = stack.pop_redo()
        redone.do()
        assert doc.get_element("f1").x_mm == 10

    def test_max_depth(self):
        stack = CommandStack(max_depth=3)
        doc = TemplateDocument()
        doc.add_element(CanvasElement(id="f1", type="text", x_mm=0, y_mm=0))

        for i in range(5):
            cmd = MoveElementCommand(doc, "f1", 0, 0, float(i), 0)
            cmd.do()
            stack.push(cmd)

        assert len(stack._undo_stack) == 3

    def test_push_clears_redo(self):
        stack = CommandStack()
        doc = TemplateDocument()
        doc.add_element(CanvasElement(id="f1", type="text", x_mm=0, y_mm=0))

        cmd1 = MoveElementCommand(doc, "f1", 0, 0, 10, 0)
        cmd1.do()
        stack.push(cmd1)
        stack.pop_undo()  # undo -> redo stack has cmd1

        cmd2 = MoveElementCommand(doc, "f1", 0, 0, 20, 0)
        cmd2.do()
        stack.push(cmd2)
        assert not stack.can_redo  # redo cleared


class TestTemplateEngine:
    """Tests for the TemplateEngine controller."""

    def test_new_template(self):
        engine = TemplateEngine()
        doc = engine.new(width_mm=100, height_mm=50)
        assert doc.label.width_mm == 100
        assert doc.label.height_mm == 50

    def test_save_and_load(self, tmp_path):
        engine = TemplateEngine()
        engine.new(148, 105, 300)
        engine.add_element(CanvasElement(id="f1", type="text", value="Test"))

        path = str(tmp_path / "test.lft")
        engine.save(path)
        assert os.path.exists(path)

        engine2 = TemplateEngine()
        doc = engine2.load(path)
        assert len(doc.elements) == 1
        assert doc.elements[0].value == "Test"

    def test_undo_redo(self):
        engine = TemplateEngine()
        engine.new()
        engine.add_element(CanvasElement(id="f1", type="text", x_mm=0, y_mm=0))
        assert len(engine.document.elements) == 1

        engine.undo()
        assert len(engine.document.elements) == 0

        engine.redo()
        assert len(engine.document.elements) == 1

    def test_observer_notification(self):
        events = []
        engine = TemplateEngine()
        engine.add_observer(lambda event, doc: events.append(event))
        engine.new()
        engine.add_element(CanvasElement(id="f1", type="text"))
        assert "new" in events
        assert "changed" in events

    def test_edit_element(self):
        engine = TemplateEngine()
        engine.new()
        engine.add_element(CanvasElement(id="f1", type="text", font_size=12))
        engine.edit_element("f1", "font_size", 24)
        assert engine.document.get_element("f1").font_size == 24

        engine.undo()
        assert engine.document.get_element("f1").font_size == 12

    def test_dirty_flag(self):
        engine = TemplateEngine()
        engine.new()
        assert not engine.document.dirty
        engine.add_element(CanvasElement(id="f1", type="text"))
        assert engine.document.dirty

    def test_validate(self):
        engine = TemplateEngine()
        engine.new(width_mm=50, height_mm=30)
        engine.add_element(CanvasElement(id="f1", type="text", x_mm=45, width_mm=20))
        warnings = engine.validate()
        assert any("extends beyond" in w for w in warnings)
