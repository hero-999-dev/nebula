<#
  Build the app icon from vector geometry.

  ASCII only, on purpose: this file is run with `powershell -File`, and Windows
  PowerShell 5.1 reads a UTF-8 file without a BOM as ANSI. One em dash in a
  string literal turns the script into a parse error.

  WHY VECTOR. The first version of this script cropped and downscaled a
  1024x1024 render. electron-builder then derived the .ico from that PNG, and
  Windows draws the title bar at 16px and the taskbar at 24-32px - three
  resamplings away from the source. The result was visibly mushy next to the
  same mark drawn as SVG on the documentation site. Here the crescent and the
  sparkle are real curves, rasterised once at each size that ships, so 16px is
  as clean as 256px.

  Outputs:
    build/icon.png   1024x1024, for macOS and as electron-builder's source
    build/icon.ico   16 20 24 32 40 48 64 128 256, PNG-compressed
    build/icon-preview.png  every size side by side, to look at before shipping

  Usage:
    powershell -ExecutionPolicy Bypass -File build/make-icon.ps1
    ... -Palette violet|orchid|iris     pick a colourway
    ... -Out <dir>                      write somewhere else (for comparisons)
#>
[CmdletBinding()]
param(
  [ValidateSet('violet', 'orchid', 'iris')]
  [string]$Palette = 'violet',
  [string]$Out,
  [string]$Name = 'icon',
  [switch]$PreviewOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'build' }
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out | Out-Null }

# Tile, then the mark from its lighter end to its darker end. The mark is a
# gradient so the icon reads as colour rather than a flat silhouette at 16px.
$PALETTES = @{
  violet = @{ tile = '#17122A'; edge = '#2A2145'; from = '#C9B6FF'; to = '#7C3AED' }
  orchid = @{ tile = '#1A1030'; edge = '#31184F'; from = '#F0A6FF'; to = '#A855F7' }
  iris   = @{ tile = '#14142E'; edge = '#242551'; from = '#B3BEFF'; to = '#5B5BF0' }
}
$P = $PALETTES[$Palette]

function ColorOf([string]$hex) {
  [System.Drawing.ColorTranslator]::FromHtml($hex)
}

<#
  The mark, in a 24x24 design space - the same geometry as the sidebar and the
  documentation site, so every rendering of Nebula is the same drawing.

  The crescent is ONE closed figure: the long way round the big circle, then
  back along the cutting circle. Two overlapping circles with an even-odd fill
  do not subtract - the part of the cutter outside the base is odd too, and
  fills - which is what once made this mark render as a ring.
#>
function New-MarkPath {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath

  # big circle: centre (11,12) r 9, from +57.6deg backwards 244.8deg
  $p.AddArc(2.0, 3.0, 18.0, 18.0, -57.6, -244.8)
  # cutting circle: centre (16,12) r 7.6, forwards 177.4deg
  $p.AddArc(8.4, 4.4, 15.2, 15.2, 91.3, 177.4)
  $p.CloseFigure()

  # four-point sparkle in the crescent's mouth
  $star = @(
    [System.Drawing.PointF]::new(17.60, 7.20), [System.Drawing.PointF]::new(18.45, 8.75),
    [System.Drawing.PointF]::new(20.00, 9.60), [System.Drawing.PointF]::new(18.45, 10.45),
    [System.Drawing.PointF]::new(17.60, 12.00), [System.Drawing.PointF]::new(16.75, 10.45),
    [System.Drawing.PointF]::new(15.20, 9.60), [System.Drawing.PointF]::new(16.75, 8.75)
  )
  $p.AddPolygon($star)
  return $p
}

function New-RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Render-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # the tile, with a hairline lighter edge so it does not vanish on a dark taskbar
    $inset = [single]($size * 0.005)
    $tile = New-RoundedRect $inset $inset ([single]($size - $inset * 2)) ([single]($size - $inset * 2)) ([single]($size * 0.1875))
    $tileBrush = New-Object System.Drawing.SolidBrush((ColorOf $P.tile))
    $g.FillPath($tileBrush, $tile)
    if ($size -ge 32) {
      $pen = New-Object System.Drawing.Pen((ColorOf $P.edge), [single]([math]::Max(1.0, $size / 128.0)))
      $g.DrawPath($pen, $tile)
      $pen.Dispose()
    }
    $tileBrush.Dispose()

    # the mark, scaled from the 24-unit design space and centred
    $mark = New-MarkPath
    $scale = [single]($size / 24.0)
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Scale($scale, $scale)
    $mark.Transform($m)
    $m.Dispose()

    $b = $mark.GetBounds()
    # a little optical breathing room, and pull the whole mark to the centre
    $target = [single]($size * 0.62)
    $fit = [single]($target / [math]::Max($b.Width, $b.Height))
    $m2 = New-Object System.Drawing.Drawing2D.Matrix
    $m2.Translate([single]($size / 2), [single]($size / 2))
    $m2.Scale($fit, $fit)
    $m2.Translate([single](-($b.X + $b.Width / 2)), [single](-($b.Y + $b.Height / 2)))
    $mark.Transform($m2)
    $m2.Dispose()

    $mb = $mark.GetBounds()
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF($mb.X, $mb.Y)),
      (New-Object System.Drawing.PointF(($mb.X + $mb.Width), ($mb.Y + $mb.Height))),
      (ColorOf $P.from), (ColorOf $P.to))
    $g.FillPath($grad, $mark)
    $grad.Dispose()
    $mark.Dispose()
    $tile.Dispose()
  } finally { $g.Dispose() }
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  # The leading comma stops PowerShell unrolling the array into a stream of
  # bytes; without it the caller gets Object[], BinaryWriter.Write has no
  # matching overload, and the .ico comes out as a header with no images.
  return , [byte[]]$bytes
}

<#
  Write a multi-size .ico with PNG payloads (supported since Windows Vista, and
  what electron-builder expects). Letting electron-builder derive the .ico from
  a single PNG is exactly the downscaling this script exists to avoid.
#>
function Write-Ico([int[]]$sizes, [string]$path) {
  $images = @()
  foreach ($s in $sizes) {
    $bmp = Render-Icon $s
    $images += , @{ size = $s; bytes = (Get-PngBytes $bmp) }
    $bmp.Dispose()
  }

  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter($fs)
  try {
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($img in $images) {
      $dim = if ($img.size -ge 256) { 0 } else { $img.size }
      $bw.Write([byte]$dim); $bw.Write([byte]$dim)
      $bw.Write([byte]0); $bw.Write([byte]0)
      $bw.Write([uint16]1); $bw.Write([uint16]32)
      $bw.Write([uint32]$img.bytes.Length)
      $bw.Write([uint32]$offset)
      $offset += $img.bytes.Length
    }
    foreach ($img in $images) { $bw.Write([byte[]]$img.bytes, 0, $img.bytes.Length) }
  } finally { $bw.Dispose(); $fs.Dispose() }

  # An .ico that is only a header is the silent failure this guards against.
  $written = (Get-Item $path).Length
  $expected = 6 + 16 * $images.Count + (($images | ForEach-Object { $_.bytes.Length } | Measure-Object -Sum).Sum)
  if ($written -ne $expected) { throw "icon.ico is $written bytes, expected $expected - the images did not reach the file." }
  return $images.Count
}

# A sheet of every shipped size on both a light and a dark strip, because the
# only way to know whether 16px survived is to look at 16px.
function Write-Preview([int[]]$sizes, [string]$path) {
  $pad = 14
  # Measure-Object -Sum hands back a Double, and Bitmap(double,int) does not
  # resolve - it throws "Parameter is not valid", which reads like a bad size.
  $w = [int](($sizes | Measure-Object -Sum).Sum) + $pad * ($sizes.Count + 1)
  $h = 256 + $pad * 2 + 40
  $sheet = New-Object System.Drawing.Bitmap([int]$w, [int]($h * 2))
  $g = [System.Drawing.Graphics]::FromImage($sheet)
  try {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(246, 241, 231))), 0, 0, $w, $h)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 20, 24))), 0, $h, $w, $h)
    $font = New-Object System.Drawing.Font('Segoe UI', 9)
    $x = $pad
    foreach ($s in $sizes) {
      $bmp = Render-Icon $s
      foreach ($band in 0, 1) {
        $y = $band * $h + $pad + (256 - $s)
        $g.DrawImage($bmp, $x, $y, $s, $s)
        $ink = if ($band -eq 0) { [System.Drawing.Color]::FromArgb(90, 84, 70) } else { [System.Drawing.Color]::FromArgb(180, 172, 155) }
        $g.DrawString("$s", $font, (New-Object System.Drawing.SolidBrush($ink)), $x, ($band * $h + $pad + 262))
      }
      $bmp.Dispose()
      $x += $s + $pad
    }
    $font.Dispose()
  } finally { $g.Dispose() }
  Save-Png $sheet $path
  $sheet.Dispose()
}

$ICO_SIZES = @(16, 20, 24, 32, 40, 48, 64, 128, 256)

Write-Preview $ICO_SIZES (Join-Path $Out "$Name-preview.png")
Write-Host ("preview  {0}  palette={1}" -f (Join-Path $Out "$Name-preview.png"), $Palette)

if (-not $PreviewOnly) {
  $big = Render-Icon 1024
  Save-Png $big (Join-Path $Out "$Name.png")
  $corner = $big.GetPixel(2, 2)
  $centre = $big.GetPixel(512, 512)
  $big.Dispose()
  if ($corner.A -ne 0) { throw "Corner is not transparent (A=$($corner.A)); the rounded mask failed." }
  if ($centre.A -ne 255) { throw "Centre is not opaque (A=$($centre.A)); the tile did not draw." }
  Write-Host ("png      {0}  1024x1024  corner A=0" -f (Join-Path $Out "$Name.png"))

  $n = Write-Ico $ICO_SIZES (Join-Path $Out "$Name.ico")
  Write-Host ("ico      {0}  {1} sizes: {2}" -f (Join-Path $Out "$Name.ico"), $n, ($ICO_SIZES -join ' '))
}
