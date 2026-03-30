#!/usr/bin/env bash
# scripts/build_python_standalone.sh — Standalone Python Engine (no Electron)
# ═══════════════════════════════════════════════════════════════════
# For deploying the Python engine + PyQt6 GUI as a standalone app
# (the original Phase 1-3 application without React/Electron)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "═══════════════════════════════════════════════════════"
echo " OMG — PyQt6 Standalone Build"
echo "═══════════════════════════════════════════════════════"

cd "$PROJECT_DIR"
source .venv/bin/activate

PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "[1/3] Installing PyInstaller..."
pip install -q pyinstaller

echo "[2/3] Building executable..."

EXTRA_ARGS=""
if [ "$PLATFORM" = "Darwin" ]; then
  EXTRA_ARGS="--windowed --osx-bundle-identifier com.wagtailcorp.omg"
fi

pyinstaller --noconfirm --clean \
  --name OMG \
  $EXTRA_ARGS \
  --icon "assets/icon.icns" 2>/dev/null || \
pyinstaller --noconfirm --clean \
  --name OMG \
  $EXTRA_ARGS \
  --add-data "omg/core/formula_grammar.lark:omg/core" \
  --add-data "omg/db/schema.sql:omg/db" \
  --add-data "omg/ui/styles:omg/ui/styles" \
  --hidden-import "PyQt6.QtSvg" \
  --hidden-import "PyQt6.QtPrintSupport" \
  --hidden-import "pydantic" \
  --collect-submodules "barcode" \
  --collect-submodules "qrcode" \
  --collect-submodules "reportlab" \
  omg/__main__.py

echo "[3/3] Build complete!"
echo ""
echo "Output:"
ls -lh dist/OMG* 2>/dev/null || echo "  Check dist/ directory."
echo ""
echo "═══════════════════════════════════════════════════════"
