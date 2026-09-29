Add-Type -AssemblyName System.Drawing

$filePath = Join-Path $PSScriptRoot "..\assets\city-of-mati-logo.png"
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $filePath))

$cx = 508.5
$cy = 514.0
$radius = 406.0
$outSize = 814

$dest = New-Object System.Drawing.Bitmap $outSize, $outSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Lock bits or scan and set
$minX = [int]($cx - $radius)
$minY = [int]($cy - $radius)

for ($dy = 0; $dy -lt $outSize; $dy++) {
    $sy = $minY + $dy
    if ($sy -lt 0 -or $sy -ge $src.Height) { continue }
    
    for ($dx = 0; $dx -lt $outSize; $dx++) {
        $sx = $minX + $dx
        if ($sx -lt 0 -or $sx -ge $src.Width) { continue }
        
        $dist = [Math]::Sqrt([Math]::Pow($sx - $cx, 2) + [Math]::Pow($sy - $cy, 2))
        
        if ($dist -gt $radius + 1.0) {
            # Completely outside circle: transparent
            $dest.SetPixel($dx, $dy, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($dist -gt $radius - 1.0) {
            # Smooth antialiasing edge
            $alphaFactor = ($radius + 1.0 - $dist) / 2.0
            $p = $src.GetPixel($sx, $sy)
            $a = [int]($p.A * $alphaFactor)
            $dest.SetPixel($dx, $dy, [System.Drawing.Color]::FromArgb($a, $p.R, $p.G, $p.B))
        } else {
            # Inside circle: copy pixel
            $p = $src.GetPixel($sx, $sy)
            $dest.SetPixel($dx, $dy, $p)
        }
    }
}

$testOut = Join-Path $PSScriptRoot "..\assets\city-of-mati-logo-transparent.png"
$dest.Save($testOut, [System.Drawing.Imaging.ImageFormat]::Png)

$src.Dispose()
$dest.Dispose()

Write-Host "Successfully generated transparent logo: $testOut"
