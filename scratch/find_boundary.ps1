Add-Type -AssemblyName System.Drawing

$filePath = Join-Path $PSScriptRoot "..\assets\city-of-mati-logo.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $filePath))

$cx = 512
$cy = 512

# Scan from top (512, 0) downwards to find first non-white pixel
$topY = 0
for ($y = 0; $y -lt 512; $y++) {
    $p = $img.GetPixel($cx, $y)
    if ($p.R -lt 250 -or $p.G -lt 250 -or $p.B -lt 250) {
        $topY = $y
        Write-Host "First non-white pixel from top at y=$($y) R=$($p.R) G=$($p.G) B=$($p.B)"
        break
    }
}

# Scan from bottom (512, 1023) upwards
$botY = 1023
for ($y = 1023; $y -gt 512; $y--) {
    $p = $img.GetPixel($cx, $y)
    if ($p.R -lt 250 -or $p.G -lt 250 -or $p.B -lt 250) {
        $botY = $y
        Write-Host "First non-white pixel from bottom at y=$($y) R=$($p.R) G=$($p.G) B=$($p.B)"
        break
    }
}

# Scan from left (0, 512) rightwards
$leftX = 0
for ($x = 0; $x -lt 512; $x++) {
    $p = $img.GetPixel($x, $cy)
    if ($p.R -lt 250 -or $p.G -lt 250 -or $p.B -lt 250) {
        $leftX = $x
        Write-Host "First non-white pixel from left at x=$($x) R=$($p.R) G=$($p.G) B=$($p.B)"
        break
    }
}

# Scan from right (1023, 512) leftwards
$rightX = 1023
for ($x = 1023; $x -gt 512; $x--) {
    $p = $img.GetPixel($x, $cy)
    if ($p.R -lt 250 -or $p.G -lt 250 -or $p.B -lt 250) {
        $rightX = $x
        Write-Host "First non-white pixel from right at x=$($x) R=$($p.R) G=$($p.G) B=$($p.B)"
        break
    }
}

$img.Dispose()
Write-Host "Seal Bounds: left=$leftX, right=$rightX, top=$topY, bottom=$botY"
Write-Host "Diameter X: $($rightX - $leftX), Diameter Y: $($botY - $topY)"
