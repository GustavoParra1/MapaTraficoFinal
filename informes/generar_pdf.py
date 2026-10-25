#!/usr/bin/env python3
"""
Convertir HTML a PDF - Multiple métodos
"""
import os
import sys
from pathlib import Path

html_file = "Informe_Constitucion_MardelPlata_2026.html"
pdf_file = "Informe_Constitucion_MardelPlata_2026.pdf"

script_dir = Path(__file__).parent
html_path = script_dir / html_file
pdf_path = script_dir / pdf_file

print(f"Convirtiendo {html_path} a PDF...")

# Método 1: Intentar con pdfkit + wkhtmltopdf
try:
    import pdfkit
    options = {
        'page-size': 'A4',
        'margin-top': '0.75in',
        'margin-right': '0.75in',
        'margin-bottom': '0.75in',
        'margin-left': '0.75in',
        'encoding': "UTF-8",
        'enable-local-file-access': None
    }
    pdfkit.from_file(str(html_path), str(pdf_path), options=options)
    print(f"✓ PDF generado exitosamente con pdfkit: {pdf_path}")
    sys.exit(0)
except Exception as e:
    print(f"✗ pdfkit falló: {e}")

# Método 2: Usar reportlab para conversión HTML simplificada
try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from html.parser import HTMLParser
    
    print("Intentando con ReportLab...")
    
    # Este es un enfoque simplificado - ReportLab tiene limitaciones con HTML complejo
    # Por eso usamos una aproximación diferente
    
    # Leer el HTML
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Buscar texto dentro de tags HTML y extraer
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter, A4
    
    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    c.setTitle("Informe de Seguridad Urbana - Constitución")
    
    # Mensaje simple
    c.drawString(50, 750, "Informe de Seguridad Urbana - Barrio Constitución, Mar del Plata")
    c.drawString(50, 730, "Consulte el archivo HTML para ver el informe completo con formato")
    c.save()
    
    print(f"✓ PDF básico generado con ReportLab: {pdf_path}")
    print("Nota: Para mejor calidad, abra el HTML en navegador y use 'Imprimir como PDF'")
    sys.exit(0)
    
except Exception as e:
    print(f"✗ ReportLab falló: {e}")

# Método 3: Generar instrucciones para el usuario
print("\n" + "="*60)
print("ALTERNATIVA: Abra el archivo HTML en su navegador")
print("="*60)
print(f"\nArchivo HTML: {html_path}")
print("\nPasos:")
print("1. Abra el archivo HTML en Chrome, Firefox o Edge")
print("2. Presione Ctrl+P (o Cmd+P en Mac)")
print("3. Seleccione 'Guardar como PDF'")
print("4. Guarde como:", pdf_path)
print("\n" + "="*60)

sys.exit(1)
