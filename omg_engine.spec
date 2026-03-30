# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['omg.rpc_server', 'omg.core.barcode_engine', 'omg.core.formula_engine', 'omg.core.template_engine', 'omg.core.field_binder', 'omg.data.csv_adapter', 'omg.data.excel_adapter', 'omg.data.sql_adapter', 'omg.print.row_renderer', 'omg.print.batch_engine', 'omg.db.db_manager', 'chardet', 'chardet.universaldetector', 'openpyxl', 'xlrd', 'xlwt', 'fitz']
hiddenimports += collect_submodules('barcode')
hiddenimports += collect_submodules('qrcode')
hiddenimports += collect_submodules('chardet')


a = Analysis(
    ['omg/rpc_server.py'],
    pathex=[],
    binaries=[],
    datas=[('omg/core/formula.lark', 'omg/core'), ('omg/db/schema.sql', 'omg/db')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='omg_engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='omg_engine',
)
