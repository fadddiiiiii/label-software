@echo off
REM scripts\build_windows.bat — Windows NSIS Installer Builder
REM ═══════════════════════════════════════════════════════════════════
REM Builds the complete OMG app for Windows distribution.
REM Output: ui\release\OMG-{version}-setup.exe
REM Prerequisites: Node.js, npm, Python 3.11+, NSIS
REM ═══════════════════════════════════════════════════════════════════

echo ═══════════════════════════════════════════════════════
echo  OMG — Windows Distribution Build
echo ═══════════════════════════════════════════════════════

SET SCRIPT_DIR=%~dp0
SET PROJECT_DIR=%SCRIPT_DIR%..

REM ── Step 1: Python Engine Bundle (SPEC-based) ────────────────────────
echo [1/5] Building Python engine bundle...

cd /d "%PROJECT_DIR%"
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
)

pip install -q pyinstaller 2>nul
pyinstaller --noconfirm --clean omg_engine.spec

if %ERRORLEVEL% neq 0 ( echo pyinstaller failed && exit /b 1 )
echo    Python engine built

REM ── Step 2: React/Electron Build ────────────────────────────────
echo [2/5] Building Electron app...

cd /d "%PROJECT_DIR%\ui"
call npm ci --silent
call npm run build

echo    Electron app built

REM ── Step 3: Copy Python Engine into Electron Bundle Folder ──────────
echo [3/5] Packaging Python engine...

if exist "%PROJECT_DIR%\ui\engine_bin" rmdir /s /q "%PROJECT_DIR%\ui\engine_bin"
mkdir "%PROJECT_DIR%\ui\engine_bin" 2>nul
xcopy /e /i /q "%PROJECT_DIR%\dist\omg_engine" "%PROJECT_DIR%\ui\engine_bin"

echo    Engine packaged

REM ── Step 4: Build NSIS Installer ────────────────────────────────
echo [4/5] Building Windows installer...

cd /d "%PROJECT_DIR%\ui"
call npx electron-builder --win --config --publish never

echo    Installer built

REM ── Step 5: Report ──────────────────────────────────────────────
echo [5/5] Build complete!
echo.
dir /b "%PROJECT_DIR%\ui\release\*.exe" 2>nul
echo.
echo ═══════════════════════════════════════════════════════
echo  Full OMG package ready in: ui\release\
echo ═══════════════════════════════════════════════════════
pause
