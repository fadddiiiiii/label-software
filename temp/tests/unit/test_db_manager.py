# FILE: tests/unit/test_db_manager.py
# Unit tests for the Database Manager

import pytest
from omg.db.db_manager import DbManager, DbError


@pytest.fixture
def db(tmp_path):
    return DbManager(tmp_path / "test.db")


class TestDbManager:

    def test_schema_created(self, db):
        """Schema should be auto-created on init."""
        templates = db.get_templates()
        assert isinstance(templates, list)
        assert len(templates) == 0

    def test_save_and_get_template(self, db):
        tid = db.save_template("My Label", "/path/to/label.lft")
        templates = db.get_templates()
        assert len(templates) == 1
        assert templates[0].name == "My Label"
        assert templates[0].id == tid

    def test_delete_template(self, db):
        tid = db.save_template("Delete Me", "/path/to/del.lft")
        db.delete_template(tid)
        assert len(db.get_templates()) == 0

    def test_update_template(self, db):
        tid = db.save_template("V1", "/path.lft")
        db.save_template("V2", "/path.lft", template_id=tid)
        t = db.get_template(tid)
        assert t.name == "V2"

    def test_print_job_lifecycle(self, db):
        tid = db.save_template("Job Test", "/job.lft")
        job_id = db.log_print_job(tid, "Printer1", 10)

        db.log_print_row(job_id, 0, "ok", duration_ms=50)
        db.log_print_row(job_id, 1, "ok", duration_ms=45)
        db.log_print_row(job_id, 2, "error", error_msg="Paper jam")

        db.complete_print_job(job_id, "partial")

        history = db.get_print_history(limit=5)
        assert len(history) == 1
        assert history[0]["status"] == "partial"
        assert history[0]["completed_count"] == 2
        assert history[0]["error_count"] == 1

    def test_preferences(self, db):
        db.set_preference("theme", "dark")
        assert db.get_preference("theme") == "dark"
        assert db.get_preference("missing", "default") == "default"

        db.set_preference("theme", "light")
        assert db.get_preference("theme") == "light"

    def test_printers(self, db):
        pid = db.save_printer("Zebra ZD420", dpi=203, label_w_mm=50, label_h_mm=25, is_default=True)
        printers = db.get_printers()
        assert len(printers) == 1
        assert printers[0].name == "Zebra ZD420"
        assert printers[0].dpi == 203

    def test_foreign_key_cascade(self, db):
        tid = db.save_template("Cascade", "/cascade.lft")
        sid = db.save_data_source(tid, "csv", file_path="/data.csv")
        db.delete_template(tid)
        sources = db.get_data_sources(tid)
        assert len(sources) == 0
