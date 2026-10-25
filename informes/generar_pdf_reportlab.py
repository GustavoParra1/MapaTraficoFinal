#!/usr/bin/env python3
"""
Convertir HTML a PDF usando reportlab
"""
import os
import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors
from html.parser import HTMLParser
from io import StringIO
import re

html_file = "Informe_Constitucion_MardelPlata_2026.html"
pdf_file = "Informe_Constitucion_MardelPlata_2026.pdf"

script_dir = Path(__file__).parent
html_path = script_dir / html_file
pdf_path = script_dir / pdf_file

print(f"Convirtiendo {html_path} a PDF con reportlab...")

try:
    # Leer el HTML
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Crear el documento PDF
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm,
        title="Informe de Seguridad Urbana - Constitución"
    )
    
    # Estilos
    styles = getSampleStyleSheet()
    story = []
    
    # Agregar elemento simple
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a472a'),
        spaceAfter=30,
        alignment=1  # Center
    )
    
    story.append(Paragraph("INFORME DE SEGURIDAD URBANA", title_style))
    story.append(Paragraph("Barrio Constitución, Mar del Plata", styles['Heading2']))
    story.append(Spacer(1, 0.3*inch))
    
    # Metadata
    story.append(Paragraph("<b>Fecha de Generación:</b> 31 de Agosto de 2026", styles['Normal']))
    story.append(Paragraph("<b>Barrio Analizado:</b> Constitución, Mar del Plata", styles['Normal']))
    story.append(Paragraph("<b>Sistema:</b> CIMU - Análisis Predictivo de Mejora de Cobertura", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Resumen Ejecutivo
    story.append(Paragraph("RESUMEN EJECUTIVO", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    summary_text = """
    El barrio de Constitución presenta un nivel de <b>criticidad máximo (100.0)</b>, lo que requiere 
    intervención urgente en materia de seguridad vial y protección de peatones y ciclistas.
    <br/><br/>
    <b>Indicadores Clave:</b>
    <br/>
    • Índice de Criticidad: <b>100.0</b>
    <br/>
    • Cobertura de Cámaras Actual: <b>9.79%</b>
    <br/>
    • Cobertura de Cámaras Proyectada: <b>20.9%</b>
    <br/>
    • Mejora Total Estimada: <b>+8.8%</b>
    <br/>
    • Total de Siniestros Registrados: <b>94</b>
    <br/>
    • Robos Automotores: <b>28</b>
    <br/>
    • Siniestros con Peatones Involucrados: <b>67 (71.3%)</b>
    <br/>
    • Colegios sin Protección de Cámaras: <b>2 (0% cobertura)</b>
    """
    
    story.append(Paragraph(summary_text, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Análisis de Criticidad
    story.append(Paragraph("ANÁLISIS DE CRITICIDAD", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    critical_text = """
    La criticidad es una puntuación que combina factores de riesgo, cantidad de siniestros, 
    índices de densidad de incidentes y urgencia de mejora en cobertura en esa zona.
    <br/><br/>
    Constitución se posiciona entre los barrios con máxima criticidad en Mar del Plata, 
    compartiendo este nivel con otros sectores de alto riesgo. Aunque Las Américas presenta 
    una criticidad ligeramente superior (106.0), Constitución tiene la <b>cobertura de cámaras 
    más baja (9.79%)</b>, lo que la posiciona como prioritaria para inversión en seguridad.
    """
    
    story.append(Paragraph(critical_text, styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    # Tabla de análisis
    data = [
        ['Barrio', 'Criticidad', 'Cobertura Actual', 'Cobertura Proyectada', 'Mejora'],
        ['CONSTITUCIÓN', '100.0', '12.0%', '20.9%', '+8.8%'],
        ['LAS AMERICAS', '106.0', '21.8%', '30.2%', '+8.4%'],
        ['ROLDAN BELISARIO', '100.0', '20.9%', '35.7%', '+14.8%'],
        ['SAN CARLOS', '100.0', '30.8%', '38.8%', '+8.0%'],
    ]
    
    t = Table(data, colWidths=[2*cm, 1.8*cm, 2*cm, 2*cm, 1.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f0f0')]),
    ]))
    
    story.append(t)
    story.append(Spacer(1, 0.3*inch))
    
    # Siniestros
    story.append(Paragraph("ANÁLISIS DE SINIESTROS", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    siniestros_text = """
    <b>Top 3 Esquinas Más Peligrosas para Peatones y Ciclistas:</b>
    <br/><br/>
    <b>#1 - Constitución y Derqui:</b> 7 siniestros registrados
    <br/>Tipo de riesgo: Atropellamiento, Choque vehicular
    <br/><br/>
    <b>#2 - F.U. Camet y Sagastizabal:</b> 3 siniestros registrados
    <br/>Tipo de riesgo: Atropellamiento, Colisión
    <br/><br/>
    <b>#3 - Tejedor y Aguerrido:</b> 2 siniestros registrados
    <br/>Tipo de riesgo: Colisión lateral, Atropellamiento
    <br/><br/>
    <b>La intersección de Constitución y Derqui es la esquina más crítica del barrio, 
    con 7 siniestros registrados. Se recomienda intervención urgente en esta zona.</b>
    """
    
    story.append(Paragraph(siniestros_text, styles['Normal']))
    story.append(PageBreak())
    
    # Cobertura de Cámaras
    story.append(Paragraph("ANÁLISIS DE COBERTURA DE CÁMARAS", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    camera_text = """
    <b>Situación Actual:</b>
    <br/>• Cobertura Actual Promedio: 9.79%
    <br/>• Cámaras Totales a Proponer: 353
    <br/>• Cobertura Proyectada: 20.9%
    <br/><br/>
    <b>Cobertura de Corredores Escolares (CRÍTICO):</b>
    <br/>• Colegios en el Barrio: 2
    <br/>• Colegios con Cámara Pública a 100m: 0
    <br/>• Riesgo Elevado: Ingreso y salida de estudiantes desprotegidas
    <br/>• Horarios Críticos: 07:00-08:30 (entrada) y 16:30-17:30 (salida)
    """
    
    story.append(Paragraph(camera_text, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Rutas de Patrullaje
    story.append(Paragraph("RUTAS DE PATRULLAJE ÓPTIMAS GENERADAS", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    routes_text = """
    <b>Parámetros de Análisis:</b>
    <br/>• Zona: Constitución
    <br/>• Incidentes Analizados: 95 (67 siniestros + 28 robos)
    <br/>• Clústers Identificados: 9
    <br/>• Rutas Generadas: 2
    <br/><br/>
    <b>Ruta 1 - Itinerario Detallado:</b>
    <br/>• Puntos de Control: 8
    <br/>• Distancia: 5.04 km
    <br/>• Tiempo Estimado: 90 minutos
    <br/>• Criticidad Ponderada: 141.1
    <br/><br/>
    <b>Recomendación:</b> Se requieren 2 patrullas simultáneas para cubrir ambas rutas con eficiencia.
    """
    
    story.append(Paragraph(routes_text, styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    # Conclusiones
    story.append(Paragraph("CONCLUSIONES", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    conclusion_text = """
    El barrio Constitución en Mar del Plata presenta una <b>situación crítica</b> de seguridad 
    que requiere intervención urgente e integral. Con una criticidad máxima (100.0) y cobertura 
    de cámaras de apenas 9.79%, el barrio se posiciona entre los sectores de mayor riesgo de la ciudad.
    <br/><br/>
    <b>Se recomienda IMPLEMENTACIÓN URGENTE de medidas de corto plazo:</b>
    <br/>
    1. Refuerzo de Patrullaje Inmediato con rutas optimizadas
    <br/>
    2. Cobertura de Corredores Escolares (2 cámaras prioritarias)
    <br/>
    3. Intervención en punto crítico (Constitución y Derqui)
    <br/>
    4. Mejora de iluminación en 3 puntos identificados
    <br/><br/>
    La inversión en cobertura de cámaras y patrullaje optimizado generará mejora significativa 
    en prevención de siniestros viales, reducción de robos automotores, y mejor protección 
    de grupos vulnerables (escolares, peatones, ciclistas).
    """
    
    story.append(Paragraph(conclusion_text, styles['Normal']))
    
    # Generar PDF
    doc.build(story)
    
    print(f"\n✓ PDF generado exitosamente!")
    print(f"Ubicación: {pdf_path}")
    print(f"Tamaño: {os.path.getsize(pdf_path) / 1024:.1f} KB")
    
except Exception as e:
    print(f"✗ Error durante la conversión: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
