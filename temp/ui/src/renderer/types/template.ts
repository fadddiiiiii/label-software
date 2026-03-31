// src/renderer/types/template.ts — Label Template Types
// ═══════════════════════════════════════════════════════════════════
// These mirror the Python Pydantic models from template_engine.py.
// Extended with all fields from the OMG Comprehensive Feature Plan.
// ═══════════════════════════════════════════════════════════════════

export type ElementType = 'text' | 'barcode' | 'qrcode' | 'image' | 'rect' | 'circle' | 'line';
export type Alignment = 'left' | 'center' | 'right';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';
export type LabelShape = 'rect' | 'round_rect' | 'ellipse';
export type OverflowMode = 'shrink' | 'wrap' | 'strict' | 'expand';
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type LineCap = 'square' | 'round' | 'flat';
export type ArrowHead = 'none' | 'start' | 'end' | 'both';
export type ImageFitMode = 'stretch' | 'fit' | 'tile';
export type BindingSourceType = 'database' | 'keyboard' | 'serial' | 'date' | 'time' | 'fixed' | 'programming';
export type LabelStartCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type LabelDirection = 'horizontal' | 'vertical';

export interface LabelConfig {
  width_mm: number;
  height_mm: number;
  dpi: number;
  background_color: string;
  shape: LabelShape;
  corner_radius_mm: number;
  show_border: boolean;
  // Margins
  margin_left_mm: number;
  margin_right_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
  // Shape-specific
  hole_diameter_mm: number;
  // Printing order
  start_corner: LabelStartCorner;
  primary_direction: LabelDirection;
  print_angle: number; // 0, 90, 180, 270
  // Relocation (offset)
  relocation_left_mm: number;
  relocation_top_mm: number;
}

export interface SheetLayout {
  cols: number;
  rows: number;
  h_gap_mm: number;
  v_gap_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  page_width_mm: number;
  page_height_mm: number;
}

export interface BindingItem {
  type: 'fixed' | 'column' | 'serial' | 'datetime' | 'keyboard' | 'programming';
  value: string;
}

export interface BindingConfig {
  source_id: string;
  column: string;
  formula?: string;
  composite?: BindingItem[];
  serialId?: string;
  serialConfig?: SerialNumberConfig;
}

export interface LabelElement {
  id: string;
  type: ElementType;
  name: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation: number;
  z_index: number;
  locked: boolean;
  hidden?: boolean;
  do_not_print: boolean;
  opacity: number;

  // Text properties
  font_name: string;
  font_size: number;
  font_weight?: string | number;
  font_italic: boolean;
  align: Alignment;
  vertical_align: VerticalAlignment;
  color: string;
  value: string;
  // Text overflow
  overflow_mode: OverflowMode;
  min_font_size_mm: number;
  max_font_size_mm: number;
  line_spacing_mm: number;
  char_spacing_mm: number;
  justify: boolean;
  inverse: boolean;
  mirror: boolean;
  underline: boolean;
  strikeout: boolean;
  rtl: boolean;
  background_color: string;
  border_enabled: boolean;

  // Barcode properties
  symbology?: string;
  show_text: boolean;
  text_on_top: boolean;
  auto_font_scale: boolean;
  text_font_size_mm: number;
  text_font_name: string;
  text_font_bold: boolean;
  text_font_italic: boolean;
  text_anchor: Alignment;
  barcode_char_space: number;
  text_format: string;
  text_offset_x: number;
  text_offset_y: number;
  lock_bar_size: boolean;
  user_input: boolean;
  barcode_rotation: number;
  x_dimension_mil: number;
  barcode_color: string;
  barcode_order: number;
  barcode_text_margin_mm: number;
  special_settings: Record<string, any>;

  // Image properties
  image_path?: string;
  image_b64?: string;
  maintain_aspect_ratio: boolean;
  image_fit_mode: ImageFitMode;
  monochrome: boolean;

  // Shape / Line properties
  border_color: string;
  fill_color: string;
  filled: boolean;
  border_width: number;
  line_style: LineStyle;
  line_cap: LineCap;
  arrow_head: ArrowHead;
  corner_radius_mm: number;

  // Binding
  binding?: BindingConfig;
}

export interface DataSourceRef {
  id: string;
  type: 'csv' | 'excel' | 'sql';
  path?: string;
  connection_str?: string;
  query?: string;
  sheet?: string;
  join_key?: string;
}

export interface SerialNumberConfig {
  id: string;
  name: string;
  start: number;
  increment: number; // This is the step value
  step_type: 'increase' | 'decrease';
  digits: number;   // This is the Length
  pad_left: boolean;
  prefix: string;
  suffix: string;
  type: 'decimal' | 'hex' | 'alpha' | 'custom';
  custom_sequence?: string; // e.g. '0123456789'
  reset_on: 'never' | 'job' | 'label';
  current_value: number;
}

export interface DateTimeFormat {
  id: string;
  label: string;
  format: string;
  example: string;
}

export const DATE_TIME_FORMATS: DateTimeFormat[] = [
  { id: 'DT-01', label: 'ISO Full', format: 'YYYY-MM-DD HH:mm:ss', example: '2026-03-22 19:12:57' },
  { id: 'DT-02', label: 'ISO No Seconds', format: 'YYYY-MM-DD HH:mm', example: '2026-03-22 19:12' },
  { id: 'DT-03', label: 'ISO Date', format: 'YYYY-MM-DD', example: '2026-03-22' },
  { id: 'DT-04', label: 'US Date', format: 'M/DD/YYYY', example: '3/22/2026' },
  { id: 'DT-05', label: 'Full Day Name', format: 'dddd, MMMM D, YYYY', example: 'Sunday, March 22, 2026' },
  { id: 'DT-06', label: '12h Time', format: 'h:mm A', example: '7:12 PM' },
  { id: 'DT-07', label: '12h Time + Sec', format: 'h:mm:ss A', example: '7:12:57 PM' },
  { id: 'DT-08', label: 'US + 12h', format: 'M/D/YYYY h:mm A', example: '3/22/2026 7:12 PM' },
  { id: 'DT-09', label: 'US + 12h + Sec', format: 'M/D/YYYY h:mm:ss A', example: '3/22/2026 7:12:57 PM' },
  { id: 'DT-10', label: 'ISO 8601 Z', format: 'YYYY-MM-DDTHH:mm:ssZ', example: '2026-03-22 19:12:57Z' },
  { id: 'DT-11', label: 'Compact Date', format: 'YYYYMMDD', example: '20260322' },
  { id: 'DT-12', label: '2-Digit Year', format: 'YYMMDD', example: '260322' },
];

export interface PrintSettings {
  printer: string;
  copies: number;
  print_count: number;
  use_datasource_count: boolean;
  all_rows: boolean;
  custom_rows: string;
  each_label_print_count: boolean;
  each_label_count_column: string;
  position_left_mm: number;
  position_top_mm: number;
  show_progress: boolean;
  update_serial: boolean;
  save_print_log: boolean;
}

export interface TemplateDocument {
  schema_version: string;
  label: LabelConfig;
  sheet_layout: SheetLayout;
  elements: LabelElement[];
  data_sources: DataSourceRef[];
  active_source_id?: string;
  current_row_index?: number;
  serial_configs?: Record<string, SerialNumberConfig>;
  print_settings?: PrintSettings;
}

/**
 * Default values for new templates.
 */
export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  width_mm: 100,
  height_mm: 70,
  dpi: 300,
  background_color: '#FFFFFF',
  shape: 'rect',
  corner_radius_mm: 3,
  show_border: true,
  margin_left_mm: 0,
  margin_right_mm: 0,
  margin_top_mm: 0,
  margin_bottom_mm: 0,
  hole_diameter_mm: 0,
  start_corner: 'top-left',
  primary_direction: 'horizontal',
  print_angle: 0,
  relocation_left_mm: 0,
  relocation_top_mm: 0,
};

export const DEFAULT_SHEET_LAYOUT: SheetLayout = {
  cols: 1,
  rows: 1,
  h_gap_mm: 3,
  v_gap_mm: 3,
  margin_top_mm: 5,
  margin_bottom_mm: 5,
  margin_left_mm: 5,
  margin_right_mm: 5,
  page_width_mm: 210,
  page_height_mm: 297,
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printer: '',
  copies: 1,
  print_count: 1,
  use_datasource_count: false,
  all_rows: true,
  custom_rows: '',
  each_label_print_count: false,
  each_label_count_column: '',
  position_left_mm: 0,
  position_top_mm: 0,
  show_progress: true,
  update_serial: true,
  save_print_log: false,
};

let _elementCounter = 0;
function nextElementName(type: ElementType): string {
  _elementCounter++;
  const prefix = type === 'text' ? 'T' : type === 'barcode' ? 'B' : type === 'qrcode' ? 'QR'
    : type === 'image' ? 'IMG' : type === 'rect' ? 'R' : type === 'circle' ? 'C' : 'L';
  return `${prefix}${_elementCounter}`;
}

export function createBlankElement(type: ElementType, id?: string): LabelElement {
  return {
    id: id || `field_${Date.now().toString(36)}`,
    type,
    name: nextElementName(type),
    x_mm: 10,
    y_mm: 10,
    width_mm: type === 'line' ? 40 : type === 'qrcode' ? 30 : 30,
    height_mm: type === 'line' ? 1 : type === 'qrcode' ? 30 : 15,
    rotation: 0,
    z_index: 0,
    locked: false,
    do_not_print: false,
    opacity: 100,
    font_name: 'Helvetica',
    font_size: 12,
    font_italic: false,
    align: 'left',
    vertical_align: 'middle',
    color: '#000000',
    value: type === 'text' ? 'New Text' : '',
    // Text overflow
    overflow_mode: 'shrink',
    min_font_size_mm: 1.0,
    max_font_size_mm: 99,
    line_spacing_mm: 0,
    char_spacing_mm: 0,
    justify: false,
    inverse: false,
    mirror: false,
    underline: false,
    strikeout: false,
    rtl: false,
    background_color: 'transparent',
    border_enabled: false,
    // Barcode
    symbology: type === 'barcode' ? 'code128' : type === 'qrcode' ? 'qrcode' : undefined,
    show_text: true,
    text_on_top: false,
    auto_font_scale: true,
    text_font_size_mm: 2.5,
    text_font_name: 'Helvetica',
    text_font_bold: false,
    text_font_italic: false,
    text_anchor: 'center',
    barcode_char_space: 0,
    text_format: '',
    text_offset_x: 0,
    text_offset_y: 0,
    lock_bar_size: false,
    user_input: false,
    barcode_rotation: 0,
    x_dimension_mil: 13.33,
    barcode_color: '#000000',
    barcode_order: 0,
    barcode_text_margin_mm: 1.0,
    special_settings: {},
    // Image
    maintain_aspect_ratio: true,
    image_fit_mode: 'fit',
    monochrome: false,
    // Shape
    border_color: '#000000',
    fill_color: '#FFFFFF',
    filled: false,
    border_width: 1,
    line_style: 'solid',
    line_cap: 'square',
    arrow_head: 'none',
    corner_radius_mm: 0,
  };
}
