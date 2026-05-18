# FILE: omg/print/dispatcher.py
# Abstract Print Dispatcher — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List
import typing


class AbstractPrintDispatcher(ABC):
    """Platform-agnostic interface for sending PDF data to a printer."""

    @abstractmethod
    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False, label_config: typing.Any = None) -> bool:
        """Send PDF bytes to the named printer.

        Returns True on success, raises on failure.
        """
        ...

    @abstractmethod
    def list_printers(self) -> List[str]:
        """Return list of available printer names from the OS."""
        ...

    @abstractmethod
    def get_default_printer(self) -> str:
        """Return the name of the system default printer."""
        ...

    @abstractmethod
    def print_raw(self, raw_bytes: bytes, printer_name: str) -> bool:
        """Send raw bytes (e.g., ZPL, TSPL) directly to the printer spooler.
        Returns True on success, raises on failure.
        """
        ...

    def print_direct(self, template: typing.Any, row_data_list: list,
                     printer_name: str, copies: int = 1,
                     label_config: typing.Any = None) -> bool:
        """Render elements directly to the printer via native API (e.g. GDI).

        This bypasses the PDF→bitmap pipeline entirely, producing
        native font quality. Returns True on success, False if not
        supported (caller should fall back to print_pdf).
        """
        return False  # Not supported by default; subclasses override
