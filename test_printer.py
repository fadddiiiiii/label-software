"""
End-to-end test: Generate a small PDF label, rasterize it with PyMuPDF,
and print it to the Toshiba B-FV4 via GDI (same pipeline as Windows test page).
"""
import io
import struct
import ctypes
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from PIL import Image
import fitz  # pymupdf
import win32print
import win32ui
import win32con

PRINTER = "TOSHIBA B-FV4 (203 dpi)"

# Step 1: Generate a small PDF label (50mm x 30mm)
print("[1] Generating PDF label...")
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(50*mm, 30*mm))
c.setFont("Helvetica-Bold", 14)
c.drawString(5*mm, 20*mm, "GDI TEST")
c.setFont("Helvetica", 10)
c.drawString(5*mm, 12*mm, "Hello from OMG!")
c.drawString(5*mm, 5*mm, "If you see this, it works")
c.save()
pdf_bytes = buf.getvalue()
print(f"   PDF generated: {len(pdf_bytes)} bytes")

# Step 2: Rasterize with PyMuPDF
print("[2] Rasterizing PDF with PyMuPDF...")
doc = fitz.open(stream=pdf_bytes, filetype="pdf")
page = doc[0]
zoom = 203 / 72.0  # Match printer DPI
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat, alpha=False)
img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
doc.close()
print(f"   Image: {img.size[0]}x{img.size[1]} pixels")

# Step 3: Print via GDI
print(f"[3] Printing to '{PRINTER}' via GDI...")
hDC = win32ui.CreateDC()
hDC.CreatePrinterDC(PRINTER)

try:
    hDC.StartDoc("OMG GDI Test Label")
    hDC.StartPage()

    printer_w = hDC.GetDeviceCaps(win32con.HORZRES)
    printer_h = hDC.GetDeviceCaps(win32con.VERTRES)
    print(f"   Printer canvas: {printer_w}x{printer_h} pixels")

    img_w, img_h = img.size
    scale = min(printer_w / img_w, printer_h / img_h)
    dest_w = int(img_w * scale)
    dest_h = int(img_h * scale)
    x_off = (printer_w - dest_w) // 2
    y_off = (printer_h - dest_h) // 2

    # Prepare DIB data
    rgb_img = img.convert("RGB")
    row_stride = ((img_w * 3 + 3) // 4) * 4
    pixel_data = bytearray(row_stride * img_h)
    raw_data = rgb_img.tobytes()

    for y in range(img_h):
        for x in range(img_w):
            s = (y * img_w + x) * 3
            d = y * row_stride + x * 3
            pixel_data[d] = raw_data[s + 2]      # B
            pixel_data[d + 1] = raw_data[s + 1]  # G
            pixel_data[d + 2] = raw_data[s]      # R

    header = struct.pack('<IiiHHIIiiII',
        40, img_w, -img_h, 1, 24, 0, 0, 0, 0, 0, 0)

    gdi32 = ctypes.windll.gdi32
    result = gdi32.StretchDIBits(
        hDC.GetSafeHdc(),
        x_off, y_off, dest_w, dest_h,
        0, 0, img_w, img_h,
        bytes(pixel_data), header,
        0, 0x00CC0020)

    print(f"   StretchDIBits returned: {result}")
    hDC.EndPage()
    hDC.EndDoc()
    print("[4] DONE! Check printer for output.")

finally:
    hDC.DeleteDC()
