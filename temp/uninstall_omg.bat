@echo off
setlocal
echo ========================================
echo OMG Standalone Uninstaller
echo ========================================
echo.

set APP_NAME=OMG
set ENGINE_NAME=omg_engine.exe
set INSTALL_DIR=%PROGRAMFILES%\OMG
set APPDATA_DIR=%APPDATA%\omg
set LOCAL_APPDATA_DIR=%LOCALAPPDATA%\omg

echo Stopping %APP_NAME%...
taskkill /F /IM "%APP_NAME%.exe" /T 2>nul
taskkill /F /IM "%ENGINE_NAME%" /T 2>nul

echo.
echo Removing installation files...
if exist "%INSTALL_DIR%" (
    rd /s /q "%INSTALL_DIR%"
    echo Removed %INSTALL_DIR%
)

echo.
echo Removing user data...
if exist "%APPDATA_DIR%" (
    rd /s /q "%APPDATA_DIR%"
    echo Removed %APPDATA_DIR%
)
if exist "%LOCAL_APPDATA_DIR%" (
    rd /s /q "%LOCAL_APPDATA_DIR%"
    echo Removed %LOCAL_APPDATA_DIR%
)

echo.
echo Removing registry keys...
reg delete "HKCU\Software\%APP_NAME%" /f 2>nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\%APP_NAME%" /f 2>nul
reg delete "HKCR\.omg" /f 2>nul
reg delete "HKCR\%APP_NAME%.Template" /f 2>nul

echo.
echo Removing shortcuts...
del /f /q "%SMPROGRAMS\%APP_NAME%\*.lnk" 2>nul
rd /s /q "%SMPROGRAMS\%APP_NAME%" 2>nul
del /f /q "%DESKTOP\%APP_NAME%.lnk" 2>nul

echo.
echo ----------------------------------------
echo %APP_NAME% has been completely removed.
echo ----------------------------------------
pause
