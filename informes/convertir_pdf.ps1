# Convertir HTML a PDF usando PrintTo
$htmlFile = "Informe_Constitucion_MardelPlata_2026.html"
$pdfFile = "Informe_Constitucion_MardelPlata_2026.pdf"

# Obtener la ruta absoluta
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$htmlPath = Join-Path $scriptDir $htmlFile
$pdfPath = Join-Path $scriptDir $pdfFile

Write-Host "Iniciando conversión de HTML a PDF..."
Write-Host "Archivo HTML: $htmlPath"
Write-Host "Archivo PDF: $pdfPath"

# Intentar con Microsoft Print to PDF
$printerName = "Microsoft Print to PDF"

# Verificar si la impresora existe
$printers = Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name
if ($printers -contains $printerName) {
    Write-Host "✓ Impresora encontrada: $printerName"
    
    # Crear un script de JavaScript para IEcore para imprimir
    $htmlUrl = "file:///" + ($htmlPath -replace '\\', '/')
    
    try {
        # Usar Windows API para imprimir
        $shell = New-Object -ComObject Shell.Application
        $folder = $shell.BrowseForFolder(0, "Seleccione carpeta", 0, 0)
        
        # Alternative: usar cmd para llamar a print
        Write-Host "Intentando imprimir a PDF..."
        
        # Usar el comando print con redirector a PDF
        & "$env:SystemRoot\System32\print.exe" "$htmlPath" /d:"$printerName"
        
        Write-Host "Conversión completada"
    } catch {
        Write-Host "Error durante la conversión: $_"
    }
} else {
    Write-Host "✗ Impresora 'Microsoft Print to PDF' no encontrada"
    Write-Host "Impresoras disponibles:"
    $printers | ForEach-Object { Write-Host "  - $_" }
}
