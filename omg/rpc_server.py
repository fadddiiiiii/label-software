# FILE: omg/rpc_server.py
# JSON-RPC stdio Server — Python ↔ Electron Bridge
# ═══════════════════════════════════════════════════════════════════
# Reads newline-delimited JSON-RPC requests from stdin, dispatches
# to existing Python modules, writes JSON responses to stdout.
# This is how the Electron main process communicates with the
# Python engine (barcode, batch, template, etc.).
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any, Dict, Optional

from loguru import logger

def resolve_path(relative_path: str) -> str:
    """Resolve a path relative to the app bundle or source root."""
    if hasattr(sys, '_MEIPASS'):
        # Running from PyInstaller bundle
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# ── Method Registry ──────────────────────────────────────────────────

_methods: Dict[str, callable] = {}


def register(name: str):
    """Decorator to register a JSON-RPC method."""
    def decorator(fn):
        _methods[name] = fn
        return fn
    return decorator


# ── Built-in Methods ─────────────────────────────────────────────────

@register("get_version")
def get_version(params: dict) -> str:
    return "1.0.0"


@register("render_barcode")
def render_barcode(params: dict) -> str:
    """Render barcode to SVG string (lightweight for IPC)."""
    from omg.core.barcode_engine import BarcodeRenderer

    symbology = params.get("symbology", "code128")
    data = params.get("data", "12345")
    w = params.get("width_mm", 40)
    h = params.get("height_mm", 15)

    return BarcodeRenderer.render_svg(symbology, data, w, h)


@register("render_qr")
def render_qr(params: dict) -> str:
    """Render QR code to SVG string."""
    from omg.core.barcode_engine import BarcodeRenderer

    data = params.get("data", "https://example.com")
    w = params.get("width_mm", 30)
    h = params.get("height_mm", 30)

    return BarcodeRenderer.render_svg("qrcode", data, w, h)


@register("open_data_source")
def open_data_source(params: dict) -> dict:
    """Open a CSV/Excel/JSON file and return column info + row count + preview rows."""
    from omg.data.registry import AdapterRegistry

    path = params["path"]
    # Auto-detect from extension if type not provided
    adapter = AdapterRegistry.create_from_file(path)

    columns = [{"name": c.name, "dtype": c.inferred_type} for c in adapter.get_columns()]
    
    # Get first 100 rows for preview
    rows = []
    for i, row in enumerate(adapter.iter_rows(start=0, end=100)):
        rows.append({str(k): str(v) for k, v in row.items()})

    return {
        "columns": columns,
        "row_count": adapter.row_count(),
        "rows": rows,
        "path": path,
    }


@register("preview_row")
def preview_row(params: dict) -> dict:
    """Get a single row from an open data source."""
    from omg.data.registry import AdapterRegistry

    path = params["path"]
    file_type = params.get("type", "csv")
    row_index = params.get("row_index", 0)

    adapter = AdapterRegistry.create_from_file(path)
    row = adapter.get_row(row_index)
    return {str(k): str(v) for k, v in row.items()}


@register("list_printers")
def list_printers(params: dict) -> list:
    """List available system printers."""
    try:
        from omg.platform_utils import list_available_printers
        return list_available_printers()
    except Exception:
        return ["PDF"]


@register("eval_formula")
def eval_formula(params: dict) -> str:
    """Evaluate a formula expression."""
    from omg.core.formula_engine import FormulaEngine

    engine = FormulaEngine()
    formula = params.get("formula", "")
    context = params.get("context", {})
    return engine.evaluate(formula, context)


@register("start_batch")
def start_batch(params: dict) -> dict:
    """Start a batch print job using the modular engine."""
    from omg.core.template_engine import (
        TemplateDocument, KeyboardBinding, SerialBinding, DateBinding, TimeBinding
    )
    from omg.core.field_binder import BindingResolver, FieldBinding
    from omg.data.registry import AdapterRegistry
    from omg.print.batch_engine import BatchController

    # 1. Parse template
    template_data = params.get("template")
    if not template_data:
        raise ValueError("Missing template data")
    
    doc = TemplateDocument.model_validate(template_data)
    
    # Debug logging for troubleshooting
    sys.stderr.write(f"DEBUG: start_batch elements={len(doc.elements)}\n")
    raw_elements = template_data.get("elements", []) if isinstance(template_data, dict) else []
    for i, raw_e in enumerate(raw_elements):
        sys.stderr.write(f"  DEBUG: raw element[{i}] id={raw_e.get('id')} type={raw_e.get('type')}\n")
    
    for e in doc.elements:
        sys.stderr.write(f"  DEBUG: doc element id={e.id} type={e.type} binding={e.binding is not None}\n")
    sys.stderr.flush()
    
    # 3. Setup Adapter & Resolver
    resolver = BindingResolver()
    primary_adapter = None

    if not doc.data_sources:
        from omg.data.adapter import DummyRowAdapter
        primary_adapter = DummyRowAdapter()
        resolver.attach_adapter("dummy", primary_adapter, is_primary=True)
    else:
        # Register ALL data sources defined in the template
        for i, source in enumerate(doc.data_sources):
            try:
                adapter = AdapterRegistry.create_from_file(source.path)
                is_primary = (i == 0)
                resolver.attach_adapter(source.id, adapter, is_primary=is_primary)
                if is_primary:
                    primary_adapter = adapter
                sys.stderr.write(f"DEBUG: Attached source {source.id} from {source.path}\n")
            except Exception as e:
                sys.stderr.write(f"ERROR: Failed to attach source {source.id}: {e}\n")
        sys.stderr.flush()
    
    if primary_adapter is None:
        raise ValueError("No valid data sources found for batch print")

    bindings = []
    for elem in doc.elements:
        # Check standard database binding
        if elem.binding:
            bindings.append(FieldBinding(
                field_id=elem.id,
                source_id=elem.binding.source_id,
                column_name=elem.binding.column,
                formula=elem.binding.formula
            ))
            continue
            
        # Check extended bindings from raw data (since CanvasElement model might skip them)
        # Find raw element to check for extra fields
        raw_e = next((x for x in raw_elements if x.get("id") == elem.id), {})
        
        if "serial_binding" in raw_e:
            sb = raw_e["serial_binding"]
            bindings.append(SerialBinding(
                field_id=elem.id,
                start_value=sb.get("start_value", 1),
                increment=sb.get("increment", 1),
                pad_to_length=sb.get("pad_to_length", 0),
                prefix=sb.get("prefix", ""),
                suffix=sb.get("suffix", "")
            ))
        elif "date_binding" in raw_e:
            db = raw_e["date_binding"]
            bindings.append(DateBinding(
                field_id=elem.id,
                format_str=db.get("format_str", "%Y-%m-%d")
            ))
        elif "time_binding" in raw_e:
            tb = raw_e["time_binding"]
            bindings.append(TimeBinding(
                field_id=elem.id,
                format_str=tb.get("format_str", "%H:%M:%S")
            ))
        elif "keyboard_binding" in raw_e:
            kb = raw_e["keyboard_binding"]
            bindings.append(KeyboardBinding(
                field_id=elem.id,
                prompt_label=kb.get("prompt_label", "Value"),
                default_value=kb.get("default_value", "")
            ))
    
    # 5. Run Batch
    controller = BatchController(
        template=doc,
        resolver=resolver,
        bindings=bindings,
        adapter=primary_adapter
    )
    
    # TODO: In future, report progress back via a separate channel or polling
    # For now, we run synchronously and return the final progress.
    result = controller.run(
        printer_name=params.get("printer", "PDF"),
        copies_per_label=params.get("copies_per_label", 1),
        start_row=params.get("start_row", 0),
        end_row=params.get("end_row"),
        output_path=params.get("output_path"),
        print_mode=params.get("print_mode", "pdf")
    )
    
    return {
        "status": result.status.value,
        "completed_rows": result.completed_rows,
        "total_rows": result.total_rows,
        "error_rows": result.error_rows,
        "errors": [{"rowIndex": e.row_index, "message": e.error_msg} for e in result.errors],
        "output_path": result.output_path
    }


# ── Main Loop ────────────────────────────────────────────────────────

def handle_request(request: dict) -> dict:
    """Process a single JSON-RPC request and return a response."""
    req_id = request.get("id", "unknown")
    method = request.get("method", "")
    params = request.get("params", {})

    handler = _methods.get(method)
    if handler is None:
        return {
            "id": req_id,
            "error": f"Unknown method: {method}",
        }

    try:
        result = handler(params)
        return {"id": req_id, "result": result}
    except Exception as e:
        logger.error(f"RPC error in {method}: {e}\n{traceback.format_exc()}")
        return {"id": req_id, "error": str(e)}


def main():
    """Read JSON-RPC from stdin, write responses to stdout."""
    try:
        from omg.main import configure_logging
        configure_logging()
    except Exception:
        pass
    
    logger.info("OMG RPC server starting...")

    # Redirect loguru to stderr so it doesn't interfere with JSON-RPC
    logger.remove()
    logger.add(sys.stderr, level="DEBUG")
    # Also log to a file we can read
    try:
        logger.add("/tmp/omg_rpc.log", level="DEBUG", rotation="1 day")
    except Exception:
        pass

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {"id": "unknown", "error": f"Invalid JSON: {e}"}
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            continue

        response = handle_request(request)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
