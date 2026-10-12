<#
  Build the icon a document wears when Nebula is the program that opens it
  (0.9.4, "Open with Nebula").

  The owner: "a file in violet tones - make the logo that is shaped like the
  auto order page button violet, fitting the emblem, with the Nebula logo at
  the bottom right." So: the sheet of that button (a page with its top right
  corner cut, lines of writing on it) in the app's violets, and the app's own
  mark on its dark tile at the bottom right.

  ASCII only, on purpose (see make-icon.ps1): Windows PowerShell 5.1 reads a
  UTF-8 file without a BOM as ANSI.

  Vector, like the app icon: every size is drawn, none is scaled down.

  Outputs:
    build/doc.ico          16 20 24 32 40 48 64 128 256, PNG-compressed (Windows)
    build/doc.icns         16 32 64 128 256 512 1024 (macOS)
    build/doc.png          1024x1024
    build/doc-preview.png  every size side by side, on light and on dark

  Usage:
    powershell -ExecutionPolicy Bypass -File build/make-doc-icon.ps1
#>
[CmdletBinding()]
param(
  [string]$Out,
  [string]$Name = 'doc',
  [switch]$PreviewOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'build' }
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out | Out-Null }

# The sheet from its lighter corner to its darker one, its edge, its fold, its
# lines; then the app's tile and mark (the violet palette of make-icon.ps1).
$C = @{
  sheetFrom = '#E4DAFF'; sheetTo = '#9B7BF2'; edge = '#6D3FD6'; fold = '#7C4DEB'; foldLight = '#C9B6FF'
  line = '#FBF9FF'; tile = '#17122A'; tileEdge = '#3A2D63'; markFrom = '#C9B6FF'; markTo = '#7C3AED'
}

function ColorOf([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# The mark, exactly as make-icon.ps1 draws it (24-unit design space).
function New-MarkPath {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc(2.0, 3.0, 18.0, 18.0, -57.6, -244.8)
  $p.AddArc(8.4, 4.4, 15.2, 15.2, 91.3, 177.4)
  $p.CloseFigure()
  $star = @(
    [System.Drawing.PointF]::new(17.60, 7.20), [System.Drawing.PointF]::new(18.45, 8.75),
    [System.Drawing.PointF]::new(20.00, 9.60), [System.Drawing.PointF]::new(18.45, 10.45),
    [System.Drawing.PointF]::new(17.60, 12.00), [System.Drawing.PointF]::new(16.75, 10.45),
    [System.Drawing.PointF]::new(15.20, 9.60), [System.Drawing.PointF]::new(16.75, 8.75)
  )
  $p.AddPolygon($star)
  return $p
}

# The sheet: a page whose top right corner is cut, the other three rounded.
function New-SheetPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$cut, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddLine([single]($x + $r), $y, [single]($x + $w - $cut), $y)
  $p.AddLine([single]($x + $w - $cut), $y, [single]($x + $w), [single]($y + $cut))
  $p.AddArc([single]($x + $w - $d), [single]($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, [single]($y + $h - $d), $d, $d, 90, 90)
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
    $s = [single]$size

    # the sheet
    $sx = [single]($s * 0.15); $sy = [single]($s * 0.05); $sw = [single]($s * 0.66); $sh = [single]($s * 0.88)
    $cut = [single]($s * 0.22); $rad = [single]($s * 0.045)
    $sheet = New-SheetPath $sx $sy $sw $sh $cut $rad
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF($sx, $sy)),
      (New-Object System.Drawing.PointF(($sx + $sw), ($sy + $sh))),
      (ColorOf $C.sheetFrom), (ColorOf $C.sheetTo))
    $g.FillPath($grad, $sheet)
    $grad.Dispose()
    $pen = New-Object System.Drawing.Pen((ColorOf $C.edge), [single]([math]::Max(1.0, $s / 96.0)))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $sheet)

    # the fold: the cut corner turned down onto the page
    $fold = New-Object System.Drawing.Drawing2D.GraphicsPath
    $fold.AddPolygon(@(
      [System.Drawing.PointF]::new(($sx + $sw - $cut), $sy),
      [System.Drawing.PointF]::new(($sx + $sw), ($sy + $cut)),
      [System.Drawing.PointF]::new(($sx + $sw - $cut), ($sy + $cut))
    ))
    $foldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF(($sx + $sw - $cut), $sy)),
      (New-Object System.Drawing.PointF(($sx + $sw), ($sy + $cut))),
      (ColorOf $C.foldLight), (ColorOf $C.fold))
    $g.FillPath($foldBrush, $fold)
    if ($size -ge 32) { $g.DrawPath($pen, $fold) }
    $foldBrush.Dispose(); $fold.Dispose(); $pen.Dispose()

    # lines of writing: two at the small sizes, three from 32px up
    $lw = [single]([math]::Max(1.0, $s * 0.05))
    $linePen = New-Object System.Drawing.Pen((ColorOf $C.line), $lw)
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $x1 = [single]($sx + $sw * 0.18); $x2 = [single]($sx + $sw * 0.82)
    $ys = if ($size -ge 32) { @(0.40, 0.52, 0.64) } else { @(0.42, 0.58) }
    $i = 0
    foreach ($yy in $ys) {
      $y = [single]($s * $yy)
      # the last line stops short, under the app's mark
      $end = if ($i -eq $ys.Count - 1) { [single]($sx + $sw * 0.46) } else { $x2 }
      $g.DrawLine($linePen, $x1, $y, $end, $y)
      $i++
    }
    $linePen.Dispose()
    $sheet.Dispose()

    # the app's tile and mark, at the bottom right
    $ts = [single]($s * 0.46)
    $tx = [single]($s - $ts - $s * 0.02); $ty = [single]($s - $ts - $s * 0.02)
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tr = [single]($ts * 0.24); $td = $tr * 2
    $tile.AddArc($tx, $ty, $td, $td, 180, 90)
    $tile.AddArc([single]($tx + $ts - $td), $ty, $td, $td, 270, 90)
    $tile.AddArc([single]($tx + $ts - $td), [single]($ty + $ts - $td), $td, $td, 0, 90)
    $tile.AddArc($tx, [single]($ty + $ts - $td), $td, $td, 90, 90)
    $tile.CloseFigure()
    $tileBrush = New-Object System.Drawing.SolidBrush((ColorOf $C.tile))
    $g.FillPath($tileBrush, $tile)
    $tileBrush.Dispose()
    if ($size -ge 24) {
      $tilePen = New-Object System.Drawing.Pen((ColorOf $C.tileEdge), [single]([math]::Max(1.0, $s / 128.0)))
      $g.DrawPath($tilePen, $tile)
      $tilePen.Dispose()
    }
    $tile.Dispose()

    $mark = New-MarkPath
    $b = $mark.GetBounds()
    $fit = [single](($ts * 0.66) / [math]::Max($b.Width, $b.Height))
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Translate([single]($tx + $ts / 2), [single]($ty + $ts / 2))
    $m.Scale($fit, $fit)
    $m.Translate([single](-($b.X + $b.Width / 2)), [single](-($b.Y + $b.Height / 2)))
    $mark.Transform($m)
    $m.Dispose()
    $mb = $mark.GetBounds()
    $markBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.PointF($mb.X, $mb.Y)),
      (New-Object System.Drawing.PointF(($mb.X + $mb.Width), ($mb.Y + $mb.Height))),
      (ColorOf $C.markFrom), (ColorOf $C.markTo))
    $g.FillPath($markBrush, $mark)
    $markBrush.Dispose()
    $mark.Dispose()
  } finally { $g.Dispose() }
  return $bmp
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return , [byte[]]$bytes
}

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
  $written = (Get-Item $path).Length
  $expected = 6 + 16 * $images.Count + (($images | ForEach-Object { $_.bytes.Length } | Measure-Object -Sum).Sum)
  if ($written -ne $expected) { throw "$path is $written bytes, expected $expected - the images did not reach the file." }
  return $images.Count
}

# A big-endian 32-bit number, as an .icns wants its lengths.
function Write-BE([System.IO.BinaryWriter]$bw, [int]$n) {
  $bw.Write([byte](($n -shr 24) -band 0xFF)); $bw.Write([byte](($n -shr 16) -band 0xFF))
  $bw.Write([byte](($n -shr 8) -band 0xFF)); $bw.Write([byte]($n -band 0xFF))
}

<#
  An .icns for macOS: 'icns', the file's length, then one entry per size - a
  four-letter type, the entry's length, and the picture as a PNG (which every
  macOS since 10.7 reads).
#>
function Write-Icns([string]$path) {
  $kinds = @(
    @{ type = 'icp4'; size = 16 }, @{ type = 'icp5'; size = 32 }, @{ type = 'icp6'; size = 64 },
    @{ type = 'ic07'; size = 128 }, @{ type = 'ic08'; size = 256 }, @{ type = 'ic09'; size = 512 }, @{ type = 'ic10'; size = 1024 },
    @{ type = 'ic11'; size = 32 }, @{ type = 'ic12'; size = 64 }, @{ type = 'ic13'; size = 256 }, @{ type = 'ic14'; size = 512 }
  )
  $cache = @{}
  $total = 8
  foreach ($k in $kinds) {
    if (-not $cache.ContainsKey($k.size)) { $bmp = Render-Icon $k.size; $cache[$k.size] = (Get-PngBytes $bmp); $bmp.Dispose() }
    $total += 8 + $cache[$k.size].Length
  }
  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter($fs)
  try {
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
    Write-BE $bw $total
    foreach ($k in $kinds) {
      $bytes = [byte[]]$cache[$k.size]
      $bw.Write([System.Text.Encoding]::ASCII.GetBytes($k.type))
      Write-BE $bw (8 + $bytes.Length)
      $bw.Write($bytes, 0, $bytes.Length)
    }
  } finally { $bw.Dispose(); $fs.Dispose() }
  if ((Get-Item $path).Length -ne $total) { throw "$path is not the $total bytes its header says." }
  return $kinds.Count
}

function Write-Preview([int[]]$sizes, [string]$path) {
  $pad = 14
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
  $sheet.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $sheet.Dispose()
}

$ICO_SIZES = @(16, 20, 24, 32, 40, 48, 64, 128, 256)

Write-Preview $ICO_SIZES (Join-Path $Out "$Name-preview.png")
Write-Host ("preview  {0}" -f (Join-Path $Out "$Name-preview.png"))

if (-not $PreviewOnly) {
  $big = Render-Icon 1024
  $big.Save((Join-Path $Out "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $corner = $big.GetPixel(2, 2)
  $page = $big.GetPixel(300, 300)
  $big.Dispose()
  if ($corner.A -ne 0) { throw "Corner is not transparent (A=$($corner.A))." }
  if ($page.A -ne 255) { throw "The sheet did not draw (A=$($page.A))." }
  Write-Host ("png      {0}  1024x1024" -f (Join-Path $Out "$Name.png"))
  $n = Write-Ico $ICO_SIZES (Join-Path $Out "$Name.ico")
  Write-Host ("ico      {0}  {1} sizes" -f (Join-Path $Out "$Name.ico"), $n)
  $m = Write-Icns (Join-Path $Out "$Name.icns")
  Write-Host ("icns     {0}  {1} entries" -f (Join-Path $Out "$Name.icns"), $m)
}
