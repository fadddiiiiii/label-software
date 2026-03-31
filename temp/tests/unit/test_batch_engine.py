# FILE: tests/unit/test_batch_engine.py
# Unit tests for the Batch Engine

import csv
import os
import pytest

from omg.core.template_engine import TemplateDocument, CanvasElement, LabelConfig
from omg.core.field_binder import BindingResolver, FieldBinding
from omg.data.csv_adapter import CSVAdapter
from omg.print.batch_engine import BatchController, JobStatus


@pytest.fixture
def csv_file(tmp_path):
    path = tmp_path / "parts.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["PartNumber", "Description"])
        writer.writerow(["P001", "Widget A"])
        writer.writerow(["P002", "Widget B"])
        writer.writerow(["P003", "Widget C"])
    return str(path)


@pytest.fixture
def template():
    return TemplateDocument(
        label=LabelConfig(width_mm=100, height_mm=50),
        elements=[
            CanvasElement(id="t1", type="text", x_mm=5, y_mm=5,
                          width_mm=40, height_mm=8, value=""),
        ]
    )


class TestBatchController:

    def test_batch_pdf_output(self, template, csv_file, tmp_path):
        adapter = CSVAdapter(csv_file)
        resolver = BindingResolver()
        resolver.attach_adapter("src1", adapter, is_primary=True)

        bindings = [
            FieldBinding(field_id="t1", source_id="src1", column_name="PartNumber"),
        ]

        controller = BatchController(template, resolver, bindings, adapter)
        output_pdf = str(tmp_path / "output.pdf")
        progress = controller.run(printer_name="PDF", output_path=output_pdf)

        assert progress.status == JobStatus.DONE
        assert progress.completed_rows == 3
        assert progress.error_rows == 0
        assert os.path.exists(output_pdf)

    def test_batch_cancel(self, template, csv_file):
        adapter = CSVAdapter(csv_file)
        resolver = BindingResolver()
        resolver.attach_adapter("src1", adapter, is_primary=True)

        bindings = [
            FieldBinding(field_id="t1", source_id="src1", column_name="PartNumber"),
        ]

        controller = BatchController(template, resolver, bindings, adapter)

        # Cancel after the first row completes
        def cancel_after_first(progress):
            if progress.completed_rows >= 1:
                controller.cancel()

        controller.on_progress = cancel_after_first
        progress = controller.run(printer_name="PDF")

        assert progress.status == JobStatus.CANCELLED
        assert progress.completed_rows < 3  # Should have cancelled before all rows

    def test_batch_progress_callback(self, template, csv_file, tmp_path):
        adapter = CSVAdapter(csv_file)
        resolver = BindingResolver()
        resolver.attach_adapter("src1", adapter, is_primary=True)

        bindings = [
            FieldBinding(field_id="t1", source_id="src1", column_name="PartNumber"),
        ]

        progress_updates = []
        controller = BatchController(template, resolver, bindings, adapter)
        controller.on_progress = lambda p: progress_updates.append(p.completed_rows)

        output_pdf = str(tmp_path / "progress.pdf")
        controller.run(printer_name="PDF", output_path=output_pdf)

        assert len(progress_updates) == 3  # one per row
        assert progress_updates[-1] == 3
