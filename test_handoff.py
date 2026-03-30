import sys
import os
from pathlib import Path
from loguru import logger

# Add project root to path
sys.path.append(os.path.abspath("."))

from omg.print.macos_dispatcher import CUPSPrintDispatcher

def test_handoff():
    logger.info("Starting Print Handoff Verification Test...")
    
    # 1. Create a dummy PDF content (minimal valid PDF header/footer)
    dummy_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF"
    
    dispatcher = CUPSPrintDispatcher()
    
    printer_name = "MOCK_PRINTER_VERIFY"
    logger.info(f"Attempting to 'print' to fake printer: {printer_name}")
    
    try:
        # This will attempt to run 'lp -d MOCK_PRINTER_VERIFY ...'
        # It will likely fail since the printer doesn't exist, but we want to see the LOG
        dispatcher.print_pdf(dummy_pdf_bytes, printer_name, copies=2)
    except Exception as e:
        logger.warning(f"OS handoff attempted but failed as expected: {e}")
        
    logger.info("Test complete. Check /tmp/omg_rpc.log for 'Executing CUPS print command' message.")

if __name__ == "__main__":
    test_handoff()
