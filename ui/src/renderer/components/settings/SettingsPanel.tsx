// src/renderer/components/settings/SettingsPanel.tsx
// Full 9-section Settings panel + About page with feedback form
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, X, Monitor, Layout, Tag, Printer, Database,
  Zap, Keyboard, RefreshCw, Terminal, RotateCcw,
  Check, AlertTriangle, Trash2, Download
} from 'lucide-react';
import { useSettingsStore } from '../../store/settings';
import { useCanvasStoreCompat } from '../../store/canvas';
import { UNIT_OPTIONS, rulerUnitFor } from '../../lib/units';

// ──────────────────────────────────────────────────────────────────────
// Helpers  (dark = true when inside the dark modal, default = light)
// ──────────────────────────────────────────────────────────────────────

const DarkCtx = React.createContext(false);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
      {children}
    </div>
  );
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>{children}</div>;
}

function SettingRow({
  label, description, children, restart,
}: {
  label: string; description?: string; children: React.ReactNode; restart?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid var(--border-subtle)`, gap: 24 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {restart && <span style={{ fontSize: 9, fontWeight: 700, background: '#f59e0b22', color: '#f59e0b', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Restart</span>}
        </div>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, background: value ? '#6366f1' : '#e0e0e0',
      position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18,
        background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function SelectInput({ value, onChange, options, width = 160 }: {
  value: string | number; onChange: (v: string) => void; options: [string | number, string][]; width?: number;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
      border: `1px solid var(--border-default)`, borderRadius: 8,
      padding: '7px 12px', fontSize: 12, fontFamily: "'Poppins', sans-serif",
      cursor: 'pointer', outline: 'none', width,
    }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          border: `1px solid var(--border-default)`, borderRadius: 8,
          padding: '7px 10px', fontSize: 12, fontFamily: "'Poppins', sans-serif", width: 80, outline: 'none',
        }} />
      {suffix && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, width = 200 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  return (
    <input type="text" value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: `1px solid var(--border-default)`, borderRadius: 8,
        padding: '7px 12px', fontSize: 12, fontFamily: "'Poppins', sans-serif", outline: 'none', width,
      }} />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid var(--border-default)`, cursor: 'pointer', padding: 2, background: 'var(--bg-primary)' }} />
      <TextInput value={value} onChange={onChange} width={90} />
    </div>
  );
}

function DangerButton({ label, icon: Icon, onClick, confirm }: {
  label: string; icon: any; onClick: () => void; confirm?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const handleClick = () => {
    if (confirm && !confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 3000); return; }
    onClick(); setConfirming(false);
  };
  return (
    <button onClick={handleClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8,
      border: confirming ? 'none' : '1px solid color-mix(in srgb, var(--border-default), #ef4444 30%)',
      background: confirming ? '#ef4444' : 'var(--bg-elevated)', color: confirming ? '#fff' : '#ef4444',
      fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", cursor: 'pointer', transition: 'all 0.2s',
    }}>
      <Icon size={14} /> {confirming ? 'Click again to confirm' : label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 9 Settings Sections
// ──────────────────────────────────────────────────────────────────────

function SectionGeneral() {
  const s = useSettingsStore();
  return (
    <div>
      <SectionTitle>General</SectionTitle>
      <SectionDesc>Appearance, language, and startup behaviour.</SectionDesc>
      <SettingRow label="Theme" description="UI colour scheme">
        <SelectInput value={s.theme} onChange={v => s.set('theme', v as any)} options={[['light','Light'],['dark','Dark'],['dracula','Dracula'],['midnight','Midnight Blue'],['system','System Default']]} />
      </SettingRow>
      <SettingRow label="Language" description="UI language (requires restart)" restart>
        <SelectInput value={s.language} onChange={v => s.set('language', v)} options={[
          ['en','English (US)'],['en-GB','English (UK)'],
          ['ar','العربية (Arabic)'],['zh','中文 (Chinese)'],['nl','Nederlands (Dutch)'],
          ['fr','Français (French)'],['de','Deutsch (German)'],['el','Ελληνικά (Greek)'],
          ['he','עברית (Hebrew)'],['hi','हिन्दी (Hindi)'],['it','Italiano (Italian)'],
          ['ja','日本語 (Japanese)'],['ko','한국어 (Korean)'],['pl','Polski (Polish)'],
          ['pt','Português (Portuguese)'],['ru','Русский (Russian)'],['es','Español (Spanish)'],
          ['ta','தமிழ் (Tamil)'],['te','తెలుగు (Telugu)'],['th','ไทย (Thai)'],
          ['tr','Türkçe (Turkish)'],['ur','اردو (Urdu)'],['vi','Tiếng Việt (Vietnamese)'],
        ]} width={220} />
      </SettingRow>
      <SettingRow label="Default Units" description="Used for ruler, properties, and all dimension inputs">
        <SelectInput value={s.units} onChange={v => {
          s.set('units', v as any);
          s.set('rulerUnits', v as any);
        }} options={UNIT_OPTIONS} />
      </SettingRow>
      <SettingRow label="Auto-save Interval" description="0 = disabled">
        <NumberInput value={s.autoSaveMinutes} onChange={v => s.set('autoSaveMinutes', v)} min={0} max={60} suffix="mins" />
      </SettingRow>
      <SettingRow label="Startup Behaviour" description="What shows on launch">
        <SelectInput value={s.startupBehaviour} onChange={v => s.set('startupBehaviour', v as any)} options={[['last','Last Template'],['library','Template Library'],['blank','Blank Canvas']]} />
      </SettingRow>
      <SettingRow label="Recent Files Count">
        <NumberInput value={s.recentFilesCount} onChange={v => s.set('recentFilesCount', v)} min={1} max={50} />
      </SettingRow>
      <SettingRow label="Restore Window Size" description="Remember window position and size">
        <Toggle value={s.restoreWindowSize} onChange={v => s.set('restoreWindowSize', v)} />
      </SettingRow>
      <SettingRow label="Telemetry" description="Send anonymous crash reports to improve OMG">
        <Toggle value={s.telemetry} onChange={v => s.set('telemetry', v)} />
      </SettingRow>
      <SettingRow label="Confirm Before Close" description="Show dialog when closing with unsaved changes">
        <Toggle value={s.confirmBeforeClose} onChange={v => s.set('confirmBeforeClose', v)} />
      </SettingRow>
  
    </div>
  );
}

function SectionWorkspace() {
  const s = useSettingsStore();
  const canvas = useCanvasStoreCompat();
  // Sync workspace settings to canvas store
  useEffect(() => { canvas.setZoom(s.defaultZoom); }, [s.defaultZoom]);
  useEffect(() => { if (s.snapToGrid !== canvas.snapToGrid) canvas.toggleSnap(); }, [s.snapToGrid]);
  useEffect(() => { if (s.showRulers !== canvas.showGrid) canvas.toggleGrid(); }, []);

  return (
    <div>
      <SectionTitle>Designer Workspace</SectionTitle>
      <SectionDesc>Canvas, grid, rulers, zoom, and colour settings.</SectionDesc>
      <SettingRow label="Default Zoom" description="Canvas zoom level when a template opens">
        <SelectInput value={s.defaultZoom} onChange={v => s.set('defaultZoom', Number(v))} options={[[0.5,'50%'],[0.75,'75%'],[1,'100%'],[1.25,'125%'],[1.5,'150%'],[2,'200%']]} />
      </SettingRow>
      <SettingRow label="Grid Size">
        <NumberInput value={s.gridSizeMm} onChange={v => s.set('gridSizeMm', v)} min={1} max={50} suffix="mm" />
      </SettingRow>
      <SettingRow label="Snap to Grid">
        <Toggle value={s.snapToGrid} onChange={v => s.set('snapToGrid', v)} />
      </SettingRow>
      <SettingRow label="Snap Threshold">
        <NumberInput value={s.snapThresholdMm} onChange={v => s.set('snapThresholdMm', v)} min={0.1} max={5} step={0.1} suffix="mm" />
      </SettingRow>
      <SettingRow label="Show Rulers">
        <Toggle value={s.showRulers} onChange={v => s.set('showRulers', v)} />
      </SettingRow>
      <SettingRow label="Ruler Units" description="Override to differ from default units">
        <SelectInput value={s.rulerUnits} onChange={v => s.set('rulerUnits', v as any)} options={UNIT_OPTIONS} width={180} />
      </SettingRow>
      <SettingRow label="Canvas Background" description="Background fill of the label surface">
        <ColorInput value={s.canvasBackground} onChange={v => s.set('canvasBackground', v)} />
      </SettingRow>
      <SettingRow label="Workspace Background" description="Area surrounding the canvas">
        <ColorInput value={s.workspaceBackground} onChange={v => s.set('workspaceBackground', v)} />
      </SettingRow>
      <SettingRow label="Show Binding Dots" description="Cyan dots on data-bound elements">
        <Toggle value={s.showBindingDots} onChange={v => s.set('showBindingDots', v)} />
      </SettingRow>
      <SettingRow label="Show Element Tooltips">
        <Toggle value={s.showElementTooltips} onChange={v => s.set('showElementTooltips', v)} />
      </SettingRow>
      <SettingRow label="Default Font" description="Applied to new Text elements">
        <SelectInput value={s.defaultFont} onChange={v => s.set('defaultFont', v)} options={[['Helvetica Neue','Helvetica Neue'],['Arial','Arial'],['Inter','Inter'],['Roboto','Roboto'],['Courier New','Courier New']]} />
      </SettingRow>
      <SettingRow label="Default Font Size">
        <NumberInput value={s.defaultFontSize} onChange={v => s.set('defaultFontSize', v)} min={6} max={144} suffix="pt" />
      </SettingRow>
    </div>
  );
}

function SectionDimensions() {
  const s = useSettingsStore();
  return (
    <div>
      <SectionTitle>Default Label Dimensions</SectionTitle>
      <SectionDesc>Template presets and default label size for new designs.</SectionDesc>
      <SettingRow label="Default Width">
        <NumberInput value={s.defaultLabelWidth} onChange={v => s.set('defaultLabelWidth', v)} min={1} max={1000} suffix="mm" />
      </SettingRow>
      <SettingRow label="Default Height">
        <NumberInput value={s.defaultLabelHeight} onChange={v => s.set('defaultLabelHeight', v)} min={1} max={1000} suffix="mm" />
      </SettingRow>
      <SettingRow label="Default Shape">
        <SelectInput value={s.defaultLabelShape} onChange={v => s.set('defaultLabelShape', v as any)} options={[['rect','Shape'],['ellipse','Ellipse'],['round_rect','Rounded Rectangle']]} />
      </SettingRow>
      <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sheet Layout</div>
      <SettingRow label="Columns">
        <NumberInput value={s.sheetCols} onChange={v => s.set('sheetCols', v)} min={1} max={20} />
      </SettingRow>
      <SettingRow label="Rows">
        <NumberInput value={s.sheetRows} onChange={v => s.set('sheetRows', v)} min={1} max={50} />
      </SettingRow>
      <SettingRow label="Column Gap">
        <NumberInput value={s.colGapMm} onChange={v => s.set('colGapMm', v)} min={0} max={50} suffix="mm" />
      </SettingRow>
      <SettingRow label="Row Gap">
        <NumberInput value={s.rowGapMm} onChange={v => s.set('rowGapMm', v)} min={0} max={50} suffix="mm" />
      </SettingRow>
      <SettingRow label="Sheet Page Size">
        <SelectInput value={s.sheetPageSize} onChange={v => s.set('sheetPageSize', v)} options={[['A4','A4'],['A3','A3'],['Letter','US Letter'],['Legal','US Legal'],['A5','A5']]} />
      </SettingRow>
      <SettingRow label="Sheet Orientation">
        <SelectInput value={s.sheetOrientation} onChange={v => s.set('sheetOrientation', v as any)} options={[['portrait','Portrait'],['landscape','Landscape']]} width={120} />
      </SettingRow>
      <SettingRow label="Top Margin">
        <NumberInput value={s.sheetTopMarginMm} onChange={v => s.set('sheetTopMarginMm', v)} min={0} max={100} suffix="mm" />
      </SettingRow>
      <SettingRow label="Left Margin">
        <NumberInput value={s.sheetLeftMarginMm} onChange={v => s.set('sheetLeftMarginMm', v)} min={0} max={100} suffix="mm" />
      </SettingRow>
    </div>
  );
}

function SectionBarcode() {
  const s = useSettingsStore();
  return (
    <div>
      <SectionTitle>Barcode &amp; Print</SectionTitle>
      <SectionDesc>Symbology defaults, encoding, language, DPI, and printer configuration.</SectionDesc>
      <SettingRow label="Default Symbology">
        <SelectInput value={s.defaultSymbology} onChange={v => s.set('defaultSymbology', v)} options={[
          ['code128','Code 128'],['code39','Code 39'],['code39ext','Code 39 Extended'],
          ['ean13','EAN-13'],['ean8','EAN-8'],['upca','UPC-A'],['upce','UPC-E'],
          ['itf14','ITF-14'],['interleaved2of5','Interleaved 2 of 5'],
          ['gs1-128','GS1-128'],['gs1datamatrix','GS1 DataMatrix'],
          ['qrcode','QR Code'],['datamatrix','DataMatrix'],['pdf417','PDF 417'],
          ['azteccode','Aztec Code'],['maxicode','MaxiCode'],
          ['micropdf417','MicroPDF417'],['microqrcode','Micro QR Code'],
        ]} width={200} />
      </SettingRow>
      <SettingRow label="Barcode Encoding" description="Character encoding for barcode data">
        <SelectInput value={s.barcodeEncoding} onChange={v => s.set('barcodeEncoding', v)} options={[
          ['UTF-8','UTF-8 (Default)'],['ASCII','ASCII'],['ISO-8859-1','ISO 8859-1 (Latin-1)'],
          ['ISO-8859-2','ISO 8859-2 (Latin-2)'],['ISO-8859-5','ISO 8859-5 (Cyrillic)'],
          ['ISO-8859-6','ISO 8859-6 (Arabic)'],['ISO-8859-7','ISO 8859-7 (Greek)'],
          ['ISO-8859-8','ISO 8859-8 (Hebrew)'],['ISO-8859-9','ISO 8859-9 (Turkish)'],
          ['ISO-8859-15','ISO 8859-15 (Latin-9)'],
          ['Shift_JIS','Shift JIS (Japanese)'],['EUC-KR','EUC-KR (Korean)'],
          ['GB2312','GB2312 (Simplified Chinese)'],['Big5','Big5 (Traditional Chinese)'],
          ['Windows-1251','Windows-1251 (Cyrillic)'],['Windows-1252','Windows-1252 (Western)'],
          ['Windows-1256','Windows-1256 (Arabic)'],
        ]} width={220} />
      </SettingRow>
      <SettingRow label="Barcode Language" description="Language context for barcode text and number formatting">
        <SelectInput value={s.barcodeLanguage} onChange={v => s.set('barcodeLanguage', v)} options={[
          ['en','English'],['ar','العربية (Arabic)'],['zh','中文 (Chinese)'],
          ['nl','Nederlands (Dutch)'],['fr','Français (French)'],['de','Deutsch (German)'],
          ['el','Ελληνικά (Greek)'],['he','עברית (Hebrew)'],['hi','हिन्दी (Hindi)'],
          ['it','Italiano (Italian)'],['ja','日本語 (Japanese)'],['ko','한국어 (Korean)'],
          ['pl','Polski (Polish)'],['pt','Português (Portuguese)'],['ru','Русский (Russian)'],
          ['es','Español (Spanish)'],['ta','தமிழ் (Tamil)'],['te','తెలుగు (Telugu)'],
          ['th','ไทย (Thai)'],['tr','Türkçe (Turkish)'],['ur','اردو (Urdu)'],['vi','Tiếng Việt (Vietnamese)'],
        ]} width={220} />
      </SettingRow>
      <SettingRow label="Barcode Text Font" description="Font for human-readable text below barcodes">
        <SelectInput value={s.barcodeTextFont} onChange={v => s.set('barcodeTextFont', v)} options={[
          ['Helvetica','Helvetica'],['Arial','Arial'],['Courier','Courier'],['OCR-B','OCR-B'],
          ['Roboto','Roboto'],['Inter','Inter'],['Noto Sans','Noto Sans'],
        ]} width={160} />
      </SettingRow>
      <SettingRow label="Text Position" description="Default human-readable text position">
        <SelectInput value={s.barcodeTextPosition} onChange={v => s.set('barcodeTextPosition', v as any)} options={[['below','Below Barcode'],['above','Above Barcode']]} width={160} />
      </SettingRow>
      <SettingRow label="Barcode Render DPI">
        <SelectInput value={s.barcodeRenderDpi} onChange={v => s.set('barcodeRenderDpi', Number(v))} options={[[203,'203 DPI (Thermal)'],[300,'300 DPI (Standard)'],[600,'600 DPI (High Quality)'],[1200,'1200 DPI (Ultra)']]} width={200} />
      </SettingRow>
      <SettingRow label="Quiet Zone Factor" description="Multiplier for barcode quiet zone (min: 10×)">
        <NumberInput value={s.quietZoneFactor} onChange={v => s.set('quietZoneFactor', v)} min={1} max={50} suffix="×" />
      </SettingRow>
      <SettingRow label="Include Checksum" description="Auto-append checksum digit where applicable">
        <Toggle value={s.includeChecksum} onChange={v => s.set('includeChecksum', v)} />
      </SettingRow>
      <SettingRow label="Show Barcode Text" description="Human-readable value below barcode by default">
        <Toggle value={s.showBarcodeText} onChange={v => s.set('showBarcodeText', v)} />
      </SettingRow>
      <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Print Defaults</div>
      <SettingRow label="Copies per Label">
        <NumberInput value={s.copiesPerLabel} onChange={v => s.set('copiesPerLabel', v)} min={1} max={100} />
      </SettingRow>
      <SettingRow label="Print Orientation">
        <SelectInput value={s.printOrientation} onChange={v => s.set('printOrientation', v as any)} options={[['portrait','Portrait'],['landscape','Landscape']]} width={120} />
      </SettingRow>
      <SettingRow label="PDF Resolution">
        <SelectInput value={s.pdfResolution} onChange={v => s.set('pdfResolution', Number(v))} options={[[150,'150 DPI'],[300,'300 DPI'],[600,'600 DPI']]} width={120} />
      </SettingRow>
      <SettingRow label="Colour Profile">
        <SelectInput value={s.colourProfile} onChange={v => s.set('colourProfile', v)} options={[['sRGB','sRGB'],['AdobeRGB','Adobe RGB'],['CMYK','CMYK (print)']]} width={140} />
      </SettingRow>
      <SettingRow label="Label Offset X" description="Correct horizontal printer misalignment">
        <NumberInput value={s.labelOffsetX} onChange={v => s.set('labelOffsetX', v)} min={-20} max={20} step={0.1} suffix="mm" />
      </SettingRow>
      <SettingRow label="Label Offset Y" description="Correct vertical printer misalignment">
        <NumberInput value={s.labelOffsetY} onChange={v => s.set('labelOffsetY', v)} min={-20} max={20} step={0.1} suffix="mm" />
      </SettingRow>
      <SettingRow label="Print Preview" description="Show preview dialog before printing">
        <Toggle value={s.printPreview} onChange={v => s.set('printPreview', v)} />
      </SettingRow>
    </div>
  );
}

function SectionDataSources() {
  const s = useSettingsStore();
  return (
    <div>
      <SectionTitle>Data Sources</SectionTitle>
      <SectionDesc>Default paths, encoding settings, and database configuration.</SectionDesc>
      <SettingRow label="Default Data Folder">
        <TextInput value={s.defaultDataFolder} onChange={v => s.set('defaultDataFolder', v)} placeholder="~/Documents" width={220} />
      </SettingRow>
      <SettingRow label="CSV Encoding">
        <SelectInput value={s.csvEncoding} onChange={v => s.set('csvEncoding', v)} options={[['UTF-8','UTF-8'],['UTF-16','UTF-16'],['ISO-8859-1','ISO-8859-1 (Latin-1)'],['Windows-1252','Windows-1252']]} width={200} />
      </SettingRow>
      <SettingRow label="CSV Delimiter">
        <SelectInput value={s.csvDelimiter} onChange={v => s.set('csvDelimiter', v)} options={[[',','Comma (,'],['\\t','Tab'],[';','Semicolon (;)'],['|','Pipe (|)']]} width={160} />
      </SettingRow>
      <SettingRow label="Date Format">
        <TextInput value={s.dateFormat} onChange={v => s.set('dateFormat', v)} placeholder="YYYY-MM-DD" width={140} />
      </SettingRow>
      <SettingRow label="Time Format">
        <TextInput value={s.timeFormat} onChange={v => s.set('timeFormat', v)} placeholder="HH:mm:ss" width={140} />
      </SettingRow>
      <SettingRow label="Null Value Display" description="How empty/null cells appear in bound fields">
        <TextInput value={s.nullValueDisplay} onChange={v => s.set('nullValueDisplay', v)} placeholder="—" width={80} />
      </SettingRow>
      <SettingRow label="Auto-detect Column Types" description="Infer date, number types on CSV open">
        <Toggle value={s.autoDetectTypes} onChange={v => s.set('autoDetectTypes', v)} />
      </SettingRow>
      <SettingRow label="Max Preview Rows">
        <NumberInput value={s.maxPreviewRows} onChange={v => s.set('maxPreviewRows', v)} min={10} max={5000} />
      </SettingRow>
      <SettingRow label="DB Connection Timeout">
        <NumberInput value={s.defaultDbTimeout} onChange={v => s.set('defaultDbTimeout', v)} min={5} max={300} suffix="secs" />
      </SettingRow>
      <SettingRow label="Cache Data Source" description="Cache loaded data in memory during batch jobs">
        <Toggle value={s.cacheDataSource} onChange={v => s.set('cacheDataSource', v)} />
      </SettingRow>
    </div>
  );
}

function SectionPerformance() {
  const s = useSettingsStore();
  return (
    <div>
      <SectionTitle>Performance</SectionTitle>
      <SectionDesc>Rendering cache, undo history, and hardware acceleration.</SectionDesc>
      <SettingRow label="Hardware Acceleration" description="Use GPU for canvas rendering" restart>
        <Toggle value={s.hardwareAcceleration} onChange={v => s.set('hardwareAcceleration', v)} />
      </SettingRow>
      <SettingRow label="Barcode Image Cache" description="Cache rendered barcode PNGs in memory">
        <Toggle value={s.barcodeImageCache} onChange={v => s.set('barcodeImageCache', v)} />
      </SettingRow>
      <SettingRow label="Cache Size Limit">
        <SelectInput value={s.cacheSizeLimitMb} onChange={v => s.set('cacheSizeLimitMb', Number(v))} options={[[64,'64 MB'],[128,'128 MB'],[256,'256 MB'],[512,'512 MB']]} width={110} />
      </SettingRow>
      <SettingRow label="Pre-render on Load" description="Render all barcodes when template opens">
        <Toggle value={s.preRenderOnLoad} onChange={v => s.set('preRenderOnLoad', v)} />
      </SettingRow>
      <SettingRow label="Undo Stack Depth" description="Maximum undo steps stored in memory">
        <NumberInput value={s.undoStackDepth} onChange={v => s.set('undoStackDepth', v)} min={5} max={200} />
      </SettingRow>
      <SettingRow label="Element Count Warning" description="Show warning when exceeding this many elements">
        <NumberInput value={s.elementCountWarning} onChange={v => s.set('elementCountWarning', v)} min={10} max={1000} />
      </SettingRow>
      <SettingRow label="Canvas Layer Caching" description="Enable Konva layer caching for locked elements">
        <Toggle value={s.canvasLayerCaching} onChange={v => s.set('canvasLayerCaching', v)} />
      </SettingRow>
      <SettingRow label="Smooth Zoom" description="Interpolate canvas zoom transitions">
        <Toggle value={s.smoothZoom} onChange={v => s.set('smoothZoom', v)} />
      </SettingRow>
      <SettingRow label="Reduce Motion" description="Disable non-essential animations (accessibility)">
        <Toggle value={s.reduceMotion} onChange={v => s.set('reduceMotion', v)} />
      </SettingRow>
    </div>
  );
}

const DEFAULT_SHORTCUTS: [string, string, string, boolean][] = [
  // Tools
  ['Select Tool (Deselect)', 'V', 'Tools', true],
  ['Text Tool', 'T', 'Tools', true],
  ['Barcode Tool', 'B', 'Tools', true],
  ['QR Code Tool', 'Q', 'Tools', true],
  ['Rectangle / Shape Tool', 'R', 'Tools', true],
  ['Line Tool', 'L', 'Tools', true],
  ['Image Tool', 'I', 'Tools', true],
  // Canvas
  ['Delete Element', 'Del / Backspace', 'Canvas', false],
  ['Deselect All', 'Esc', 'Canvas', false],
  ['Duplicate Element', '⌘D / Ctrl+D', 'Canvas', true],
  ['Copy', '⌘C / Ctrl+C', 'Canvas', false],
  ['Cut', '⌘X / Ctrl+X', 'Canvas', false],
  ['Paste', '⌘V / Ctrl+V', 'Canvas', false],
  ['Select All', '⌘A / Ctrl+A', 'Canvas', true],
  ['Nudge 1mm', '← → ↑ ↓', 'Canvas', false],
  ['Nudge 10mm', 'Shift + Arrow', 'Canvas', false],
  ['Nudge 0.1mm', 'Alt + Arrow', 'Canvas', false],
  ['Lock / Unlock', '⌘⇧L / Ctrl+Shift+L', 'Canvas', true],
  ['Hide / Show', '⌘⇧H / Ctrl+Shift+H', 'Canvas', true],
  ['Mirror Horizontal', 'Alt+H', 'Canvas', true],
  // Z-Order
  ['Bring to Front', '⌘⇧] / Ctrl+Shift+]', 'Layer', true],
  ['Send to Back', '⌘⇧[ / Ctrl+Shift+[', 'Layer', true],
  ['Bring Forward', '⌘] / Ctrl+]', 'Layer', true],
  ['Send Backward', '⌘[ / Ctrl+[', 'Layer', true],
  // History
  ['Undo', '⌘Z / Ctrl+Z', 'History', false],
  ['Redo', '⌘⇧Z / Ctrl+Shift+Z', 'History', false],
  ['Redo (Alt)', '⌘Y / Ctrl+Y', 'History', false],
  // View
  ['Zoom In', '⌘+ / Ctrl++', 'View', false],
  ['Zoom Out', '⌘- / Ctrl+-', 'View', false],
  ['Reset Zoom (100%)', '⌘0 / Ctrl+0', 'View', false],
  ['Zoom to Fit', '⌘⇧1 / Ctrl+Shift+1', 'View', true],
  ['Toggle Grid', '⌘G / Ctrl+G', 'View', true],
  ['Toggle Snap', "⌘' / Ctrl+Shift+G", 'View', true],
  ['Ctrl+Scroll', 'Ctrl + Scroll Wheel', 'View', false],
  // File
  ['Save Template', '⌘S / Ctrl+S', 'File', false],
  ['Save As', '⌘⇧S / Ctrl+Shift+S', 'File', false],
  ['Open Template', '⌘O / Ctrl+O', 'File', false],
  ['New Label', '⌘N / Ctrl+N', 'File', true],
  ['Print', '⌘P / Ctrl+P', 'File', false],
  // Tabs
  ['New Tab', '⌘T / Ctrl+T', 'Tabs', true],
  ['Close Tab', '⌘W / Ctrl+W', 'Tabs', false],
  ['Close All Tabs', '⌘⇧W / Ctrl+Shift+W', 'Tabs', false],
  ['Next Tab', '⌘Tab / Ctrl+Tab', 'Tabs', false],
  ['Previous Tab', '⌘⇧Tab / Ctrl+Shift+Tab', 'Tabs', false],
  ['Jump to Tab 1–9', '⌘1–⌘9 / Ctrl+1–9', 'Tabs', false],
];

function SectionShortcuts() {
  const [search, setSearch] = useState('');
  const filtered = DEFAULT_SHORTCUTS.filter(([action]) => action.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <SectionDesc>Reference and customise all keyboard shortcuts.</SectionDesc>
      <input type="text" placeholder="Search shortcuts…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontFamily: "'Poppins', sans-serif", outline: 'none', marginBottom: 20, width: '100%' }} />
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span>Action</span><span>Shortcut</span><span>Category</span><span>Rebindable</span>
        </div>
        {filtered.map(([action, shortcut, category, rebindable]) => (
          <div key={action} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{action}</span>
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
              {shortcut.split(' / ').map(k => (
                <kbd key={k} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '2px 6px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{k}</kbd>
              ))}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{category}</span>
            <span style={{ fontSize: 11, color: rebindable ? '#6366f1' : 'var(--text-muted)' }}>{rebindable ? 'Yes' : 'System'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionUpdates() {
  const s = useSettingsStore();
  const [checkStatus, setCheckStatus] = useState<null | 'checking' | 'available' | 'uptodate' | 'downloading' | 'ready' | 'error'>('uptodate');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    (window as any).electron.ipcRenderer.invoke('app:get-version').then(setVersion);
  }, []);

  useEffect(() => {
    const unsubStatus = (window as any).electron.ipcRenderer.on('update:status', (status: any, info?: any) => {
      setCheckStatus(status);
      if (info) setUpdateInfo(info);
      if (status === 'error' && typeof info === 'string') setErrorMsg(info);
    });

    const unsubProgress = (window as any).electron.ipcRenderer.on('update:progress', (percent: number) => {
      setCheckStatus('downloading');
      setProgress(percent);
    });

    return () => {
      unsubStatus();
      unsubProgress();
    };
  }, []);

  const handleCheck = async () => {
    setErrorMsg('');
    await (window as any).electron.ipcRenderer.invoke('app:check-updates');
  };

  const handleDownload = async () => {
    await (window as any).electron.ipcRenderer.invoke('app:download-update');
  };

  const handleInstall = () => {
    (window as any).electron.ipcRenderer.invoke('app:install-update');
  };
  return (
    <div>
      <SectionTitle>Updates &amp; Notifications</SectionTitle>
      <SectionDesc>Auto-update settings, channels, and in-app notification preferences.</SectionDesc>
      <SettingRow label="Auto-check for Updates" description="Check for new versions on startup">
        <Toggle value={s.autoCheckUpdates} onChange={v => s.set('autoCheckUpdates', v)} />
      </SettingRow>
      <SettingRow label="Check Interval">
        <SelectInput value={s.checkIntervalHours} onChange={v => s.set('checkIntervalHours', Number(v))} options={[[1,'Every hour'],[6,'Every 6 hours'],[24,'Every 24 hours'],[168,'Every week']]} width={160} />
      </SettingRow>
      <SettingRow label="Update Channel">
        <SelectInput value={s.updateChannel} onChange={v => s.set('updateChannel', v as any)} options={[['stable','Stable'],['beta','Beta'],['nightly','Nightly']]} width={110} />
      </SettingRow>
      <SettingRow label="Auto-download Updates" description="Download in background (install on approval)">
        <Toggle value={s.autoDownloadUpdates} onChange={v => s.set('autoDownloadUpdates', v)} />
      </SettingRow>
      <SettingRow label="Show Update Badge" description="Badge on nav icon when update is ready">
        <Toggle value={s.showUpdateBadge} onChange={v => s.set('showUpdateBadge', v)} />
      </SettingRow>
      <SettingRow label="Desktop Notifications" description="OS notification when update downloads">
        <Toggle value={s.notifyOnDesktop} onChange={v => s.set('notifyOnDesktop', v)} />
      </SettingRow>
      <SettingRow label="Proxy for Updates" description="HTTP/HTTPS proxy URL if behind a firewall">
        <TextInput value={s.updateProxy} onChange={v => s.set('updateProxy', v)} placeholder="http://proxy:8080" width={220} />
      </SettingRow>
      <SettingRow label="Installed Version">
        <span style={{ 
          fontSize: 11, 
          fontWeight: 700, 
          color: 'var(--brand-primary, #6366f1)', 
          background: 'var(--brand-faint, #6366f115)', 
          padding: '4px 12px', 
          borderRadius: 20, 
          border: '1px solid var(--brand-soft, #6366f130)',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          letterSpacing: '0.05em'
        }}>
          v{version}
        </span>
      </SettingRow>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {checkStatus === 'downloading' && (
          <div style={{ width: '100%', maxWidth: 300 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Downloading update…</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#6366f1', width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleCheck} disabled={checkStatus === 'checking' || checkStatus === 'downloading'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: '1px solid #6366f1',
            background: '#6366f111', color: '#6366f1', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (checkStatus === 'checking' || checkStatus === 'downloading') ? 0.5 : 1
          }}>
            {checkStatus === 'checking' ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</> :
             <><RefreshCw size={14} /> Check for Updates</>}
          </button>

          {checkStatus === 'available' && (
            <button onClick={handleDownload} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              <Download size={14} /> Download v{updateInfo?.version}
            </button>
          )}

          {checkStatus === 'ready' && (
            <button onClick={handleInstall} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              <Zap size={14} /> Restart to Install Update
            </button>
          )}
        </div>

        {checkStatus === 'uptodate' && <div style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> OMG is up to date</div>}
        {checkStatus === 'error' && <div style={{ fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> Update Error: {errorMsg}</div>}
      </div>
    </div>
  );
}

function SectionAdvanced() {
  const s = useSettingsStore();
  const handleReset = () => {
    s.reset();
    localStorage.removeItem('omg-settings-v1');
    localStorage.removeItem('omg-data-v1');
    localStorage.removeItem('omg-recent-files-v1');
  };
  return (
    <div>
      <SectionTitle>Advanced &amp; Developer</SectionTitle>
      <SectionDesc>IPC logging, diagnostics, and factory reset. Handle with care.</SectionDesc>
      <SettingRow label="Developer Mode" description="Enable IPC logging and DevTools access">
        <Toggle value={s.developerMode} onChange={v => s.set('developerMode', v)} />
      </SettingRow>
      <SettingRow label="IPC Log Level" description="Verbosity of the IPC bridge log">
        <SelectInput value={s.ipcLogLevel} onChange={v => s.set('ipcLogLevel', v as any)} options={[['errors','Errors only'],['warnings','Warnings'],['verbose','Verbose']]} width={140} />
      </SettingRow>
      <SettingRow label="Python Engine Timeout">
        <NumberInput value={s.pythonTimeout} onChange={v => s.set('pythonTimeout', v)} min={5} max={300} suffix="secs" />
      </SettingRow>
      <SettingRow label="Show Raw IPC" description="Display raw JSON in floating DevTools overlay">
        <Toggle value={s.showRawIpc} onChange={v => s.set('showRawIpc', v)} />
      </SettingRow>
      <div style={{ marginTop: 32, padding: '20px 24px', background: 'color-mix(in srgb, var(--bg-primary), #ef4444 5%)', border: '1px solid color-mix(in srgb, var(--border-default), #ef4444 20%)', borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Danger Zone</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>These actions are permanent and cannot be undone.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <DangerButton label="Clear Barcode Cache" icon={Trash2} onClick={() => console.log('Cache cleared')} confirm="Clear cache?" />
          <DangerButton label="Clear All Saved Data" icon={RotateCcw} onClick={() => { localStorage.clear(); window.location.reload(); }} confirm="This resets everything" />
          <DangerButton label="Factory Reset" icon={AlertTriangle} onClick={handleReset} confirm="Factory reset the app?" />
        </div>
      </div>
    </div>
  );
}



// ──────────────────────────────────────────────────────────────────────
// SECTIONS list (shared)
// ──────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'general', icon: Monitor, label: 'General' },
  { key: 'workspace', icon: Layout, label: 'Workspace' },
  { key: 'dimensions', icon: Tag, label: 'Dimensions' },
  { key: 'barcode', icon: Printer, label: 'Barcode & Print' },
  { key: 'data', icon: Database, label: 'Data Sources' },
  { key: 'performance', icon: Zap, label: 'Performance' },
  { key: 'shortcuts', icon: Keyboard, label: 'Shortcuts' },
  { key: 'updates', icon: RefreshCw, label: 'Updates' },
  { key: 'advanced', icon: Terminal, label: 'Advanced' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

function renderSection(key: SectionKey) {
  switch (key) {
    case 'general':     return <SectionGeneral />;
    case 'workspace':   return <SectionWorkspace />;
    case 'dimensions':  return <SectionDimensions />;
    case 'barcode':     return <SectionBarcode />;
    case 'data':        return <SectionDataSources />;
    case 'performance': return <SectionPerformance />;
    case 'shortcuts':   return <SectionShortcuts />;
    case 'updates':     return <SectionUpdates />;
    case 'advanced':    return <SectionAdvanced />;
  }
}

// ──────────────────────────────────────────────────────────────────────
// SettingsContent — inline light-themed component used on the home page
// ──────────────────────────────────────────────────────────────────────

export function SettingsContent({ defaultSection = 'general' }: { defaultSection?: SectionKey }) {
  const [active, setActive] = useState<SectionKey>(defaultSection);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, fontFamily: "'Poppins', sans-serif", background: 'var(--bg-primary)' }}>

      {/* Sub-nav sidebar */}
      <div style={{ width: 200, borderRight: '1px solid var(--border-subtle)', flexShrink: 0, padding: '4px 8px', overflowY: 'auto', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 8px 12px' }}>Preferences</div>
        {SECTIONS.map(({ key, icon: Icon, label }) => {
          return (
            <React.Fragment key={key}>
              <button onClick={() => setActive(key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
                background: active === key ? 'var(--bg-hover)' : 'transparent',
                transition: 'all 0.15s', marginBottom: 2,
              }}>
                <Icon size={15} strokeWidth={active === key ? 2.2 : 1.5} color={active === key ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                <span style={{ fontSize: 13, fontWeight: active === key ? 600 : 400, color: active === key ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
              </button>
            </React.Fragment>
          );
        })}
        <div style={{ padding: '12px 10px', fontSize: 10, color: 'var(--text-muted)' }}>Auto-saves on change</div>
      </div>

      {/* Section content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: 'var(--bg-primary)' }}>
        <AnimatePresence mode="wait">
          <motion.div key={active}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            {renderSection(active)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SettingsPanel — dark overlay modal used from the designer toolbar
// ──────────────────────────────────────────────────────────────────────

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<SectionKey>('general');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
      fontFamily: "'Poppins', sans-serif", background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
    }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ display: 'flex', flex: 1, maxWidth: 1100, margin: 'auto', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6)', border: '1px solid var(--border-default)' }}>

        {/* Sidebar */}
        <div style={{ width: 220, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '22px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Settings</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
              <X size={16} />
            </button>
          </div>
          <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
            {SECTIONS.map(({ key, icon: Icon, label }) => {
              return (
                <React.Fragment key={key}>
                  <button onClick={() => setActive(key)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', border: 'none',
                    borderRadius: 8, cursor: 'pointer', background: active === key ? 'var(--bg-hover)' : 'transparent',
                    transition: 'all 0.15s', marginBottom: 2,
                  }}>
                    <Icon size={16} strokeWidth={active === key ? 2.5 : 1.5} color={active === key ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                    <span style={{ fontSize: 13, fontWeight: active === key ? 600 : 400, color: active === key ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-muted)' }}>
            Settings auto-save on change
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, background: 'var(--bg-primary)', overflowY: 'auto', padding: '36px 40px' }}>
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {renderSection(active)}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
