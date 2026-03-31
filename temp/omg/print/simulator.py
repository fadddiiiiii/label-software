# FILE: omg/print/simulator.py
# Industry-Standard Printer / Label Printer Simulator
# ═══════════════════════════════════════════════════════════════════
# A virtual printer that accepts, parses, and validates print jobs
# in all major label/printer command languages:
#   - TSPL2  (Toshiba, TSC)
#   - ZPL II (Zebra)
#   - ESC/POS (Epson, receipt/label printers)
#   - PDF    (universal raster pipeline)
#   - RAW    (passthrough bytes)
#
# Used for:
#   1. Automated testing — verify print output without physical hardware
#   2. Debugging — inspect parsed commands, field values, layout
#   3. Integration testing — plug into dispatcher as a virtual printer
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from loguru import logger


# ══════════════════════════════════════════════════════════════════
# Data Models
# ══════════════════════════════════════════════════════════════════

class CommandLanguage(str, Enum):
    TSPL = "tspl"
    ZPL = "zpl"
    ESCPOS = "escpos"
    PDF = "pdf"
    RAW = "raw"
    UNKNOWN = "unknown"


@dataclass
class ParsedCommand:
    """A single parsed printer command."""
    name: str                       # e.g. "SIZE", "TEXT", "^FO", "^FD"
    args: List[str] = field(default_factory=list)
    raw: str = ""                   # Original command string
    line_number: int = 0


@dataclass
class ParsedElement:
    """A renderable element extracted from the command stream."""
    element_type: str               # "text", "barcode", "qrcode", "rect", "line", "circle"
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    data: str = ""
    font: str = ""
    rotation: int = 0
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedLabel:
    """A fully parsed label from a print job."""
    width_mm: float = 0.0
    height_mm: float = 0.0
    gap_mm: float = 0.0
    elements: List[ParsedElement] = field(default_factory=list)
    commands: List[ParsedCommand] = field(default_factory=list)
    copies: int = 1
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PrintJob:
    """A complete simulated print job with validation results."""
    language: CommandLanguage = CommandLanguage.UNKNOWN
    labels: List[ParsedLabel] = field(default_factory=list)
    raw_bytes: bytes = b""
    raw_text: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    is_valid: bool = False
    total_labels: int = 0
    byte_count: int = 0

    @property
    def label_count(self) -> int:
        return len(self.labels)

    def get_texts(self) -> List[str]:
        """Extract all text data values from all labels."""
        texts = []
        for label in self.labels:
            for elem in label.elements:
                if elem.element_type == "text" and elem.data:
                    texts.append(elem.data)
        return texts

    def get_barcodes(self) -> List[str]:
        """Extract all barcode data values from all labels."""
        barcodes = []
        for label in self.labels:
            for elem in label.elements:
                if elem.element_type in ("barcode", "qrcode") and elem.data:
                    barcodes.append(elem.data)
        return barcodes

    def has_command(self, name: str) -> bool:
        """Check if any label contains a specific command."""
        for label in self.labels:
            for cmd in label.commands:
                if cmd.name.upper() == name.upper():
                    return True
        return False


# ══════════════════════════════════════════════════════════════════
# Language Detection
# ══════════════════════════════════════════════════════════════════

def detect_language(data: bytes) -> CommandLanguage:
    """Auto-detect the printer command language from raw bytes."""
    if not data:
        return CommandLanguage.UNKNOWN

    # PDF: starts with %PDF-
    if data[:5] == b"%PDF-":
        return CommandLanguage.PDF

    text = data.decode("utf-8", errors="replace")

    # ZPL: contains ^XA ... ^XZ
    if "^XA" in text and "^XZ" in text:
        return CommandLanguage.ZPL

    # TSPL: contains SIZE and PRINT commands
    if re.search(r"^SIZE\s", text, re.MULTILINE) and re.search(r"^PRINT\s", text, re.MULTILINE):
        return CommandLanguage.TSPL

    # ESC/POS: starts with ESC @ (initialize) or contains common ESC sequences
    if b"\x1b@" in data or b"\x1b!" in data or b"\x1d\x48" in data:
        return CommandLanguage.ESCPOS

    return CommandLanguage.RAW


# ══════════════════════════════════════════════════════════════════
# TSPL2 Parser
# ══════════════════════════════════════════════════════════════════

class TsplParser:
    """Parses TSPL2 command streams into structured PrintJob data.

    Handles the full TSPL2 command set including:
    - Configuration: SIZE, GAP, SPEED, DENSITY, DIRECTION, REFERENCE, OFFSET
    - Media: SET RIBBON/PEEL/CUTTER/TEAR
    - Drawing: TEXT, BARCODE, QRCODE, BOX, BAR, CIRCLE, BITMAP
    - Control: CLS, PRINT, CODEPAGE
    - XPML wrappers (from BarTender/NiceLabel)
    """

    # Commands that are valid in TSPL2
    VALID_COMMANDS = {
        "SIZE", "GAP", "SPEED", "DENSITY", "DIRECTION", "REFERENCE",
        "OFFSET", "SET", "CLS", "CODEPAGE", "TEXT", "BARCODE",
        "QRCODE", "BOX", "BAR", "CIRCLE", "BITMAP", "PUTBMP",
        "PRINT", "FEED", "BACKFEED", "FORMFEED", "HOME", "SELFTEST",
        "SOUND", "CUT", "ERASE", "COUNTRY", "SHIFT",
    }

    # Required commands for a valid label
    REQUIRED_SEQUENCE = ["SIZE", "CLS", "PRINT"]

    def parse(self, data: bytes) -> PrintJob:
        """Parse TSPL2 bytes into a PrintJob."""
        job = PrintJob(language=CommandLanguage.TSPL, raw_bytes=data, byte_count=len(data))

        text = data.decode("utf-8", errors="replace")
        # Strip XPML wrappers (used by BarTender/NiceLabel/TSC software)
        text = re.sub(r"<xpml>.*?</xpml>", "", text, flags=re.DOTALL)
        job.raw_text = text.strip()

        # Split into labels at each PRINT command
        # A TSPL job can contain multiple label definitions
        label_chunks = self._split_labels(text)

        for chunk in label_chunks:
            label = self._parse_label(chunk, job)
            if label:
                job.labels.append(label)

        job.total_labels = sum(l.copies for l in job.labels)
        job.is_valid = len(job.errors) == 0 and len(job.labels) > 0
        return job

    def _split_labels(self, text: str) -> List[str]:
        """Split a multi-label TSPL stream at PRINT commands."""
        chunks = []
        current = []

        for line in text.splitlines():
            line_stripped = line.strip()
            if not line_stripped:
                continue

            current.append(line_stripped)

            if line_stripped.upper().startswith("PRINT"):
                chunks.append("\n".join(current))
                current = []

        # Leftover without PRINT (incomplete job)
        if current:
            remaining = "\n".join(current)
            if remaining.strip():
                chunks.append(remaining)

        return chunks

    def _parse_label(self, chunk: str, job: PrintJob) -> Optional[ParsedLabel]:
        """Parse a single label's worth of TSPL commands."""
        label = ParsedLabel()
        seen_commands = set()

        for line_num, line in enumerate(chunk.splitlines(), 1):
            line = line.strip()
            if not line:
                continue

            cmd = self._parse_command(line, line_num)
            if cmd:
                label.commands.append(cmd)
                seen_commands.add(cmd.name.upper())
                self._apply_command(cmd, label, job)

        # Validate required sequence
        for req in self.REQUIRED_SEQUENCE:
            if req not in seen_commands:
                job.warnings.append(f"Missing recommended command: {req}")

        return label

    def _parse_command(self, line: str, line_num: int) -> Optional[ParsedCommand]:
        """Parse a single TSPL command line."""
        # Skip XPML and empty lines
        if line.startswith("<") or not line:
            return None

        # Extract command name (first word/token)
        parts = line.split(None, 1)
        cmd_name = parts[0].upper()

        # Handle "SET" as prefix
        if cmd_name == "SET" and len(parts) > 1:
            rest = parts[1]
            return ParsedCommand(name="SET", args=[rest], raw=line, line_number=line_num)

        args_str = parts[1] if len(parts) > 1 else ""
        args = self._parse_args(args_str)

        return ParsedCommand(name=cmd_name, args=args, raw=line, line_number=line_num)

    def _parse_args(self, args_str: str) -> List[str]:
        """Parse TSPL argument string, respecting quoted strings."""
        args = []
        current = ""
        in_quotes = False

        for ch in args_str:
            if ch == '"' and not in_quotes:
                in_quotes = True
            elif ch == '"' and in_quotes:
                in_quotes = False
                args.append(current)
                current = ""
            elif ch == ',' and not in_quotes:
                token = current.strip()
                if token:
                    args.append(token)
                current = ""
            else:
                current += ch

        token = current.strip()
        if token:
            args.append(token)

        return args

    def _apply_command(self, cmd: ParsedCommand, label: ParsedLabel, job: PrintJob):
        """Apply a parsed command to the label state."""
        name = cmd.name.upper()

        if name == "SIZE":
            self._parse_size(cmd.args, label, job)
        elif name == "GAP":
            self._parse_gap(cmd.args, label, job)
        elif name == "SPEED":
            if cmd.args:
                label.config["speed"] = int(cmd.args[0])
        elif name == "DENSITY":
            if cmd.args:
                density = int(cmd.args[0])
                if not (0 <= density <= 15):
                    job.warnings.append(f"DENSITY {density} outside valid range 0-15")
                label.config["density"] = density
        elif name == "DIRECTION":
            if cmd.args:
                label.config["direction"] = int(cmd.args[0])
        elif name == "REFERENCE":
            if len(cmd.args) >= 2:
                label.config["reference_x"] = int(cmd.args[0])
                label.config["reference_y"] = int(cmd.args[1])
        elif name == "OFFSET":
            label.config["offset"] = cmd.args[0] if cmd.args else "0"
        elif name == "SET":
            if cmd.args:
                setting = cmd.args[0].upper()
                label.config[f"set_{setting.lower().replace(' ', '_')}"] = True
        elif name == "CODEPAGE":
            if cmd.args:
                label.config["codepage"] = int(cmd.args[0])
        elif name == "TEXT":
            self._parse_text(cmd.args, label)
        elif name == "BARCODE":
            self._parse_barcode(cmd.args, label)
        elif name == "QRCODE":
            self._parse_qrcode(cmd.args, label)
        elif name == "BOX":
            self._parse_box(cmd.args, label)
        elif name == "BAR":
            self._parse_bar(cmd.args, label)
        elif name == "CIRCLE":
            self._parse_circle(cmd.args, label)
        elif name == "PRINT":
            self._parse_print(cmd.args, label)
        elif name == "CLS":
            pass  # Clear buffer — no state change in simulator

    def _parse_size(self, args: List[str], label: ParsedLabel, job: PrintJob):
        """Parse SIZE w mm, h mm"""
        # Combine args and extract numeric values
        full = " ".join(args)
        nums = re.findall(r"[\d.]+", full)
        if len(nums) >= 2:
            label.width_mm = float(nums[0])
            label.height_mm = float(nums[1])
        else:
            job.errors.append(f"Invalid SIZE arguments: {args}")

    def _parse_gap(self, args: List[str], label: ParsedLabel, job: PrintJob):
        """Parse GAP g mm, 0 mm"""
        full = " ".join(args)
        nums = re.findall(r"[\d.]+", full)
        if nums:
            label.gap_mm = float(nums[0])

    def _parse_text(self, args: List[str], label: ParsedLabel):
        """Parse TEXT x,y,"font",rot,x-mul,y-mul,"data" """
        if len(args) >= 7:
            label.elements.append(ParsedElement(
                element_type="text",
                x=int(args[0]),
                y=int(args[1]),
                font=args[2],
                rotation=int(args[3]),
                data=args[6] if len(args) > 6 else "",
                properties={"x_mul": int(args[4]), "y_mul": int(args[5])},
            ))

    def _parse_barcode(self, args: List[str], label: ParsedLabel):
        """Parse BARCODE x,y,"sym",height,readable,rot,narrow,wide,"data" """
        if len(args) >= 9:
            label.elements.append(ParsedElement(
                element_type="barcode",
                x=int(args[0]),
                y=int(args[1]),
                height=int(args[3]),
                rotation=int(args[5]),
                data=args[8] if len(args) > 8 else "",
                properties={
                    "symbology": args[2],
                    "readable": int(args[4]),
                    "narrow": int(args[6]),
                    "wide": int(args[7]),
                },
            ))

    def _parse_qrcode(self, args: List[str], label: ParsedLabel):
        """Parse QRCODE x,y,ecc,cellw,mode,rot,model,mask,"data" """
        if len(args) >= 9:
            label.elements.append(ParsedElement(
                element_type="qrcode",
                x=int(args[0]),
                y=int(args[1]),
                rotation=int(args[5]) if args[5].isdigit() else 0,
                data=args[8] if len(args) > 8 else "",
                properties={
                    "ecc": args[2],
                    "cell_width": int(args[3]),
                    "mode": args[4],
                    "model": args[6],
                },
            ))

    def _parse_box(self, args: List[str], label: ParsedLabel):
        """Parse BOX x1,y1,x2,y2,thickness"""
        if len(args) >= 5:
            x1, y1, x2, y2 = int(args[0]), int(args[1]), int(args[2]), int(args[3])
            label.elements.append(ParsedElement(
                element_type="rect",
                x=x1, y=y1,
                width=x2 - x1, height=y2 - y1,
                properties={"thickness": int(args[4])},
            ))

    def _parse_bar(self, args: List[str], label: ParsedLabel):
        """Parse BAR x,y,width,height"""
        if len(args) >= 4:
            label.elements.append(ParsedElement(
                element_type="line",
                x=int(args[0]), y=int(args[1]),
                width=int(args[2]), height=int(args[3]),
            ))

    def _parse_circle(self, args: List[str], label: ParsedLabel):
        """Parse CIRCLE x,y,diameter,thickness"""
        if len(args) >= 4:
            label.elements.append(ParsedElement(
                element_type="circle",
                x=int(args[0]), y=int(args[1]),
                width=int(args[2]),
                properties={"thickness": int(args[3])},
            ))

    def _parse_print(self, args: List[str], label: ParsedLabel):
        """Parse PRINT qty[,copies]"""
        if args:
            label.copies = int(args[0])
            if len(args) >= 2:
                label.config["print_copies"] = int(args[1])


# ══════════════════════════════════════════════════════════════════
# ZPL II Parser
# ══════════════════════════════════════════════════════════════════

class ZplParser:
    """Parses ZPL II command streams into structured PrintJob data.

    Handles the full ZPL II command set including:
    - Format: ^XA (start), ^XZ (end)
    - Config: ^PW (width), ^LL (length), ^CI (encoding)
    - Drawing: ^FO (origin), ^FD (data), ^A0 (font), ^GB (box),
               ^BC (Code128), ^BE (EAN13), ^BQ (QR), ^GC (circle)
    - Control: ^FS (field separator)
    """

    def parse(self, data: bytes) -> PrintJob:
        """Parse ZPL bytes into a PrintJob."""
        job = PrintJob(language=CommandLanguage.ZPL, raw_bytes=data, byte_count=len(data))

        text = data.decode("utf-8", errors="replace")
        job.raw_text = text.strip()

        # Split into labels at ^XA ... ^XZ boundaries
        label_blocks = re.findall(r"\^XA(.*?)\^XZ", text, re.DOTALL)

        if not label_blocks:
            job.errors.append("No ^XA...^XZ format block found")
            return job

        for block in label_blocks:
            label = self._parse_label(block, job)
            job.labels.append(label)

        job.total_labels = len(job.labels)
        job.is_valid = len(job.errors) == 0 and len(job.labels) > 0
        return job

    def _parse_label(self, block: str, job: PrintJob) -> ParsedLabel:
        """Parse a single ^XA...^XZ block."""
        label = ParsedLabel()

        # Split on ^ and ~ (ZPL command prefixes)
        tokens = re.split(r'(?=[\^~])', block)

        current_x = 0
        current_y = 0
        current_font_h = 20
        current_font_w = 20
        current_rot = "N"
        pending_barcode_type = None

        for token in tokens:
            token = token.strip()
            if not token:
                continue

            cmd = ParsedCommand(name=token[:3] if len(token) >= 3 else token, raw=token)
            label.commands.append(cmd)

            # ^PW — Print Width
            if token.startswith("^PW"):
                val = token[3:].strip()
                if val.isdigit():
                    label.width_mm = int(val) / 8.0  # 203 DPI = 8 dots/mm

            # ^LL — Label Length
            elif token.startswith("^LL"):
                val = token[3:].strip()
                if val.isdigit():
                    label.height_mm = int(val) / 8.0

            # ^CI — Character Encoding
            elif token.startswith("^CI"):
                label.config["encoding"] = token[3:].strip()

            # ^FO — Field Origin
            elif token.startswith("^FO"):
                coords = token[3:].split(",")
                if len(coords) >= 2:
                    current_x = int(coords[0]) if coords[0].isdigit() else 0
                    current_y = int(coords[1]) if coords[1].isdigit() else 0

            # ^A0 — Scalable Font
            elif token.startswith("^A0"):
                font_args = token[3:]
                parts = font_args.split(",")
                if parts:
                    current_rot = parts[0] if parts[0] in "NRIB" else "N"
                if len(parts) >= 3:
                    current_font_h = int(parts[1]) if parts[1].isdigit() else 20
                    current_font_w = int(parts[2]) if parts[2].isdigit() else 20

            # ^FD — Field Data
            elif token.startswith("^FD"):
                data = token[3:].rstrip("^FS").strip()

                if pending_barcode_type:
                    bc_type = pending_barcode_type
                    pending_barcode_type = None

                    # QR code data often has "QA," prefix
                    if bc_type == "qrcode" and data.startswith("QA,"):
                        data = data[3:]

                    label.elements.append(ParsedElement(
                        element_type=bc_type,
                        x=current_x, y=current_y,
                        data=data,
                    ))
                else:
                    label.elements.append(ParsedElement(
                        element_type="text",
                        x=current_x, y=current_y,
                        data=data,
                        font=f"A0{current_rot}",
                        rotation={"N": 0, "R": 90, "I": 180, "B": 270}.get(current_rot, 0),
                        properties={"font_h": current_font_h, "font_w": current_font_w},
                    ))

            # ^BC — Code 128 Barcode
            elif token.startswith("^BC"):
                pending_barcode_type = "barcode"

            # ^BE — EAN-13 Barcode
            elif token.startswith("^BE"):
                pending_barcode_type = "barcode"

            # ^BQ — QR Code
            elif token.startswith("^BQ"):
                pending_barcode_type = "qrcode"

            # ^GB — Graphic Box (rectangle/line)
            elif token.startswith("^GB"):
                parts = token[3:].rstrip("^FS").split(",")
                if len(parts) >= 3:
                    w = int(parts[0]) if parts[0].isdigit() else 0
                    h = int(parts[1]) if parts[1].isdigit() else 0
                    t = int(parts[2]) if parts[2].isdigit() else 1
                    label.elements.append(ParsedElement(
                        element_type="rect",
                        x=current_x, y=current_y,
                        width=w, height=h,
                        properties={"thickness": t},
                    ))

            # ^GC — Graphic Circle
            elif token.startswith("^GC"):
                parts = token[3:].rstrip("^FS").split(",")
                if len(parts) >= 2:
                    diameter = int(parts[0]) if parts[0].isdigit() else 0
                    label.elements.append(ParsedElement(
                        element_type="circle",
                        x=current_x, y=current_y,
                        width=diameter,
                        properties={"thickness": int(parts[1]) if parts[1].isdigit() else 1},
                    ))

        return label


# ══════════════════════════════════════════════════════════════════
# ESC/POS Parser
# ══════════════════════════════════════════════════════════════════

class EscPosParser:
    """Parses ESC/POS command streams for receipt/label printers.

    Handles common ESC/POS commands:
    - ESC @ (initialize), ESC ! (print mode)
    - GS H (barcode HRI position), GS h (barcode height)
    - GS k (print barcode), GS ( k (print 2D barcode/QR)
    - LF (line feed), ESC d (print & feed lines)
    - GS V (cut paper)
    """

    def parse(self, data: bytes) -> PrintJob:
        """Parse ESC/POS bytes into a PrintJob."""
        job = PrintJob(language=CommandLanguage.ESCPOS, raw_bytes=data, byte_count=len(data))

        label = ParsedLabel()
        label.config["type"] = "receipt"
        pos = 0
        text_buf = bytearray()

        while pos < len(data):
            byte = data[pos]

            # ESC (0x1B) commands
            if byte == 0x1B and pos + 1 < len(data):
                if text_buf:
                    label.elements.append(ParsedElement(
                        element_type="text",
                        data=text_buf.decode("utf-8", errors="replace").strip(),
                    ))
                    text_buf = bytearray()

                next_byte = data[pos + 1]
                cmd_name = f"ESC_{next_byte:02X}"
                label.commands.append(ParsedCommand(name=cmd_name, raw=f"ESC {chr(next_byte)}"))

                if next_byte == 0x40:  # ESC @ — Initialize
                    label.config["initialized"] = True
                    pos += 2
                elif next_byte == 0x21:  # ESC ! — Print mode
                    pos += 3 if pos + 2 < len(data) else len(data)
                elif next_byte == 0x64:  # ESC d — Print & feed n lines
                    pos += 3 if pos + 2 < len(data) else len(data)
                else:
                    pos += 2

            # GS (0x1D) commands
            elif byte == 0x1D and pos + 1 < len(data):
                if text_buf:
                    label.elements.append(ParsedElement(
                        element_type="text",
                        data=text_buf.decode("utf-8", errors="replace").strip(),
                    ))
                    text_buf = bytearray()

                next_byte = data[pos + 1]
                cmd_name = f"GS_{next_byte:02X}"
                label.commands.append(ParsedCommand(name=cmd_name, raw=f"GS {chr(next_byte)}"))

                if next_byte == 0x6B:  # GS k — Print barcode
                    if pos + 3 < len(data):
                        bc_type = data[pos + 2]
                        bc_len = data[pos + 3]
                        bc_data_start = pos + 4
                        bc_data_end = min(bc_data_start + bc_len, len(data))
                        bc_data = data[bc_data_start:bc_data_end].decode("ascii", errors="replace")
                        label.elements.append(ParsedElement(
                            element_type="barcode",
                            data=bc_data,
                            properties={"bc_type": bc_type},
                        ))
                        pos = bc_data_end
                    else:
                        pos += 2
                elif next_byte == 0x56:  # GS V — Cut paper
                    label.config["cut"] = True
                    pos += 3 if pos + 2 < len(data) else len(data)
                elif next_byte == 0x48:  # GS H — HRI position
                    pos += 3 if pos + 2 < len(data) else len(data)
                elif next_byte == 0x68:  # GS h — Barcode height
                    pos += 3 if pos + 2 < len(data) else len(data)
                else:
                    pos += 2

            # LF (0x0A) — New line
            elif byte == 0x0A:
                if text_buf:
                    label.elements.append(ParsedElement(
                        element_type="text",
                        data=text_buf.decode("utf-8", errors="replace").strip(),
                    ))
                    text_buf = bytearray()
                pos += 1

            # Printable ASCII
            elif 0x20 <= byte < 0x7F:
                text_buf.append(byte)
                pos += 1
            else:
                pos += 1

        # Flush remaining text
        if text_buf:
            decoded = text_buf.decode("utf-8", errors="replace").strip()
            if decoded:
                label.elements.append(ParsedElement(element_type="text", data=decoded))

        job.labels.append(label)
        job.total_labels = 1
        job.is_valid = len(label.elements) > 0
        return job


# ══════════════════════════════════════════════════════════════════
# PDF Parser (basic validation)
# ══════════════════════════════════════════════════════════════════

class PdfParser:
    """Validates PDF print data and extracts basic metadata."""

    def parse(self, data: bytes) -> PrintJob:
        """Parse PDF bytes — validates structure and extracts page count."""
        job = PrintJob(language=CommandLanguage.PDF, raw_bytes=data, byte_count=len(data))

        if not data.startswith(b"%PDF-"):
            job.errors.append("Not a valid PDF: missing %PDF- header")
            return job

        # Extract version
        header = data[:20].decode("ascii", errors="replace")
        version_match = re.match(r"%PDF-(\d+\.\d+)", header)
        if version_match:
            job.raw_text = f"PDF {version_match.group(1)}"

        # Count pages using /Type /Page pattern (approximate)
        page_count = len(re.findall(rb"/Type\s*/Page[^s]", data))
        if page_count == 0:
            page_count = 1  # At minimum

        for i in range(page_count):
            label = ParsedLabel()
            label.config["page_number"] = i + 1
            label.copies = 1
            job.labels.append(label)

        job.total_labels = page_count
        job.is_valid = True
        return job


# ══════════════════════════════════════════════════════════════════
# Virtual Printer (Simulator)
# ══════════════════════════════════════════════════════════════════

class VirtualPrinter:
    """Simulates a physical printer for testing and validation.

    Accepts print jobs in any supported language, parses them,
    validates the command stream, and stores the results for
    inspection by tests.

    Can be plugged into the dispatcher as a drop-in replacement
    for physical printers during automated testing.
    """

    def __init__(self, name: str = "Virtual Printer",
                 supported_languages: Optional[List[CommandLanguage]] = None):
        self.name = name
        self.supported_languages = supported_languages or [
            CommandLanguage.TSPL,
            CommandLanguage.ZPL,
            CommandLanguage.ESCPOS,
            CommandLanguage.PDF,
            CommandLanguage.RAW,
        ]
        self.jobs: List[PrintJob] = []
        self.total_bytes_received: int = 0

        self._parsers = {
            CommandLanguage.TSPL: TsplParser(),
            CommandLanguage.ZPL: ZplParser(),
            CommandLanguage.ESCPOS: EscPosParser(),
            CommandLanguage.PDF: PdfParser(),
        }

    def receive(self, data: bytes, language: Optional[CommandLanguage] = None) -> PrintJob:
        """Receive a print job and parse it.

        Args:
            data: Raw print data (TSPL, ZPL, ESC/POS, PDF, or arbitrary bytes)
            language: Force a specific language; auto-detect if None.

        Returns:
            Parsed PrintJob with validation results.
        """
        self.total_bytes_received += len(data)

        if language is None:
            language = detect_language(data)

        if language not in self.supported_languages:
            job = PrintJob(
                language=language,
                raw_bytes=data,
                byte_count=len(data),
                is_valid=False,
            )
            job.errors.append(
                f"Language {language.value} not supported by {self.name}. "
                f"Supported: {[l.value for l in self.supported_languages]}"
            )
            self.jobs.append(job)
            return job

        parser = self._parsers.get(language)
        if parser:
            job = parser.parse(data)
        else:
            # RAW — just store the bytes
            job = PrintJob(
                language=CommandLanguage.RAW,
                raw_bytes=data,
                byte_count=len(data),
                is_valid=True,
                total_labels=1,
            )
            job.labels.append(ParsedLabel())

        self.jobs.append(job)
        logger.debug(
            f"VirtualPrinter '{self.name}': received {language.value} job "
            f"({len(data)} bytes, {job.label_count} labels, valid={job.is_valid})"
        )
        return job

    def receive_pdf(self, pdf_bytes: bytes) -> PrintJob:
        """Convenience method for PDF jobs."""
        return self.receive(pdf_bytes, CommandLanguage.PDF)

    def receive_raw(self, raw_bytes: bytes) -> PrintJob:
        """Convenience method for RAW (ZPL/TSPL) jobs."""
        return self.receive(raw_bytes)

    @property
    def job_count(self) -> int:
        return len(self.jobs)

    @property
    def last_job(self) -> Optional[PrintJob]:
        return self.jobs[-1] if self.jobs else None

    def get_all_texts(self) -> List[str]:
        """Get all text data from all jobs."""
        texts = []
        for job in self.jobs:
            texts.extend(job.get_texts())
        return texts

    def get_all_barcodes(self) -> List[str]:
        """Get all barcode data from all jobs."""
        barcodes = []
        for job in self.jobs:
            barcodes.extend(job.get_barcodes())
        return barcodes

    def clear(self):
        """Reset the printer — clear all stored jobs."""
        self.jobs.clear()
        self.total_bytes_received = 0


# ══════════════════════════════════════════════════════════════════
# Simulated Dispatcher (for plugging into the test harness)
# ══════════════════════════════════════════════════════════════════

class SimulatedDispatcher:
    """A print dispatcher backed by VirtualPrinter instances.

    Drop-in replacement for Win32PrintDispatcher or CUPSPrintDispatcher
    in automated tests. Implements the same interface as
    AbstractPrintDispatcher.
    """

    def __init__(self):
        self.printers: Dict[str, VirtualPrinter] = {}
        self.default_printer: str = ""
        self._add_default_printers()

    def _add_default_printers(self):
        """Register a set of simulated printers covering common types."""
        self.add_printer("Zebra ZD420", [CommandLanguage.ZPL, CommandLanguage.PDF])
        self.add_printer("Zebra ZD621", [CommandLanguage.ZPL, CommandLanguage.PDF])
        self.add_printer("TOSHIBA B-FV4 (203 dpi)", [CommandLanguage.TSPL, CommandLanguage.PDF])
        self.add_printer("TSC TE200", [CommandLanguage.TSPL, CommandLanguage.PDF])
        self.add_printer("HP LaserJet Pro", [CommandLanguage.PDF])
        self.add_printer("Canon PIXMA", [CommandLanguage.PDF])
        self.add_printer("Brother QL-820NWB", [CommandLanguage.ESCPOS, CommandLanguage.PDF])
        self.add_printer("EPSON TM-T88V", [CommandLanguage.ESCPOS, CommandLanguage.PDF])
        self.add_printer("Microsoft Print to PDF", [CommandLanguage.PDF])
        self.default_printer = "HP LaserJet Pro"

    def add_printer(self, name: str,
                    languages: Optional[List[CommandLanguage]] = None) -> VirtualPrinter:
        """Register a virtual printer."""
        vp = VirtualPrinter(name=name, supported_languages=languages)
        self.printers[name] = vp
        return vp

    def get_printer(self, name: str) -> Optional[VirtualPrinter]:
        """Get a virtual printer by name."""
        return self.printers.get(name)

    # ── AbstractPrintDispatcher interface ─────────────────────────

    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False) -> bool:
        """Simulate sending a PDF to a printer."""
        vp = self.printers.get(printer_name)
        if not vp:
            raise ValueError(f"Printer '{printer_name}' not found")

        for _ in range(copies):
            job = vp.receive_pdf(pdf_bytes)
            if not job.is_valid:
                raise RuntimeError(f"Invalid PDF: {job.errors}")

        return True

    def print_raw(self, raw_bytes: bytes, printer_name: str) -> bool:
        """Simulate sending RAW bytes (ZPL/TSPL) to a printer."""
        vp = self.printers.get(printer_name)
        if not vp:
            raise ValueError(f"Printer '{printer_name}' not found")

        job = vp.receive_raw(raw_bytes)
        if not job.is_valid:
            raise RuntimeError(f"Invalid print data: {job.errors}")

        return True

    def list_printers(self) -> List[str]:
        """List all registered virtual printers."""
        return list(self.printers.keys())

    def get_default_printer(self) -> str:
        """Get the default virtual printer name."""
        return self.default_printer
