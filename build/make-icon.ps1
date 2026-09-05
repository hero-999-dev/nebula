<#
  Build build/icon.png from the chosen source mark.

  ASCII only, on purpose: this file is run with `powershell -File`, and Windows
  PowerShell 5.1 reads a UTF-8 file without a BOM as ANSI. A single em dash in a
  string literal is enough to turn the script into a parse error.

  The source (icons-uygun/crescent-purple-star.png) is a 1024x1024 render with a
  pure-black frame around a dark rounded tile. Two things have to happen:

    1. crop the black frame away, so the tile fills the canvas
    2. cut the rounded corners out as REAL transparency

  Step 2 is not cosmetic. electron-builder derives the .ico and .icns from this
  PNG, and an opaque black corner shows up as four black triangles behind the
  rounded icon on a light taskbar or Dock.

  Measured from the source (do not guess these again):
    tile bounding box  (112,112)-(911,911)   -> 800 x 800
    corner radius      ~150px at 800px       -> 18.75% of the edge
    frame  #000000     tile #1A1B28          mark #A280E5

  Usage:  powershell -ExecutionPolicy Bypass -File build/make-icon.ps1
          add -Source <path> to point at a different mark.
#>
[CmdletBinding()]
param(
  [string]$Source,
  [string]$Out,
  [int]$Size = 1024
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'build\icon.png' }
if (-not $Source) {
  # The mark is vendored into the repo so a fresh clone can rebuild the icon;
  # the original lives in the workspace's icons-uygun/ folder.
  $vendored = Join-Path $root 'build\source-mark.png'
  $original = Join-Path (Split-Path -Parent $root) 'icons-uygun\crescent-purple-star.png'
  $Source = if (Test-Path $vendored) { $vendored } else { $original }
}

if (-not (Test-Path $Source)) { throw "Source mark not found: $Source" }

# --- 1. find the tile, by measurement rather than by the numbers in the header ---
# The frame is pure black; anything brighter is tile. Scanning the centre row and
# centre column finds the tile even if the source is re-rendered at another size.
$src = New-Object System.Drawing.Bitmap($Source)
try {
  $w = $src.Width; $h = $src.Height
  $midY = [int]($h / 2); $midX = [int]($w / 2)
  $isInk = { param($c) ($c.R + $c.G + $c.B) -gt 30 }

  $left = 0;        while ($left   -lt $w -and -not (& $isInk $src.GetPixel($left,  $midY)))  { $left++ }
  $right = $w - 1;  while ($right  -ge 0  -and -not (& $isInk $src.GetPixel($right, $midY)))  { $right-- }
  $top = 0;         while ($top    -lt $h -and -not (& $isInk $src.GetPixel($midX,  $top)))   { $top++ }
  $bottom = $h - 1; while ($bottom -ge 0  -and -not (& $isInk $src.GetPixel($midX,  $bottom))) { $bottom-- }

  if ($right -le $left -or $bottom -le $top) { throw "Could not find a tile in $Source (is it all black?)" }

  $tileW = $right - $left + 1
  $tileH = $bottom - $top + 1
  Write-Host ("tile: ({0},{1}) {2}x{3}" -f $left, $top, $tileW, $tileH)

  $crop = New-Object System.Drawing.Rectangle($left, $top, $tileW, $tileH)

  # --- 2. scale the tile to the target size ---
  $scaled = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($scaled)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)), $crop, [System.Drawing.GraphicsUnit]::Pixel)
  } finally { $g.Dispose() }

  # --- 3. mask to a rounded square, anti-aliased, everything outside transparent ---
  # FillPath with a TextureBrush anti-aliases the edge; SetClip would not.
  $radius = [int]([math]::Round($Size * 0.1875))
  $d = $radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
  $path.CloseFigure()

  $dest = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($dest)
  $brush = New-Object System.Drawing.TextureBrush($scaled)
  try {
    $g2.Clear([System.Drawing.Color]::Transparent)
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g2.FillPath($brush, $path)
  } finally { $brush.Dispose(); $g2.Dispose(); $path.Dispose() }

  $outDir = Split-Path -Parent $Out
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $dest.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

  # Prove the corners really are transparent. A silent failure here ships black
  # triangles to every user, and nobody notices until the icon is on a taskbar.
  $corner = $dest.GetPixel(2, 2)
  $centre = $dest.GetPixel([int]($Size / 2), [int]($Size / 2))
  if ($corner.A -ne 0)   { throw "Corner is not transparent (A=$($corner.A)); mask failed." }
  if ($centre.A -ne 255) { throw "Centre is not opaque (A=$($centre.A)); mask is inverted." }

  Write-Host ("wrote {0}  {1}x{1}  radius={2}  corner A={3}  centre=#{4:X2}{5:X2}{6:X2}" -f `
    $Out, $Size, $radius, $corner.A, $centre.R, $centre.G, $centre.B)

  $scaled.Dispose(); $dest.Dispose()
} finally {
  $src.Dispose()
}
