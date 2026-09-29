Add-Type -AssemblyName System.Drawing

$path = Join-Path $PSScriptRoot "..\assets\city-of-mati-logo-transparent.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $path))
Write-Host "Corner (0,0) Alpha:" $img.GetPixel(0,0).A
Write-Host "Center (407,407) Alpha:" $img.GetPixel(407,407).A
Write-Host "Width:" $img.Width "Height:" $img.Height
$img.Dispose()
