# FILE: omg/platform_utils.py
# Cross-platform abstraction layer — ADD-02 of macOS Platform Addendum
# ═══════════════════════════════════════════════════════════════════
# DESIGN RULE: No module outside this file and the two dispatcher files
# (win_dispatcher.py, macos_dispatcher.py) may import pywin32 or pycups.
# ═══════════════════════════════════════════════════════════════════

import sys
import os
import subprocess
from pathlib import Path
from typing import List

from platformdirs import user_data_dir, user_log_dir, user_cache_dir, user_config_dir

PLATFORM: str = sys.platform  # "win32" | "darwin" | "linux"
IS_WINDOWS: bool = PLATFORM == "win32"
IS_MACOS: bool = PLATFORM == "darwin"
IS_LINUX: bool = PLATFORM == "linux"

# ── PATH RESOLUTION ──────────────────────────────────────────────

APP_NAME = "OMG"
APP_AUTHOR = "OMG"


def get_data_dir() -> Path:
    """Returns the OS-correct user data directory.
    Windows: %APPDATA%/OMG/OMG
    macOS:   ~/Library/Application Support/OMG/OMG
    """
    return Path(user_data_dir(APP_NAME, APP_AUTHOR))


def get_db_path() -> Path:
    """Returns the path to the local SQLite database, creating parent dirs."""
    p = get_data_dir() / "omg.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_log_dir() -> Path:
    """Returns the OS-correct log directory.
    Windows: %APPDATA%/OMG/OMG/Logs
    macOS:   ~/Library/Logs/OMG/OMG
    """
    d = Path(user_log_dir(APP_NAME, APP_AUTHOR))
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_cache_dir() -> Path:
    """Returns the OS-correct cache directory (used for barcode render cache).
    Windows: %LOCALAPPDATA%/OMG/OMG/Cache
    macOS:   ~/Library/Caches/OMG/OMG
    """
    d = Path(user_cache_dir(APP_NAME, APP_AUTHOR))
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_config_dir() -> Path:
    """Returns the OS-correct config directory.
    Windows: %APPDATA%/OMG/OMG
    macOS:   ~/Library/Preferences/OMG/OMG
    """
    d = Path(user_config_dir(APP_NAME, APP_AUTHOR))
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_templates_dir() -> Path:
    """Returns the default templates directory under ~/Documents/OMG/Templates."""
    d = Path.home() / "Documents" / "OMG" / "Templates"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── PRINT DISPATCHER FACTORY ─────────────────────────────────────

def get_print_dispatcher():
    """Returns the correct PrintDispatcher for the current platform.
    Imports are lazy to avoid loading platform-specific libraries at module level.
    """
    if IS_WINDOWS:
        from omg.print.win_dispatcher import Win32PrintDispatcher
        return Win32PrintDispatcher()
    elif IS_MACOS:
        from omg.print.macos_dispatcher import CUPSPrintDispatcher
        return CUPSPrintDispatcher()
    else:
        # Linux fallback — also uses CUPS
        from omg.print.macos_dispatcher import CUPSPrintDispatcher
        return CUPSPrintDispatcher()


# ── AVAILABLE PRINTERS ────────────────────────────────────────────

def list_available_printers() -> List[str]:
    """Returns printer names from the OS print system."""
    if IS_WINDOWS:
        import win32print
        return [p[2] for p in win32print.EnumPrinters(2)]
    else:
        import cups
        conn = cups.Connection()
        return list(conn.getPrinters().keys())


# ── OPEN FILE IN OS FILE MANAGER ─────────────────────────────────

def reveal_in_file_manager(path: Path) -> None:
    """Opens the system file manager and highlights the given file."""
    if IS_WINDOWS:
        subprocess.run(["explorer", "/select,", str(path)])
    elif IS_MACOS:
        subprocess.run(["open", "-R", str(path)])
    else:
        subprocess.run(["xdg-open", str(path.parent)])


# ── DPI SCALE FACTOR ─────────────────────────────────────────────

def get_device_pixel_ratio(widget) -> float:
    """Returns 2.0 on Retina macOS, 1.0 on standard displays.
    Used by the canvas renderer for HiDPI barcode preview rendering.
    """
    return widget.devicePixelRatioF()


def resolve_path(relative_path: str) -> str:
    """Resolve a path relative to the app bundle or source root."""
    if hasattr(sys, '_MEIPASS'):
        # Running from PyInstaller bundle
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)
