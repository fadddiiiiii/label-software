# FILE: omg/print/dispatcher.py
# Abstract Print Dispatcher — SEC 07 of Technical Specification
# ═══════════════════════════════════════════════════════════════════

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List


class AbstractPrintDispatcher(ABC):
    """Platform-agnostic interface for sending PDF data to a printer."""

    @abstractmethod
    def print_pdf(self, pdf_bytes: bytes, printer_name: str,
                  copies: int = 1, duplex: bool = False) -> bool:
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
