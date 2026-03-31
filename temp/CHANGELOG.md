# OMG Label Software — Changelog

## Version 2.0 — March 2026

### Overview

Major overhaul of the print pipeline, binding system, and test infrastructure. Printing now works reliably with **any printer** (thermal label printers, desktop printers, network printers) across all supported command languages. A new printer simulator enables automated testing without physical hardware.

---

### 1. Universal Printing — 3-Tier Fallback Chain

**File:** `omg/print/win_dispatcher.py` (rewritten)

The Windows print dispatcher was completely rewritten with a robust 3-tier fallback system that guarantees printing works regardless of driver or printer type:

| Tier | Method | When It's Used |
|------|--------|----------------|
| 1 | **SumatraPDF** (silent CLI) | Fastest path — uses SumatraPDF if installed |
| 2 | **Pillow ImageWin GDI** | Renders PDF to images, sends via Win32 GDI bitmap transfer |
| 3 | **ShellExecute `printto`** | Last resort — delegates to the OS default PDF handler |

**What changed:**
- Replaced broken manual GDI pixel loop (BGR byte manipulation) with Pillow's `ImageWin.Dib` for reliable bitmap transfer
- Replaced fragile `ctypes DEVMODEW` struct with `win32print` API for printer handle management
- Each tier catches errors and falls through to the next — printing never silently fails
- Raw ZPL/TSPL byte passthrough via `win32print.WritePrinter` for native label printers

### 2. Electron Print Fallback

**File:** `ui/src/main/ipc.ts` (modified)

Added a secondary fallback at the Electron layer:

- If Python's `start_batch` RPC succeeds but the dispatch step fails (e.g. printer driver issue), and a PDF was generated at `output_path` — Electron automatically retries using Chromium's built-in print API (`BrowserWindow.webContents.print()`)
- Uses a hidden BrowserWindow to load the PDF silently
- Works with **every printer the OS can see**, including network printers
- Dispatch errors are cleared if the Electron fallback succeeds

### 3. Network Printer Discovery

**File:** `omg/platform_utils.py` (modified)

- Changed `win32print.EnumPrinters(2)` (local only) to `win32print.EnumPrinters(6)` (local + network)
- Users now see all printers including network-mapped printers in the printer dropdown
- `ui/src/main/ipc.ts` merges Electron's printer list with Python's list using `Set` deduplication

### 4. Keyboard Input Binding — Print Flow Fix

**Files:** `ui/src/renderer/components/batch/BatchConsole.tsx`, `omg/rpc_server.py`

Fixed a critical bug where keyboard-bound fields never received their values during printing:

**Problem:** The `KeyboardInputModal` closed after the user typed values, but `startBatch()` was never called afterward — printing never started.

**Fix:**
- Added `pendingKeyboard` state flag in `BatchConsole.tsx`
- When keyboard bindings exist, `handlePrint()` sets `pendingKeyboard=true` and opens the modal
- A `useEffect` watches for `pendingKeyboard && !showKeyboard` (modal closed) → triggers `startBatch()`
- `startBatch()` now includes `keyboard_values: keyboardValues` in the IPC payload
- `rpc_server.py` reads `keyboard_values` from params and calls `resolver.set_keyboard_values()`

### 5. No-Datasource Printing Fix

**File:** `ui/src/renderer/components/batch/BatchConsole.tsx`

**Problem:** Templates with no attached data source (e.g. a static label with only serial/date/keyboard bindings) would compute `totalToPrint = 0`, so the print button did nothing.

**Fix:** `getRowRange()` now returns `{ startRow: 0, endRow: 1, totalToPrint: 1 }` when no data source is attached — prints exactly 1 label using static values and resolved bindings.

### 6. Time Binding Serialization Fix

**File:** `ui/src/renderer/store/canvas.ts`

**Problem:** Both `date` and `time` bindings were serialized as `date_binding` in `toDocument()`. Python's field binder expected `time_binding` for time fields, so time-bound values always resolved as empty.

**Fix:** Split the serialization — `b.type === 'date'` → `date_binding: {...}`, `b.type === 'time'` → `time_binding: {...}`.

### 7. TSPL2 Renderer — Production Quality

**File:** `omg/print/tspl_renderer.py` (major update)

Updated the TSPL2 renderer to generate output matching real production `.prn` files from BarTender and NiceLabel:

**Preamble (new):**
```
SIZE 77.5 mm, 40.0 mm
GAP 3.0 mm, 0 mm
SPEED 4
DENSITY 8
SET RIBBON ON
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET TEAR ON
CLS
CODEPAGE 1252
```

**Other changes:**
- Configurable `speed` (1–6), `density` (0–15), `ribbon` (on/off), `codepage`, `direction` via constructor
- Font selection uses hardware fonts `"1"` through `"5"` with size-based auto-selection matching real `.prn` files
- Barcode symbology uses `"128M"` (auto-switching Code 128) instead of `"128"` — this is what real label software uses for optimal barcode encoding
- Added mappings for `code39`, `ean13`, `ean8`, `upca`, `upce`, `codabar`, `code93`, `msi`, `plessey`, `postnet`, `eanucc128`

### 8. Printer Simulator

**File:** `omg/print/simulator.py` (new)

An industry-standard virtual printer for automated testing — accepts, parses, and validates print jobs without physical hardware.

**Components:**

| Class | Purpose |
|-------|---------|
| `VirtualPrinter` | Accepts print jobs in any language, parses them, stores results for inspection |
| `SimulatedDispatcher` | Drop-in replacement for `Win32PrintDispatcher` with 9 pre-configured virtual printers |
| `TsplParser` | Full TSPL2 command parser — SIZE, GAP, TEXT, BARCODE, QRCODE, BOX, BAR, CIRCLE, PRINT |
| `ZplParser` | Full ZPL II parser — ^XA/^XZ framing, ^PW, ^LL, ^FO, ^FD, ^BC, ^BE, ^BQ, ^GB, ^GC |
| `EscPosParser` | ESC/POS receipt printer parser — ESC @, GS k (barcode), GS V (cut) |
| `PdfParser` | PDF validation and basic metadata extraction |
| `detect_language()` | Auto-detects TSPL, ZPL, ESC/POS, PDF, or RAW from byte content |

**Pre-configured virtual printers:**
- Zebra ZD420, Zebra ZD621 (ZPL + PDF)
- TOSHIBA B-FV4, TSC TE200 (TSPL + PDF)
- HP LaserJet Pro, Canon PIXMA (PDF only)
- Brother QL-820NWB, EPSON TM-T88V (ESC/POS + PDF)
- Microsoft Print to PDF (PDF only)

### 9. Comprehensive Test Suite

**File:** `tests/unit/test_print_pipeline.py` (new) — **82 tests**

| Test Class | Count | What It Covers |
|------------|-------|----------------|
| `TestLanguageDetection` | 7 | Auto-detect TSPL, ZPL, PDF, ESC/POS, RAW, empty input |
| `TestTsplParser` | 8 | Real `.prn` file parsing, XPML wrappers, multi-label, QR, shapes, warnings |
| `TestZplParser` | 7 | Label parsing, QR codes, graphic box/circle, multi-label, rotation |
| `TestEscPosParser` | 4 | Text, barcode, paper cut, empty input |
| `TestPdfParser` | 2 | Real PDF validation, invalid PDF rejection |
| `TestTsplRendererToSimulator` | 9 | End-to-end TSPL rendering → parsing, preamble, 128M, fonts, direct thermal, sheets |
| `TestZplRendererToSimulator` | 6 | End-to-end ZPL rendering → parsing, ^XA/^XZ framing, sheet output |
| `TestPdfRendererToSimulator` | 2 | PDF rendering → validation |
| `TestVirtualPrinter` | 8 | Receive all languages, rejection, text/barcode extraction, clear/reset |
| `TestSimulatedDispatcher` | 10 | Printer listing, PDF-to-any, TSPL-to-Toshiba, wrong-language rejection, content inspection |
| `TestCrossLanguageConsistency` | 2 | Same data across TSPL/ZPL/PDF, dimension consistency |
| `TestEdgeCases` | 7 | Unicode, special characters, tiny/large labels, quote escaping, rotation |
| `TestSymbologyCoverage` | 10 | 7 TSPL + 3 ZPL barcode symbology variants (parametrized) |

---

### Files Modified (Summary)

| File | Status | Change |
|------|--------|--------|
| `omg/print/win_dispatcher.py` | **Rewritten** | 3-tier fallback printing (SumatraPDF → GDI → ShellExecute) |
| `omg/print/tspl_renderer.py` | **Major update** | Production preamble, hardware fonts 1–5, 128M barcode |
| `omg/print/simulator.py` | **New file** | Virtual printer + parsers for TSPL/ZPL/ESC-POS/PDF |
| `omg/print/zpl_renderer.py` | Unchanged | Already functional |
| `omg/platform_utils.py` | **Modified** | `EnumPrinters(6)` for network printers |
| `omg/rpc_server.py` | **Modified** | `keyboard_values` pass-through to binding resolver |
| `ui/src/main/ipc.ts` | **Modified** | Electron print fallback, merged printer list |
| `ui/src/renderer/components/batch/BatchConsole.tsx` | **Modified** | `pendingKeyboard` flow, no-datasource fix, keyboard_values in IPC |
| `ui/src/renderer/store/canvas.ts` | **Modified** | Split date/time binding serialization |
| `tests/unit/test_print_pipeline.py` | **New file** | 82 tests covering full print pipeline |
