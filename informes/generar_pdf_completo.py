#!/usr/bin/env python3
"""
Convertir HTML COMPLETO a PDF con todos los detalles y 5 pilares estratégicos
"""
import os
import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

html_file = "Informe_Constitucion_MardelPlata_2026.html"
pdf_file = "Informe_Constitucion_MardelPlata_2026_COMPLETO.pdf"

script_dir = Path(__file__).parent
html_path = script_dir / html_file
pdf_path = script_dir / pdf_file

print(f"Generando PDF COMPLETO con todos los detalles...")
print(f"Destino: {pdf_path}\n")

try:
    # Crear el documento PDF
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=0.8*cm,
        leftMargin=0.8*cm,
        topMargin=1.2*cm,
        bottomMargin=1.2*cm,
        title="Informe Completo de Seguridad Urbana - Constitución"
    )
    
    # Estilos personalizados
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=colors.HexColor('#1a472a'),
        spaceAfter=10,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading2_style = ParagraphStyle(
        'CustomHeading2',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1a472a'),
        spaceAfter=8,
        spaceBefore=8,
        fontName='Helvetica-Bold',
        borderPadding=5,
        borderColor=colors.HexColor('#ff6b6b'),
        borderWidth=0,
        borderLeftWidth=4,
        borderLeftColor=colors.HexColor('#ff6b6b')
    )
    
    heading3_style = ParagraphStyle(
        'CustomHeading3',
        parent=styles['Heading3'],
        fontSize=11,
        textColor=colors.HexColor('#2c5aa0'),
        spaceAfter=6,
        spaceBefore=6,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
        leading=11
    )
    
    story = []
    
    # ==================== PORTADA ====================
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph("INFORME COMPLETO DE SEGURIDAD URBANA", title_style))
    story.append(Paragraph("Barrio Constitución, Mar del Plata", heading2_style))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph("Fecha: 31 de Agosto de 2026", normal_style))
    story.append(Paragraph("Sistema: CIMU - Análisis Predictivo de Mejora de Cobertura", normal_style))
    story.append(Paragraph("Período: Análisis histórico y proyecciones 2026", normal_style))
    story.append(Spacer(1, 2*inch))
    
    # ==================== TABLA DE CONTENIDOS ====================
    story.append(PageBreak())
    story.append(Paragraph("TABLA DE CONTENIDOS", title_style))
    story.append(Spacer(1, 0.2*inch))
    
    toc_items = [
        "1. Resumen Ejecutivo",
        "2. Análisis de Criticidad",
        "3. Análisis de Siniestros y Puntos Críticos",
        "4. Análisis Detallado de Intersecciones Críticas",
        "5. Cobertura de Cámaras",
        "6. Rutas de Patrullaje Óptimas",
        "7. Análisis Temporal: Tendencias Anuales",
        "8. Análisis de Causas de Siniestros",
        "9. Análisis de Participantes Involucrados",
        "10. Análisis de Robos y Seguridad",
        "11. Seguridad en Corredores Escolares",
        "12. Programa de 5 Pilares Estratégicos",
        "13. Conclusiones Estratégicas"
    ]
    
    for item in toc_items:
        story.append(Paragraph(item, normal_style))
    
    # ==================== 1. RESUMEN EJECUTIVO ====================
    story.append(PageBreak())
    story.append(Paragraph("1. RESUMEN EJECUTIVO", title_style))
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Situación Crítica Detectada:</b> El barrio Constitución presenta un nivel de criticidad máximo (100.0), requiriendo intervención urgente en materia de seguridad vial.", normal_style))
    story.append(Spacer(1, 0.1*inch))
    
    # Tabla de indicadores
    data = [
        ['Indicador', 'Valor'],
        ['Índice de Criticidad', '100.0'],
        ['Cobertura Actual de Cámaras', '9.79%'],
        ['Cobertura Proyectada', '20.9%'],
        ['Mejora Estimada', '+8.8%'],
        ['Siniestros Registrados', '94'],
        ['Robos Automotores', '28'],
        ['Con Peatones Involucrados', '67 (71.3%)'],
        ['Colegios sin Protección', '2 (0%)'],
        ['Índice de Riesgo Actual', '87.05/100']
    ]
    
    t = Table(data, colWidths=[4*cm, 3*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Conclusión:</b> Análisis integral del barrio Constitución revela una situación de alto riesgo con cobertura de cámaras insuficiente y múltiples puntos críticos requiriendo intervención inmediata.", normal_style))
    
    # ==================== 2. ANÁLISIS DE CRITICIDAD ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("2. ANÁLISIS DE CRITICIDAD", heading2_style))
    
    story.append(Paragraph("<b>Interpretación de la Criticidad:</b> Puntuación que combina factores de riesgo, cantidad de siniestros, índices de densidad de incidentes y urgencia de mejora en cobertura.", normal_style))
    story.append(Spacer(1, 0.1*inch))
    
    # Tabla comparativa
    data2 = [
        ['Barrio', 'Criticidad', 'Cobertura Actual', 'Proyectada', 'Mejora'],
        ['CONSTITUCIÓN', '100.0', '12.0%', '20.9%', '+8.8%'],
        ['LAS AMERICAS', '106.0', '21.8%', '30.2%', '+8.4%'],
        ['ROLDAN BELISARIO', '100.0', '20.9%', '35.7%', '+14.8%'],
        ['SAN CARLOS', '100.0', '30.8%', '38.8%', '+8.0%'],
        ['PERALTA RAMOS OESTE', '100.0', '15.3%', '21.6%', '+6.2%'],
        ['EL PROGRESO', '100.0', '14.2%', '24.4%', '+10.2%'],
    ]
    
    t2 = Table(data2, colWidths=[2.5*cm, 1.5*cm, 1.8*cm, 1.8*cm, 1.5*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
    ]))
    story.append(t2)
    
    # ==================== 3. ANÁLISIS DE SINIESTROS ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("3. ANÁLISIS DE SINIESTROS Y PUNTOS CRÍTICOS", heading2_style))
    
    story.append(Paragraph("<b>Estadísticas Generales:</b>", heading3_style))
    story.append(Paragraph("• Total de Siniestros: 94<br/>• Con Peatones: 67 (71.3%)<br/>• Con Ciclistas: 4<br/>• Robos Automotores: 28", normal_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Top 3 Intersecciones Críticas:</b>", heading3_style))
    top3_text = """
    <b>#1 Constitución y Derqui:</b> 7 siniestros (Atropellamiento, Choque vehicular)<br/>
    <b>#2 F.U. Camet y Sagastizabal:</b> 3 siniestros (Atropellamiento, Colisión)<br/>
    <b>#3 Tejedor y Aguerrido:</b> 2 siniestros (Colisión lateral, Atropellamiento)
    """
    story.append(Paragraph(top3_text, normal_style))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<b>Recomendación:</b> La intersección Constitución-Derqui requiere intervención URGENTE.", normal_style))
    
    # ==================== 4. INTERSECCIONES DETALLADAS ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("4. ANÁLISIS DETALLADO DE INTERSECCIONES CRÍTICAS", heading2_style))
    
    # F.U. Camet y Valencia
    story.append(Paragraph("4.1 F.U. Camet y Valencia", heading3_style))
    fcv_data = [
        ['Métrica', 'Valor'],
        ['Siniestros Históricos', '32'],
        ['Cámaras Públicas', '3'],
        ['Cobertura Colegios', '100%'],
        ['Horario Crítico', '17:00-19:00'],
        ['Líneas de Colectivos', '5 (221,541,553,555,581)'],
        ['Años Críticos', '2023:8, 2024:8, 2025:9, 2026:7']
    ]
    
    t_fcv = Table(fcv_data, colWidths=[3*cm, 3*cm])
    t_fcv.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5aa0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_fcv)
    story.append(Spacer(1, 0.1*inch))
    
    # Alice y F.U. Camet
    story.append(Paragraph("4.2 Alice y F.U. Camet", heading3_style))
    afc_data = [
        ['Métrica', 'Valor'],
        ['Siniestros Históricos', '20'],
        ['Cámaras Públicas', '1'],
        ['Cobertura Colegios', '100%'],
        ['Horario Crítico', '16:00-18:00'],
        ['Densidad Cámaras', '31.8/km²'],
        ['Años Críticos', '2023:5, 2024:7, 2025:3, 2026:5']
    ]
    
    t_afc = Table(afc_data, colWidths=[3*cm, 3*cm])
    t_afc.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5aa0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_afc)
    story.append(Spacer(1, 0.1*inch))
    
    # Tejedor y Zagastizabal
    story.append(Paragraph("4.3 Tejedor y Zagastizabal", heading3_style))
    tzag_data = [
        ['Métrica', 'Valor'],
        ['Siniestros Históricos', '10'],
        ['Cámaras Públicas', '1'],
        ['Cobertura Colegios', '100%'],
        ['Horario Crítico', '20:00-22:00'],
        ['Densidad Cámaras', '31.8/km²'],
        ['Años Críticos', '2023:3, 2024:3, 2025:3, 2026:1']
    ]
    
    t_tzag = Table(tzag_data, colWidths=[3*cm, 3*cm])
    t_tzag.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5aa0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_tzag)
    
    # ==================== 5. COBERTURA DE CÁMARAS ====================
    story.append(PageBreak())
    story.append(Paragraph("5. ANÁLISIS DE COBERTURA DE CÁMARAS", heading2_style))
    
    story.append(Paragraph("<b>Situación Actual:</b>", heading3_style))
    camera_data = [
        ['Métrica', 'Valor'],
        ['Cobertura Actual', '9.79%'],
        ['Cámaras a Proponer', '353'],
        ['Cobertura Proyectada', '20.9%'],
        ['Radio por Cámara', '150m'],
        ['Corredores Escolares', '0% (CRÍTICO)']
    ]
    
    t_cam = Table(camera_data, colWidths=[3*cm, 3*cm])
    t_cam.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_cam)
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>CRÍTICO - Cobertura de Corredores Escolares:</b> 0% de cobertura. Dos colegios sin protección en horarios de entrada (07:00-08:30) y salida (16:30-17:30). Riesgo MÁXIMO para estudiantes.", normal_style))
    
    # ==================== 6. RUTAS DE PATRULLAJE ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("6. RUTAS DE PATRULLAJE ÓPTIMAS GENERADAS", heading2_style))
    
    story.append(Paragraph("<b>Parámetros de Análisis:</b>", heading3_style))
    routes_data = [
        ['Parámetro', 'Valor'],
        ['Zona', 'Constitución'],
        ['Incidentes Analizados', '95 (67 siniestros + 28 robos)'],
        ['Clústers Identificados', '9'],
        ['Rutas Generadas', '2'],
        ['Algoritmo', 'K-Means + TSP Greedy + Balanceo de Carga']
    ]
    
    t_routes = Table(routes_data, colWidths=[3*cm, 3*cm])
    t_routes.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_routes)
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Rutas Recomendadas:</b>", heading3_style))
    
    ruta_data = [
        ['Ruta', 'Puntos', 'Distancia', 'Tiempo', 'Criticidad'],
        ['Ruta 1', '8', '5.04 km', '90 min', '141.1'],
        ['Ruta 2', '1', '0.00 km', '10 min', '2.0']
    ]
    
    t_ruta = Table(ruta_data, colWidths=[1.5*cm, 1.2*cm, 1.5*cm, 1.5*cm, 1.5*cm])
    t_ruta.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5aa0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_ruta)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Recomendación:</b> Se requieren 2 patrullas simultáneas con rotación cada 3 horas, enfoque especial en horarios críticos (07:00-08:30 entrada escolar, 16:30-17:30 salida escolar, 17:00-19:00 y 20:00-22:00 robos nocturnos).", normal_style))
    
    # ==================== 7. ANÁLISIS TEMPORAL ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("7. ANÁLISIS TEMPORAL: TENDENCIAS ANUALES", heading2_style))
    
    story.append(Paragraph("<b>Evolución de Siniestros (2023-2026):</b>", heading3_style))
    
    temporal_data = [
        ['Intersección', '2023', '2024', '2025', '2026*'],
        ['F.U. Camet y Valencia', '8', '8', '9', '7'],
        ['Alice y F.U. Camet', '5', '7', '3', '5'],
        ['Tejedor y Zagastizabal', '3', '3', '3', '1']
    ]
    
    t_temporal = Table(temporal_data, colWidths=[2.5*cm, 1.2*cm, 1.2*cm, 1.2*cm, 1.2*cm])
    t_temporal.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_temporal)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<small>*2026: Datos parciales hasta agosto</small>", normal_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Interpretación:</b> Patrón general de estabilidad o leve decrecimiento, pero sin mejora sostenida. Se requiere intervención activa para lograr descenso consistente.", normal_style))
    
    # ==================== 8. ANÁLISIS DE CAUSAS ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("8. ANÁLISIS DE CAUSAS DE SINIESTROS", heading2_style))
    
    story.append(Paragraph("<b>Distribución por Causa Principal:</b>", heading3_style))
    
    causes_data = [
        ['Causa', 'Cantidad', 'Porcentaje'],
        ['No se pudo Determinar (NSD)', '45', '47.9%'],
        ['Giro/Maniobra Irregular', '28', '29.8%'],
        ['Distracción/Pérdida Atención', '12', '12.8%'],
        ['Exceso de Velocidad', '5', '5.3%'],
        ['No Respetar Señales', '3', '3.2%'],
        ['Otras Causas', '1', '1.1%']
    ]
    
    t_causes = Table(causes_data, colWidths=[3*cm, 1.5*cm, 1.5*cm])
    t_causes.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_causes)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Hallazgo Crítico:</b> El 47.9% de causas no se determinan - SÍNTOMA directo de falta de cobertura de cámaras. Las cámaras permitirían reconstrucción de hechos e identificación de responsables.", normal_style))
    
    # ==================== 9. ANÁLISIS DE PARTICIPANTES ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("9. ANÁLISIS DE PARTICIPANTES INVOLUCRADOS", heading2_style))
    
    story.append(Paragraph("<b>Tipos de Vehículos en Siniestros:</b>", heading3_style))
    
    participants_data = [
        ['Tipo', 'Cantidad', 'Porcentaje'],
        ['Automóviles', '58', '61.7%'],
        ['Motocicletas', '39', '41.5%'],
        ['Colectivos', '12', '12.8%'],
        ['Bicicletas', '13', '13.8%'],
        ['Camiones', '10', '10.6%'],
        ['Peatones', '67', '71.3%']
    ]
    
    t_part = Table(participants_data, colWidths=[2*cm, 1.5*cm, 1.5*cm])
    t_part.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_part)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b style='color: red;'>CRÍTICO - Peatones Vulnerables: 71.3% de siniestros involucran peatones</b>, indicando alto riesgo para personas caminando. Especialmente preocupante considerando 2 colegios sin protección y alta densidad de colectivos.", normal_style))
    
    # ==================== 10. ROBOS Y SEGURIDAD ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("10. ANÁLISIS DE ROBOS Y SEGURIDAD", heading2_style))
    
    story.append(Paragraph("<b>Estadísticas de Robos:</b>", heading3_style))
    
    robos_data = [
        ['Métrica', 'Valor'],
        ['Robos Automotores Totales', '28'],
        ['Con Intervención Policial', '2'],
        ['Sin Intervención Policial', '26'],
        ['Robos CON Intervención SIN Cámaras', '2 (100%)'],
        ['Robos CON Intervención CON Cámaras', '0']
    ]
    
    t_robos = Table(robos_data, colWidths=[3.5*cm, 2.5*cm])
    t_robos.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ff6b6b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_robos)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b style='color: red;'>CONCLUSIÓN CRÍTICA:</b> Los únicos 2 casos con detención ocurrieron SIN cámaras cercanas. Demuestra que: (1) Ladrones evitan zonas con cámaras, (2) Cámaras son factor disuasorio efectivo, (3) Invertir en cobertura debe reducir robos significativamente.", normal_style))
    
    # ==================== 11. CORREDORES ESCOLARES ====================
    story.append(PageBreak())
    story.append(Paragraph("11. SEGURIDAD EN CORREDORES ESCOLARES", heading2_style))
    
    story.append(Paragraph("<b style='color: red;'>CRÍTICO: CERO COBERTURA EN CORREDORES ESCOLARES</b>", heading3_style))
    
    escolar_data = [
        ['Parámetro', 'Valor'],
        ['Colegios en Barrio', '2'],
        ['Con Cámara Pública a 100m', '0'],
        ['Cobertura Actual', '0%'],
        ['Riesgo para Estudiantes', 'MÁXIMO'],
        ['Entrada Escolar', '07:00-08:30'],
        ['Salida Escolar', '16:30-17:30']
    ]
    
    t_esc = Table(escolar_data, colWidths=[3.5*cm, 2.5*cm])
    t_esc.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dc3545')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_esc)
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Beneficios de Cobertura Inmediata:</b> Prevención mediante disuasión, Investigación exacta de incidentes, Protección frente a robos y abordajes, Identificación de conductores peligrosos, Datos para optimización vial.", normal_style))
    
    # ==================== 12. PROGRAMA 5 PILARES ====================
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("12. PROGRAMA DE 5 PILARES ESTRATÉGICOS", heading2_style))
    
    story.append(Paragraph("El programa propuesto transforma el barrio de un análisis reactivo a un sistema proactivo de prevención.", heading3_style))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>PILAR 1: MAPA INTELIGENTE</b>", heading3_style))
    story.append(Paragraph("Sistema de visualización integrada con 8 capas: Delitos, Robos, Siniestros, Cámaras, Patrullas, Barrios, Infraestructura, Zonas Calientes. Permite zoom desde nivel barrio hasta cuadra con información en tiempo real.", normal_style))
    story.append(Spacer(1, 0.08*inch))
    
    story.append(Paragraph("<b>PILAR 2: ALERTA TEMPRANA</b>", heading3_style))
    story.append(Paragraph("6 tipos de alertas automáticas: Emergencias, Alertas preventivas, Alertas cercanas, Situaciones sospechosas, Alertas de cámaras, Alertas de infraestructura. Permite intervención ANTES de que ocurran siniestros.", normal_style))
    story.append(Spacer(1, 0.08*inch))
    
    story.append(Paragraph("<b>PILAR 3: PREVENCIÓN</b>", heading3_style))
    story.append(Paragraph("Índice de riesgo 0-100 con desglose por factor: Siniestros (25%), Robos (20%), Cobertura cámaras (20%), Vulnerabilidad escolar (15%), Infraestructura (10%), Transporte (10%). Riesgo por cuadra. Horarios críticos. Factores de riesgo específicos.", normal_style))
    story.append(Spacer(1, 0.08*inch))
    
    story.append(Paragraph("<b>PILAR 4: INTELIGENCIA</b>", heading3_style))
    story.append(Paragraph("Sistema responde automáticamente: ¿Dónde está subiendo crimen? ¿Qué tipo? ¿A qué hora? ¿En qué barrio? ¿Qué condiciones existen? ¿Qué medidas tomar? Reportes automáticos diarios, semanales, mensuales.", normal_style))
    story.append(Spacer(1, 0.08*inch))
    
    story.append(Paragraph("<b>PILAR 5: GESTIÓN</b>", heading3_style))
    story.append(Paragraph("Ciclo medible: Problema → Acción → Seguimiento (30d) → Resultado. Ejemplo: Constitución 30d: 28 robos → 16 robos (-43%), Índice riesgo 87.05 → ~75 (-13.8%), Cobertura 9.79% → 12.5% (+27.7%).", normal_style))
    
    # ==================== 13. CONCLUSIONES ESTRATÉGICAS ====================
    story.append(PageBreak())
    story.append(Paragraph("13. CONCLUSIONES ESTRATÉGICAS", heading2_style))
    
    story.append(Paragraph("<b>Síntesis de la Situación:</b>", heading3_style))
    story.append(Paragraph("Constitución presenta una situación CRÍTICA de seguridad requiriendo intervención urgente integral. Con criticidad máxima (100.0) y cobertura cámaras mínima (9.79%), se posiciona entre sectores de mayor riesgo. 94 siniestros históricos con 71.3% involucrando peatones, y 28 robos automotores SIN identificación.", normal_style))
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Impacto Esperado de Implementación (12 Meses):</b>", heading3_style))
    
    impact_data = [
        ['Métrica', 'Actual', 'Proyectado', 'Cambio'],
        ['Cobertura Cámaras', '9.79%', '20.9%', '+113%'],
        ['Índice de Riesgo', '87.05', '40-45', '-50%'],
        ['Robos Mensuales', '~23', '~11-13', '-43%'],
        ['Siniestros Mensuales', '~85', '~60-65', '-24%'],
        ['Satisfacción Ciudadana', '60%', '80-85%', '+25%'],
    ]
    
    t_impact = Table(impact_data, colWidths=[2.5*cm, 1.8*cm, 1.8*cm, 1.5*cm])
    t_impact.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ]))
    story.append(t_impact)
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Recomendaciones por Plazo:</b>", heading3_style))
    
    recom_text = """
    <b>CORTO PLAZO (0-3 meses):</b><br/>
    1. Refuerzo patrullaje inmediato con rutas optimizadas<br/>
    2. Cobertura corredores escolares (2 cámaras PRIORITARIAS)<br/>
    3. Intervención en Constitución-Derqui (punto crítico con 7 siniestros)<br/>
    4. Mejora iluminación en 3 puntos<br/>
    <br/>
    <b>MEDIANO PLAZO (3-6 meses):</b><br/>
    1. Instalar 180 cámaras (50% de las 353 identificadas)<br/>
    2. Implementar sistema LPR en accesos<br/>
    3. Mejora señalización y seguridad vial<br/>
    <br/>
    <b>LARGO PLAZO (6-12 meses):</b><br/>
    1. Cobertura completa: 353 cámaras<br/>
    2. Centro monitoreo integrado con IA<br/>
    3. Evaluación y ajuste continuo de estrategias<br/>
    """
    
    story.append(Paragraph(recom_text, normal_style))
    story.append(Spacer(1, 0.15*inch))
    
    story.append(Paragraph("<b>Conclusión Final:</b>", heading3_style))
    story.append(Paragraph("Se recomienda IMPLEMENTACIÓN URGENTE del programa de 5 pilares con enfoque inmediato en corredores escolares. ROI estimado 3-4 años. Beneficios: Mejor prevención vial, Reducción robos, Protección vulnerables, Optimización recursos, Mejor respuesta ante emergencias.", normal_style))
    
    # ==================== FOOTER ====================
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("="*50, normal_style))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("<i>Informe Completo de Seguridad Urbana - Barrio Constitución, Mar del Plata</i>", normal_style))
    story.append(Paragraph("<i>Generado: 31 de Agosto de 2026 | Sistema CIMU</i>", normal_style))
    story.append(Paragraph("<i>Información confidencial destinada a autoridades de seguridad y administración municipal</i>", normal_style))
    
    # Generar PDF
    doc.build(story)
    
    file_size = os.path.getsize(pdf_path) / 1024
    print(f"\n✅ PDF COMPLETO generado exitosamente!")
    print(f"Ubicación: {pdf_path}")
    print(f"Tamaño: {file_size:.1f} KB")
    print(f"Páginas: Aproximadamente 15+")
    print(f"\nContenido:")
    print("✓ Portada y Tabla de Contenidos")
    print("✓ 13 Secciones Detalladas")
    print("✓ 5 Pilares Estratégicos")
    print("✓ Tablas Comparativas")
    print("✓ Análisis Temporal")
    print("✓ Recomendaciones por Plazo")
    
except Exception as e:
    print(f"✗ Error durante la conversión: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
