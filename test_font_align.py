from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
fs = 9.0
style = ParagraphStyle('ExactStyle', fontName='Helvetica', fontSize=fs, leading=fs*1.2)
p = Paragraph("Test String", style)
w, h = p.wrap(100, 100)
print(f"Font size: {fs}pt, wrapped width: {w}, wrapped height: {h}")
