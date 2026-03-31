#!/usr/bin/env bash
# scripts/build_macos.sh — macOS DMG Builder
# ═══════════════════════════════════════════════════════════════════
# Builds the complete OMG app bundle for macOS distribution.
# Output: ui/release/OMG-{version}.dmg
# Prerequisites: Node.js, npm, Python 3.11+, Xcode CLI tools
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "═══════════════════════════════════════════════════════"
echo " OMG — macOS Distribution Build"
echo "═══════════════════════════════════════════════════════"

# ── Step 1: Python Engine Bundle ────────────────────────────────
echo "[1/5] Building Python engine bundle..."

PYTHON_DIST="$PROJECT_DIR/dist/engine"
rm -rf "$PYTHON_DIST"

cd "$PROJECT_DIR"
source .venv/bin/activate

# Install PyInstaller if needed
pip install -q pyinstaller 2>/dev/null || true

# Build Python engine as a standalone folder
pyinstaller --noconfirm --clean \
  --distpath "$PYTHON_DIST" \
  --name omg_engine \
  --add-data "omg/core/formula.lark:omg/core" \
  --add-data "omg/db/schema.sql:omg/db" \
  --hidden-import "omg.rpc_server" \
  --hidden-import "omg.core.barcode_engine" \
  --hidden-import "omg.core.formula_engine" \
  --hidden-import "omg.core.template_engine" \
  --hidden-import "omg.core.field_binder" \
  --hidden-import "omg.data.csv_adapter" \
  --hidden-import "omg.data.excel_adapter" \
  --hidden-import "omg.data.sql_adapter" \
  --hidden-import "omg.print.row_renderer" \
  --hidden-import "omg.print.batch_engine" \
  --hidden-import "omg.db.db_manager" \
  --hidden-import "chardet" \
  --hidden-import "chardet.universaldetector" \
  --hidden-import "openpyxl" \
  --hidden-import "xlrd" \
  --hidden-import "xlwt" \
  --collect-submodules "barcode" \
  --collect-submodules "qrcode" \
  --collect-submodules "chardet" \
  omg/rpc_server.py

echo "   ✓ Python engine built to $PYTHON_DIST"

# ── Step 2: React/Electron Build ────────────────────────────────
echo "[2/5] Building Electron app..."

cd "$PROJECT_DIR/ui"
npm ci --silent
npm run build

echo "   ✓ Electron app built"

# ── Step 3: Copy Python Engine for Packaging ────────────────────
echo "[3/5] Moving Python engine to engine_bin for builder..."

ENGINE_BIN="$PROJECT_DIR/ui/engine_bin"
rm -rf "$ENGINE_BIN"
mkdir -p "$ENGINE_BIN"
cp -r "$PYTHON_DIST/omg_engine/"* "$ENGINE_BIN/"

echo "   ✓ Engine ready in engine_bin"

# ── Step 4: Build DMG ───────────────────────────────────────────
echo "[4/5] Building macOS DMG..."

cd "$PROJECT_DIR/ui"
npx electron-builder --mac --config

echo "   ✓ DMG built"

# ── Step 5: Report ──────────────────────────────────────────────
echo "[5/5] Build complete!"
echo ""
echo "Output files:"
ls -lh "$PROJECT_DIR/ui/release/"*.dmg 2>/dev/null || echo "   (check ui/release/ for output)"
echo ""
echo "═══════════════════════════════════════════════════════"
echo " To notarize: xcrun notarytool submit <path>.dmg"
echo "═══════════════════════════════════════════════════════"
