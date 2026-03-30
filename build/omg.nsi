; FILE: build/omg.nsi
; NSIS Installer Script for OMG — Windows
; ═══════════════════════════════════════════════════════════════════

!include "MUI2.nsh"

Name "OMG"
OutFile "OMG-Setup.exe"
InstallDir "$PROGRAMFILES\OMG"
InstallDirRegKey HKCU "Software\OMG" "InstallDir"
RequestExecutionLevel admin

; ── UI Configuration ──
!define MUI_ICON "..\ui\assets\icons\icon.png"
!define MUI_UNICON "..\ui\assets\icons\icon.png"
!define MUI_ABORTWARNING

; ── Pages ──
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Install Section ──
Section "Install"
    SetOutPath "$INSTDIR"
    File /r "..\release\win-unpacked\*"

    ; Create Start Menu shortcuts
    CreateDirectory "$SMPROGRAMS\OMG"
    CreateShortCut "$SMPROGRAMS\OMG\OMG.lnk" "$INSTDIR\OMG.exe"
    CreateShortCut "$SMPROGRAMS\OMG\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

    ; Desktop shortcut
    CreateShortCut "$DESKTOP\OMG.lnk" "$INSTDIR\OMG.exe"

    ; Register .omg file extension
    WriteRegStr HKCR ".omg" "" "OMG.Template"
    WriteRegStr HKCR "OMG.Template" "" "OMG Template"
    WriteRegStr HKCR "OMG.Template\DefaultIcon" "" "$INSTDIR\OMG.exe,0"
    WriteRegStr HKCR "OMG.Template\shell\open\command" "" '"$INSTDIR\OMG.exe" "%1"'

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Registry for Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OMG" \
        "DisplayName" "OMG"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OMG" \
        "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OMG" \
        "DisplayVersion" "1.0.0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OMG" \
        "Publisher" "OMG"
SectionEnd

; ── Uninstall Section ──
Section "Uninstall"
    ; Kill processes if running
    ExecWait 'taskkill /F /IM OMG.exe /T'
    ExecWait 'taskkill /F /IM omg_engine.exe /T'

    ; Remove files
    Delete "$INSTDIR\Uninstall.exe"
    RMDir /r "$INSTDIR"

    ; Remove shortcuts
    Delete "$SMPROGRAMS\OMG\*.lnk"
    RMDir "$SMPROGRAMS\OMG"
    Delete "$DESKTOP\OMG.lnk"

    ; Remove AppData (Clean deletion of everything)
    RMDir /r "$APPDATA\omg"
    RMDir /r "$LOCALAPPDATA\omg"
    RMDir /r "$LOCALAPPDATA\omg-updater"

    ; Remove registry keys
    DeleteRegKey HKCR ".omg"
    DeleteRegKey HKCR "OMG.Template"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OMG"
    DeleteRegKey HKCU "Software\OMG"
SectionEnd
