// src/renderer/lib/units.ts — Unit conversion and display utilities

export type UnitType = 'mm' | 'cm' | 'in' | 'pt' | 'mil' | 'px';

export interface UnitDef {
  id: UnitType;
  label: string;
  short: string;
  fromMm: (mm: number) => number;
  toMm: (val: number) => number;
  decimals: number;
}

export const UNITS: Record<UnitType, UnitDef> = {
  mm:  { id: 'mm',  label: 'Millimetres (mm)',  short: 'mm',  fromMm: mm => mm,              toMm: v => v,              decimals: 1 },
  cm:  { id: 'cm',  label: 'Centimetres (cm)',  short: 'cm',  fromMm: mm => mm / 10,         toMm: v => v * 10,         decimals: 2 },
  in:  { id: 'in',  label: 'Inches (in)',        short: 'in',  fromMm: mm => mm / 25.4,       toMm: v => v * 25.4,       decimals: 3 },
  pt:  { id: 'pt',  label: 'Points (pt)',        short: 'pt',  fromMm: mm => mm * 2.83465,    toMm: v => v / 2.83465,    decimals: 1 },
  mil: { id: 'mil', label: 'Mils (1/1000 in)',   short: 'mil', fromMm: mm => mm / 0.0254,     toMm: v => v * 0.0254,     decimals: 0 },
  px:  { id: 'px',  label: 'Pixels (96dpi)',     short: 'px',  fromMm: mm => mm * (96 / 25.4), toMm: v => v / (96 / 25.4), decimals: 0 },
};

export const UNIT_OPTIONS: [string, string][] = Object.values(UNITS).map(u => [u.id, u.label]);

/** Convert mm to the display unit, rounded */
export function mmToUnit(mm: number, unit: UnitType): number {
  const u = UNITS[unit] || UNITS.mm;
  const val = u.fromMm(mm);
  const factor = Math.pow(10, u.decimals);
  return Math.round(val * factor) / factor;
}

/** Convert from display unit back to mm */
export function unitToMm(val: number, unit: UnitType): number {
  const u = UNITS[unit] || UNITS.mm;
  return u.toMm(val);
}

/** Format a mm value in the current display unit with suffix */
export function formatUnit(mm: number, unit: UnitType): string {
  const u = UNITS[unit] || UNITS.mm;
  return `${mmToUnit(mm, unit)} ${u.short}`;
}

/** Ruler-compatible unit type (the ruler only supports these three) */
export function rulerUnitFor(unit: UnitType): 'mm' | 'in' | 'px' {
  if (unit === 'in' || unit === 'mil') return 'in';
  if (unit === 'px') return 'px';
  return 'mm'; // mm, cm, pt all use mm ruler
}
