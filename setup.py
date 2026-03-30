# FILE: setup.py
# py2app configuration for macOS build — ADD-08 of macOS Platform Addendum
# ═══════════════════════════════════════════════════════════════════

from setuptools import setup
from glob import glob

APP = ["omg/rpc_server.py"]

DATA_FILES = [
    ("assets/themes", ["omg/assets/themes/dark.qss"]),
    ("assets/icons",  glob("omg/assets/icons/*.icns") + glob("omg/assets/icons/*.png")),
    ("assets/fonts",  glob("omg/assets/fonts/*.ttf")),
    ("",              ["omg/core/formula.lark"]),
    ("db",            ["omg/db/schema.sql"]),
]

OPTIONS = {
    "py2app": {
        "app": APP,
        "packages": [
            "PyQt6", "reportlab", "barcode", "qrcode",
            "treepoem", "pandas", "openpyxl", "sqlalchemy",
            "pycups", "AppKit", "Quartz", "lark", "loguru",
            "pydantic", "platformdirs", "chardet", "watchdog",
            "alembic", "dateutil",
        ],
        "excludes": [
            "scipy", "numpy", "matplotlib", "tkinter",
            "win32api", "win32print", "pywin32",
        ],
        "iconfile": "omg/assets/icons/app.icns",
        "plist": {
            "CFBundleName": "OMG",
            "CFBundleIdentifier": "com.omg.app",
            "CFBundleVersion": "1.0.0",
            "CFBundleShortVersionString": "1.0",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "13.0",
            "CFBundleDocumentTypes": [{
                "CFBundleTypeName": "OMG Template",
                "CFBundleTypeExtensions": ["omg"],
                "CFBundleTypeRole": "Editor",
                "CFBundleTypeIconFile": "omg_doc.icns",
            }],
            "NSPrincipalClass": "NSApplication",
        },
        "arch": "universal2",  # Fat binary: arm64 + x86_64
        "strip": True,
        "semi_standalone": False,
    }
}

setup(
    name="OMG",
    app=APP,
    data_files=DATA_FILES,
    options=OPTIONS,
    setup_requires=["py2app"],
)
