# -*- mode: python ; coding: utf-8 -*-
# FILE: build/omg.spec
# PyInstaller spec for OMG Windows build
# ═══════════════════════════════════════════════════════════════════

import os

block_cipher = None

a = Analysis(
    ['../omg/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('../omg/assets/themes/dark.qss', 'assets/themes'),
        ('../omg/assets/icons', 'assets/icons'),
        ('../omg/assets/fonts', 'assets/fonts'),
        ('../omg/core/formula.lark', 'core'),
        ('../omg/db/schema.sql', 'db'),
    ],
    hiddenimports=[
        'win32print',
        'win32api',
        'PyQt6',
        'PyQt6.QtCore',
        'PyQt6.QtGui',
        'PyQt6.QtWidgets',
        'PyQt6.QtSvg',
        'reportlab',
        'barcode',
        'qrcode',
        'treepoem',
        'pandas',
        'openpyxl',
        'sqlalchemy',
        'lark',
        'pydantic',
        'loguru',
        'omg'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'scipy',
        'numpy',
        'matplotlib',
        'tkinter',
        'test',
        'unittest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='omg_engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,               # windowed=True — hide console
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../ui/assets/icons/icon.png',
    version='version.txt',
)
