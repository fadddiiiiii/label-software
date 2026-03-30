# FILE: omg/main.py
# Application entry point — SEC 02 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

import sys
import os
from pathlib import Path

from loguru import logger


def configure_logging():
    """Configure loguru to write to the OS-correct log directory.
    Rotating file: 10 MB x 5 backups.
    """
    from omg.platform_utils import get_log_dir

    log_dir = get_log_dir()
    log_file = log_dir / "app.log"

    logger.remove()  # Remove default stderr handler
    logger.add(
        str(log_file),
        rotation="10 MB",
        retention=5,
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{function}:{line} | {message}",
        enqueue=True,  # Thread-safe logging
    )
    # Also log to stderr for development
    logger.add(sys.stderr, level="INFO")
    logger.info("OMG logging initialized")


def run_db_migrations(db_path: Path):
    """Run Alembic migrations on the local SQLite database.
    Creates the DB file on first run and applies any pending migrations.
    """
    # TODO: Implement Alembic migration runner in Phase 1
    logger.info(f"Database path: {db_path}")
    logger.info("Database migrations: skipped (not yet implemented)")


def load_asset(relative_path: str) -> str:
    """Load a bundled asset file relative to the omg package directory."""
    package_dir = Path(__file__).parent
    asset_path = package_dir / relative_path
    if asset_path.exists():
        return asset_path.read_text(encoding="utf-8")
    else:
        logger.warning(f"Asset not found: {asset_path}")
        return ""


def main():
    """OMG application entry point."""
    from omg.platform_utils import get_db_path, IS_MACOS

    # Step 1 — Configure logging
    try:
        configure_logging()
    except Exception as e:
        print(f"Logging setup failed, falling back to stderr: {e}", file=sys.stderr)

    # Step 2 — Run database migrations
    try:
        db_path = get_db_path()
        run_db_migrations(db_path)
    except Exception as e:
        logger.critical(f"Database migration failed: {e}")
        # TODO: Show fatal error dialog
        sys.exit(1)

    # Step 5 — Environment check
    logger.info("OMG engine initialized (Headless)")
    
    # In Electron mode, we don't start a separate GUI.
    # The RPC server handles all requests.
    if os.environ.get("OMG_DEBUG_GUI") == "1":
        from PyQt6.QtWidgets import QMainWindow, QLabel, QApplication
        from PyQt6.QtCore import Qt as QtCore
        
        app = QApplication(sys.argv)
        window = QMainWindow()
        window.setWindowTitle("OMG — Debug Engine View")
        window.setMinimumSize(800, 600)
        label = QLabel("OMG Engine (Debug GUI Mode)\n\nThis window only appears because OMG_DEBUG_GUI=1")
        label.setAlignment(QtCore.AlignmentFlag.AlignCenter)
        window.setCentralWidget(label)
        window.show()
        sys.exit(app.exec())
    else:
        logger.info("Running in headless mode (RPC bridge active)")



if __name__ == "__main__":
    main()
