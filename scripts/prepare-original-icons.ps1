$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root 'public/assets/images/1daa842e0367792f.png'
$source = [Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($size in @(192, 512)) {
    $target = Join-Path $root "public/icons/catan-original-v6-$size.png"
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([Drawing.Color]::FromArgb(248, 250, 252))
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $scale = ($size * 0.90) / [Math]::Max($source.Width, $source.Height)
      $width = [int][Math]::Round($source.Width * $scale)
      $height = [int][Math]::Round($source.Height * $scale)
      $graphics.DrawImage($source, [int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
      $bitmap.Save($target, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
