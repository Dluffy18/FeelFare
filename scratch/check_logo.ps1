Add-Type -AssemblyName System.Drawing

$filePath = Join-Path $PSScriptRoot "..\assets\city-of-mati-logo.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $filePath))
Write-Host "Width: $($img.Width), Height: $($img.Height), PixelFormat: $($img.PixelFormat)"

# Sample 4 corners
$c0 = $img.GetPixel(0, 0)
Write-Host "Top-Left (0,0): R=$($c0.R) G=$($c0.G) B=$($c0.B) A=$($c0.A)"

$midX = [int]($img.Width / 2)
$cTop = $img.GetPixel($midX, 5)
Write-Host "Top-Center ($midX, 5): R=$($cTop.R) G=$($cTop.G) B=$($cTop.B) A=$($cTop.A)"

$img.Dispose()
