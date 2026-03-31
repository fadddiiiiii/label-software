# LabelForge — Addendum 02 Gap Fixes + React/Electron Migration Plan

Supplements the existing implementation (Phases 0–2 complete, 72/72 tests passing). Based on two new specification documents:

| Document | Pages | Content |
|----------|-------|---------|
| [Addendum 02 — Gap Fixes & Distribution](file:///Users/fahad/Desktop/Label%20Software/LabelForge_Addendum02_GapFixes_Distribution.pdf) | 20 | 3 feature gaps + Win/macOS distribution plan |
| [React/Electron Implementation Plan](file:///Users/fahad/Desktop/Label%20Software/React/LabelForge_React_Electron_Implementation_Plan.pdf) | 25 | Full PyQt6 → Electron+React+Konva.js migration |

---

## User Review Required

> [!IMPORTANT]
> **Two parallel delivery tracks:** The gap fixes (Phase 3–4) apply to the current PyQt6 codebase and can ship immediately. The React migration (Phase 5) is a 20-week project that replaces the UI layer while keeping all Python backend logic unchanged. **Do you want both tracks, or React only?**

> [!WARNING]
> **React migration does NOT require rewriting Python logic.** The existing `barcode_engine`, `batch_engine`, `formula_engine`, `field_binder`, and `db_manager` become a JSON-RPC subprocess. All Phase 1–2 code is reused unchanged.

> [!CAUTION]
> **macOS distribution requires an Apple Developer Account (USD 99/year)** for code signing and notarization. Without it, Gatekeeper blocks the app for end users.

---

## Phase 3 — Gap Fixes (Addendum 02)

### GAP-01: Multi-Label Sheet Layout `CRITICAL`

Client prints 2×4, 3×3 label sheets (e.g. Avery 24-per-sheet). Current code prints one label per page.

#### [MODIFY] [template_engine.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/template_engine.py)
- Add `SheetLayout` Pydantic model (cols, rows, h_gap_mm, v_gap_mm, margin_top_mm, margin_left_mm)
- Add `label_origin(index, label_w, label_h) → (x_mm, y_mm)` method
- Add `sheet_layout: SheetLayout = SheetLayout()` to [TemplateDocument](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/template_engine.py#86-120) (default 1×1 = backward compatible)

#### [MODIFY] [batch_engine.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/print/batch_engine.py)
- Add `copies_per_label` field (reused by GAP-03)
- Batch loop collects labels into a `sheet_buffer[]`; when full, calls `render_sheet()`
- Full sheet PDF page emitted instead of single-label page

#### [MODIFY] [row_renderer.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/print/row_renderer.py)
- Add `render_sheet()` method: tiles N labels onto A4/Letter page
- Uses `SheetLayout.label_origin()` for positioning each label
- Supports optional clip path for label shapes (rect/round_rect/ellipse)

#### [NEW] Print Console widget ([labelforge/ui/dialogs/print_console.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/ui/dialogs/print_console.py))
- `SheetLayoutWidget(QGroupBox)`: cols/rows spinners, H/V gap, preview label count
- Pre-print dialog with printer selection, copies, sheet layout

#### [MODIFY] [schema.sql](file:///Users/fahad/Desktop/Label%20Software/labelforge/db/schema.sql)
- Add `cols`, [rows](file:///Users/fahad/Desktop/Label%20Software/labelforge/data/sql_adapter.py#98-104), `h_gap_mm`, `v_gap_mm` columns to [printers](file:///Users/fahad/Desktop/Label%20Software/labelforge/db/db_manager.py#237-241) table

---

### GAP-02: Keyboard Input Source `IMPORTANT`

Operator enters values manually at print time (lot number, shift code, operator ID).

#### [MODIFY] [template_engine.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/template_engine.py)
- Expand binding types: `KeyboardBinding`, `SerialBinding`, `DateBinding`, `TimeBinding`
- `KeyboardBinding`: prompt_label, default_value, apply_to_batch flag
- `SerialBinding`: start_value, increment, pad_to_length, prefix
- `DateBinding` / `TimeBinding`: format_str (strftime)

#### [MODIFY] [field_binder.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/field_binder.py)
- `BindingResolver.set_keyboard_values(dict)` — set before batch starts
- [resolve_row()](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/field_binder.py#67-101) handles keyboard → dict lookup, serial → auto-increment, date/time → `datetime.now().strftime()`

#### [MODIFY] [batch_engine.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/print/batch_engine.py)
- Before row loop: detect keyboard bindings → emit signal → wait for UI response
- Use `QMutex` + `QWaitCondition` to block worker thread while UI collects values

#### [NEW] [keyboard_input_dialog.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/ui/dialogs/keyboard_input_dialog.py)
- `KeyboardInputDialog(QDialog)`: one `QLineEdit` per keyboard-bound field
- Returns `{field_id: entered_value}` dict on accept

#### [MODIFY] [canvas_renderer.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/ui/canvas_renderer.py)
- Keyboard-bound elements show a keyboard icon badge in design mode

---

### GAP-03: Ellipse Label Shape + Copies Per Label `MINOR`

#### [MODIFY] [template_engine.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/core/template_engine.py)
- `LabelConfig.shape`: `Literal["rect","round_rect","ellipse"]` = `"rect"`
- `LabelConfig.corner_radius_mm`: `float = 3.0` (for round_rect)
- `LabelConfig.show_border`: `bool = True`

#### [MODIFY] [row_renderer.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/print/row_renderer.py)
- `build_label_clip_path()`: creates ReportLab clip path for rect/round_rect/ellipse

#### [MODIFY] [canvas_renderer.py](file:///Users/fahad/Desktop/Label%20Software/labelforge/ui/canvas_renderer.py)
- `draw_label_boundary()`: uses `drawEllipse` / `drawRoundedRect` / `drawRect` based on shape

#### Print Console
- Copies per label `QSpinBox` (1–99, default 1) added to print dialog

---

## Phase 4 — Distribution

### DIST-01: Windows Distribution

#### [MODIFY] [labelforge.spec](file:///Users/fahad/Desktop/Label%20Software/build/labelforge.spec)
- Update PyInstaller spec with correct `datas`, `hiddenimports`, `excludes`
- UPX compression, Authenticode signing commands

#### [MODIFY] [labelforge.nsi](file:///Users/fahad/Desktop/Label%20Software/build/labelforge.nsi)
- Full NSIS script: Start Menu shortcuts, Desktop shortcut, `.lft` file association, Add/Remove Programs entry, uninstaller

### DIST-02: macOS Distribution

- `py2app` → signed `.app` → `create-dmg` → notarize with `xcrun notarytool`
- Requires: Apple Developer Account ($99/yr), Developer ID Application cert, Xcode CLI tools, `brew install create-dmg`

### DIST-03/04: Delivery + Versioning

- Deliverables: `LabelForge-X.X.X-Setup.exe`, `Portable.zip`, `.dmg`, Release Notes PDF, User Guide PDF
- Versioning: Major.Minor.Patch.Build scheme
- SHA-256 checksums file included with every delivery
- v1.0: Manual update delivery; auto-updater (Sparkle/WinSparkle) planned for v1.2

---

## Phase 5 — React/Electron Migration (20 Weeks)

> [!NOTE]
> **All existing Python backend code is reused unchanged.** Only the UI layer (PyQt6) is replaced with Electron + React. The Python process becomes a JSON-RPC subprocess spawned by Electron.

### Architecture

```
User Action → React UI → ipcRenderer.invoke() → Electron Main → Python subprocess (JSON-RPC over stdio) → JSON result back to React
```

### Tech Stack

| Package | Role |
|---------|------|
| Electron 30.x | Desktop shell, OS APIs, window management |
| React 18.3 + TypeScript 5.5 | UI components, hooks |
| Vite 5.x + vite-plugin-electron | Dev server, HMR, bundler |
| Konva.js 9 + react-konva | Canvas scene graph (replaces QPainter) |
| Zustand 4 + Immer | State management (replaces TemplateEngine observer) |
| electron-builder 24.x | Packaging: NSIS (Win), DMG (macOS), notarization |
| Vitest + Playwright | Unit, component, E2E testing |

### Sub-Phases

#### Phase 5.1 — Scaffold & Electron Shell (Weeks 1–2)
- Init Electron + React + Vite + TypeScript monorepo
- `contextBridge` preload for secure IPC
- Python bridge: spawn Python, JSON-RPC over stdio
- **Gate:** `ipcRenderer.invoke("app:version")` returns Python version string

#### [NEW] Key files
- `src/main/index.ts` — Electron BrowserWindow lifecycle
- `src/main/python-bridge.ts` — spawn Python, JSON-RPC protocol
- `src/main/ipc.ts` — `ipcMain.handle()` definitions
- `src/preload/index.ts` — `contextBridge` security
- `engine/main.py` — JSON-RPC stdio server wrapping existing Python modules

#### Phase 5.2 — Canvas Designer Core (Weeks 3–7)
- Konva `Stage` → Grid Layer → Elements Layer → Selection Layer
- 6 element types: `TextElement`, `BarcodeElement`, `QRElement`, `RectElement`, `LineElement`, `ImageElement`
- Konva `Transformer` for selection handles (resize, no rotation)
- Barcode rendering via IPC: React → Python → PNG base64 → Konva Image
- Rulers (H/V), Toolbox, Properties Panel, Layers Panel (drag-to-reorder)
- Zustand `canvas.ts` store with full undo/redo stack
- **Gate:** Odette label renders from JSON; all 6 element types interactive

#### Phase 5.3 — Data Binding & Field Engine (Weeks 8–10)
- Data source panel: open CSV/Excel via IPC `data:open`
- `DataBindingPanel`: click-to-bind selected element to column
- Preview mode: replaces static values with live data row
- Formula bindings via IPC `formula:eval`
- Keyboard input, serial, date/time binding types
- **Gate:** Live CSV preview; formula evaluated per row

#### Phase 5.4 — Print Pipeline & Batch Console (Weeks 11–13)
- Sheet layout widget (GAP-01) in React
- Print dialog: printer selector, copies, sheet layout, print range
- `BatchConsole` page: live progress bar, per-row status, error log, cancel
- IPC `batch:start` → Python `batch_engine` → `batch:progress` event stream
- PDF export via `dialog.showSaveDialog`
- **Gate:** Batch prints 10 rows to PDF without errors

#### Phase 5.5 — Template Manager & Settings (Weeks 14–16)
- Template library page with thumbnail cards (rendered via Python → base64)
- New template wizard (label size, standard presets)
- Settings: default printer, DPI, autosave, theme
- Database connection dialog
- Import/export `.lft` files
- **Gate:** Template library shows thumbnails; new template wizard works

#### Phase 5.6 — Polish, Testing & Build (Weeks 17–20)
- Micro-interactions, error boundaries, empty states, accessibility
- Unit tests (Vitest): Zustand stores, hooks — target 85%+
- Component tests (RTL): Properties, DataBinding, PrintDialog
- E2E tests (Playwright): open → design → bind → print flow
- `electron-builder`: NSIS (Win), signed DMG (macOS), notarization
- **Gate:** Signed installers on Win10/11 + macOS 13/14; all E2E pass

### IPC Channel Catalogue

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `barcode:render` | React → Python | Render barcode → PNG base64 |
| `template:save/load` | React → Main | .lft file I/O |
| `data:open` | React → Python | Open CSV/Excel, get columns + row count |
| `data:preview` | React → Python | Get row data by index |
| `batch:start` | React → Python | Start batch job |
| `batch:progress` | Python → React | Progress event stream |
| `print:spool` | React → Python | Send to printer |
| `printers:list` | React → Main | OS printer names |
| `formula:eval` | React → Python | Evaluate binding formula |
| `keyboard:input` | React → React | Keyboard input dialog |

---

## Verification Plan

### Phase 3 (Gap Fixes)
- Unit tests for `SheetLayout.label_origin()` — verify label positioning math
- Unit tests for `KeyboardBinding`, `SerialBinding`, `DateBinding`, `TimeBinding` resolution
- Unit test for `build_label_clip_path()` — rect, round_rect, ellipse
- Integration test: render 2×4 sheet layout → verify PDF has 1 page with 8 labels
- Integration test: batch with keyboard binding → verify values injected correctly

### Phase 4 (Distribution)
- PyInstaller build → verify `dist/LabelForge.exe` launches (Windows)
- `py2app` → verify `dist/LabelForge.app` launches (macOS)
- NSIS → verify installer creates shortcuts and file association
- `create-dmg` → verify DMG opens with drag-to-Applications layout

### Phase 5 (React Migration)
- Per-phase gate criteria as listed above
- CI: GitHub Actions — lint, test, build on every PR
- Smoke test on clean VMs: Windows 10/11, macOS 13/14
