// src/renderer/lib/restoreBindings.ts — Restore bindings from saved document elements
// ═══════════════════════════════════════════════════════════════════
// When a .lft file is loaded, the element objects contain binding info
// (binding, serial_binding, date_binding, time_binding, keyboard_binding)
// but the DataStore.bindings array is NOT populated from them.
// This utility extracts those bindings back into DataStore-compatible
// FieldBinding objects so that toDocument() can re-attach them at print time.
// ═══════════════════════════════════════════════════════════════════

import type { FieldBinding } from '../store/data';
import type { SerialNumberConfig } from '../types/template';

/**
 * Given raw element objects from a loaded .lft document,
 * extract FieldBinding entries for the data store.
 */
export function extractBindingsFromElements(
  elements: any[]
): { bindings: FieldBinding[]; serialConfigs: Record<string, SerialNumberConfig> } {
  const bindings: FieldBinding[] = [];
  const serialConfigs: Record<string, SerialNumberConfig> = {};

  for (const elem of elements) {
    const id = elem.id;
    if (!id) continue;

    // 1. Standard database binding
    if (elem.binding && elem.binding.column) {
      bindings.push({
        fieldId: id,
        type: 'database',
        sourceId: elem.binding.source_id || '',
        column: elem.binding.column || '',
        formula: elem.binding.formula || undefined,
      });
      continue;
    }

    // 2. Serial binding
    if (elem.serial_binding) {
      const sb = elem.serial_binding;
      const increment = Math.abs(sb.increment || 1);
      const stepType = (sb.increment || 1) < 0 ? 'decrease' : 'increase';
      const serialId = id;

      bindings.push({
        fieldId: id,
        type: 'serial',
        serialId: serialId,
      });

      // Also reconstruct a SerialNumberConfig for the serial configs store
      serialConfigs[serialId] = {
        id: serialId,
        name: elem.name || 'Serial',
        start: sb.start_value ?? 1,
        increment: increment,
        step_type: stepType as 'increase' | 'decrease',
        digits: sb.pad_to_length || 5,
        pad_left: (sb.pad_to_length || 0) > 0,
        prefix: sb.prefix || '',
        suffix: sb.suffix || '',
        type: 'decimal',
        reset_on: 'never',
        current_value: sb.start_value ?? 1,
      };
      continue;
    }

    // 3. Date binding
    if (elem.date_binding) {
      const db = elem.date_binding;
      // Convert Python strftime format back to JS format for display
      // (the store keeps JS-style format strings)
      const pyFmt = db.format_str || '%Y-%m-%d';
      const jsFmt = pythonFormatToJs(pyFmt);
      bindings.push({
        fieldId: id,
        type: 'date',
        formatStr: jsFmt,
      });
      continue;
    }

    // 4. Time binding
    if (elem.time_binding) {
      const tb = elem.time_binding;
      const pyFmt = tb.format_str || '%H:%M:%S';
      const jsFmt = pythonFormatToJs(pyFmt);
      bindings.push({
        fieldId: id,
        type: 'time',
        formatStr: jsFmt,
      });
      continue;
    }

    // 5. Keyboard binding
    if (elem.keyboard_binding) {
      const kb = elem.keyboard_binding;
      bindings.push({
        fieldId: id,
        type: 'keyboard',
        promptLabel: kb.prompt_label || 'Enter value',
        defaultValue: kb.default_value || '',
      });
      continue;
    }
  }

  return { bindings, serialConfigs };
}

/**
 * Convert Python strftime format tokens back to JS date format tokens.
 * This is the reverse of jsDateFormatToPython() in canvas.ts.
 */
function pythonFormatToJs(fmt: string): string {
  // If it doesn't contain %, assume it's already a JS format string
  if (!fmt.includes('%')) return fmt;

  let s = fmt;
  // Replace longest tokens first to avoid collisions
  s = s.replace(/%Y/g, 'YYYY');
  s = s.replace(/%y/g, 'YY');
  s = s.replace(/%B/g, 'MMMM');
  s = s.replace(/%b/g, 'MMM');
  s = s.replace(/%m/g, 'MM');
  s = s.replace(/%-m/g, 'M');
  s = s.replace(/%A/g, 'dddd');
  s = s.replace(/%d/g, 'DD');
  s = s.replace(/%-d/g, 'D');
  s = s.replace(/%H/g, 'HH');
  s = s.replace(/%I/g, 'hh');
  s = s.replace(/%-I/g, 'h');
  s = s.replace(/%M/g, 'mm');
  s = s.replace(/%S/g, 'ss');
  s = s.replace(/%p/g, 'A');
  return s;
}
