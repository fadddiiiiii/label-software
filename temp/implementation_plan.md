# OMG — Project Scaffolding & Pre-Implementation Setup

OMG is an enterprise-grade barcode label design and printing platform built with Python 3.11 and PyQt6.

## Source Documents Reviewed

| Document | Pages | Key Content |
|----------|-------|-------------|
| Implementation Proposal | 20 | Architecture, UI/UX, modules, tech stack, phases, timeline |
| Technical Specification | 31 | Dependencies, pseudo-code, DB schema, AI build prompts, testing |
| macOS Platform Addendum | 20 | CUPS print pipeline, Retina handling, py2app, cross-platform patterns |

---

## Proposed Changes

### 1. Directory Structure

These directories and `__init__.py` files will be created under `/Users/fahad/Desktop/Label Software/`:

#### [NEW] Full directory tree

```
labelforge/                    # Root Python package
├── __init__.py
├── main.py                    # Application entry point (skeleton)
├── platform_utils.py          # Cross-platform abstraction layer
├── core/
│   ├── __init__.py
│   ├── template_engine.py     # (empty placeholder)
│   ├── barcode_engine.py      # (empty placeholder)
│   ├── field_binder.py        # (empty placeholder)
│   ├── formula_engine.py      # (empty placeholder)
│   └── formula.lark           # PEG grammar for binding formulas
├── data/
│   ├── __init__.py
│   ├── adapter.py             # (empty placeholder)
│   ├── csv_adapter.py         # (empty placeholder)
│   ├── excel_adapter.py       # (empty placeholder)
│   ├── sql_adapter.py         # (empty placeholder)
│   └── registry.py            # (empty placeholder)
├── print/
│   ├── __init__.py
│   ├── batch_engine.py        # (empty placeholder)
│   ├── row_renderer.py        # (empty placeholder)
│   ├── dispatcher.py          # (empty placeholder)
│   ├── win_dispatcher.py      # (empty placeholder)
│   ├── macos_dispatcher.py    # (empty placeholder)
│   └── job_logger.py          # (empty placeholder)
├── ui/
│   ├── __init__.py
│   ├── main_window.py         # (empty placeholder)
│   ├── canvas_renderer.py     # (empty placeholder)
│   ├── toolbox.py             # (empty placeholder)
│   ├── properties_panel.py    # (empty placeholder)
│   ├── dialogs/
│   │   ├── __init__.py
│   │   ├── data_source_dialog.py
│   │   ├── binding_panel.py
│   │   ├── print_console.py
│   │   └── settings.py
│   └── widgets/
│       ├── __init__.py
│       ├── dark_button.py
│       ├── tag_badge.py
│       ├── column_chip.py
│       └── progress_bar.py
├── db/
│   ├── __init__.py
│   ├── schema.py              # (empty placeholder)
│   ├── schema.sql             # Full SQLite DDL from Technical Spec
│   ├── queries.py             # (empty placeholder)
│   ├── migrations.py          # (empty placeholder)
│   └── db_manager.py          # (empty placeholder)
└── assets/
    ├── icons/                 # (empty directory, icons added later)
    ├── fonts/                 # (empty directory, fonts added later)
    └── themes/
        └── dark.qss           # Skeleton QSS with design tokens

tests/
├── __init__.py
├── unit/
│   └── __init__.py
├── integration/
│   └── __init__.py
└── fixtures/                  # Test data files added later

build/
├── labelforge.spec            # PyInstaller spec (Windows)
└── labelforge.nsi             # NSIS installer script placeholder (Windows)
```

---

### 2. Dependency Files

#### [NEW] [requirements.txt](file:///Users/fahad/Desktop/Label%20Software/requirements.txt)

Complete pinned Windows dependencies from SEC 01 of the Technical Specification:
- PyQt6==6.7.0, PyQt6-Qt6==6.7.0, PyQt6-sip==13.6.0
- python-barcode==0.15.1, qrcode[pil]==7.4.2, treepoem==3.23.0, Pillow==10.3.0
- reportlab==4.1.0, svglib==1.5.1, pypdf==4.2.0, pywin32==306
- pandas==2.2.1, openpyxl==3.1.2, SQLAlchemy==2.0.29, pyodbc==5.1.0, cx_Oracle==8.3.0
- alembic==1.13.1, lark==1.1.9, python-dateutil==2.9.0
- pydantic==2.7.1, loguru==0.7.2, watchdog==4.0.0, platformdirs==4.2.1, chardet==5.2.0

#### [NEW] [requirements-macos.txt](file:///Users/fahad/Desktop/Label%20Software/requirements-macos.txt)

macOS-specific: removes `pywin32`, replaces with `pycups==2.0.4`, `pyobjc-core==10.2`, `pyobjc-framework-Cocoa==10.2`, `pyobjc-framework-Quartz==10.2`. Uses `python-oracledb==2.2.0` instead of `cx_Oracle` for Apple Silicon.

#### [NEW] [requirements-dev.txt](file:///Users/fahad/Desktop/Label%20Software/requirements-dev.txt)

Dev/test dependencies: `pytest`, `pytest-cov`, `pytest-qt` (for PyQt6 testing).

---

### 3. Configuration Files

#### [NEW] [pytest.ini](file:///Users/fahad/Desktop/Label%20Software/pytest.ini)

From SEC 12 of the Technical Specification — test paths, coverage targets, markers.

#### [NEW] [.gitignore](file:///Users/fahad/Desktop/Label%20Software/.gitignore)

Standard Python `.gitignore` covering `.venv/`, `__pycache__/`, `dist/`, `build/`, `*.egg-info`, `.db`, etc.

---

### 4. Core Source Files (Content)

#### [NEW] [platform_utils.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/platform_utils.py)

Full implementation from ADD-02 of the macOS Addendum — the cross-platform abstraction layer including `get_data_dir()`, `get_db_path()`, `get_log_dir()`, `get_cache_dir()`, `get_print_dispatcher()`, `list_available_printers()`, `reveal_in_file_manager()`, `get_device_pixel_ratio()`.

#### [NEW] [main.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/main.py)

Skeleton entry point based on SEC 02 — `configure_logging()`, `run_db_migrations()`, `QApplication` setup, QSS loading, preference load, `MainWindow` construction (stubbed as pass-through until Phase 2).

#### [NEW] [formula.lark](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/formula.lark)

Complete Lark PEG grammar from SEC 06 of the Technical Specification.

#### [NEW] [schema.sql](file:///Users/fahad/Desktop/Label%20Software/labelforge/db/schema.sql)

Complete DDL from SEC 09 — all 8 tables with constraints and indices.

#### [NEW] [dark.qss](file:///Users/fahad/Desktop/Label%20Software/labelforge/assets/themes/dark.qss)

Skeleton QSS stylesheet using all design tokens from SEC 04 of the Implementation Proposal.

---

### 5. Build / Packaging Files

#### [NEW] [labelforge.spec](file:///Users/fahad/Desktop/Label%20Software/build/labelforge.spec)

PyInstaller spec placeholder for Windows builds.

#### [NEW] [setup.py](file:///Users/fahad/Desktop/Label%20Software/setup.py)

py2app configuration for macOS builds from ADD-08, with all packages, exclusions, and Info.plist.

#### [NEW] [entitlements.plist](file:///Users/fahad/Desktop/Label%20Software/entitlements.plist)

macOS entitlements from ADD-08 — network client, user-selected file access, downloads R/W.

---

### 6. CI Pipeline

#### [NEW] [.github/workflows/tests.yml](file:///Users/fahad/Desktop/Label%20Software/.github/workflows/tests.yml)

GitHub Actions workflow from ADD-10 — `test-windows`, `test-macos`, `build-macos` jobs.

---

### 7. Virtual Environment Setup

After file creation, the following commands will be run on this macOS machine:

```bash
cd "/Users/fahad/Desktop/Label Software"
python3.11 -m venv .venv || python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools
pip install -r requirements-macos.txt
pip install -r requirements-dev.txt
```

> [!IMPORTANT]
> `pywin32` and `pyodbc` are **Windows-only** — they will NOT be installed on this macOS machine. The `requirements-macos.txt` substitutes `pycups` and `pyobjc` instead. The `pycups` package requires CUPS headers (`cups-config`) which are bundled with macOS.

---

## Verification Plan

### Automated Checks
After all files are created and dependencies installed, verify with:

```bash
# 1. Verify directory structure exists
find labelforge -type f -name "*.py" | sort

# 2. Verify critical imports in the virtual environment
source .venv/bin/activate
python -c "import PyQt6; import reportlab; import barcode; import qrcode; print('All critical imports OK')"

# 3. Verify the labelforge package is importable
python -c "from labelforge.platform_utils import get_data_dir, get_db_path; print('platform_utils OK:', get_db_path())"

# 4. Verify pytest finds the test directory
python -m pytest tests/ --collect-only

# 5. Verify formula.lark is valid Lark grammar
python -c "from lark import Lark; Lark(open('labelforge/core/formula.lark').read(), parser='earley'); print('Grammar OK')"
```

### Manual Verification
- Review the created directory tree to ensure it matches SEC 08 of the Implementation Proposal
- Confirm both `requirements.txt` and `requirements-macos.txt` have all packages from SEC 01 of the Technical Specification
