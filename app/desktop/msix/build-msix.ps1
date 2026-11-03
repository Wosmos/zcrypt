param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$Icon,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$IdentityName,
  [Parameter(Mandatory = $true)][string]$Publisher,
  [Parameter(Mandatory = $true)][string]$PublisherDisplayName,
  [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version '$Version' is not a.b.c" }
$msixVersion = "$Version.0"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$layout = Join-Path $env:RUNNER_TEMP "msix-layout"
if (Test-Path $layout) { Remove-Item -Recurse -Force $layout }
$assets = Join-Path $layout "Assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null

Copy-Item $Exe (Join-Path $layout "zcrypt.exe")

function New-Logo([string]$Name, [int]$Size) {
  $src = [System.Drawing.Image]::FromFile((Resolve-Path $Icon))
  try {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $Size, $Size)
    $g.Dispose()
    $bmp.Save((Join-Path $assets $Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally {
    $src.Dispose()
  }
}

New-Logo "StoreLogo.scale-100.png" 50
New-Logo "StoreLogo.scale-200.png" 100
New-Logo "Square44x44Logo.scale-100.png" 44
New-Logo "Square44x44Logo.scale-200.png" 88
New-Logo "Square44x44Logo.targetsize-44.png" 44
New-Logo "Square44x44Logo.targetsize-256.png" 256
New-Logo "Square150x150Logo.scale-100.png" 150
New-Logo "Square150x150Logo.scale-200.png" 300

$manifest = Get-Content (Join-Path $here "AppxManifest.xml") -Raw
$manifest = $manifest.Replace("@IDENTITY_NAME@", [System.Security.SecurityElement]::Escape($IdentityName))
$manifest = $manifest.Replace("@PUBLISHER@", [System.Security.SecurityElement]::Escape($Publisher))
$manifest = $manifest.Replace("@PUBLISHER_DISPLAY_NAME@", [System.Security.SecurityElement]::Escape($PublisherDisplayName))
$manifest = $manifest.Replace("@VERSION@", $msixVersion)
[System.IO.File]::WriteAllText((Join-Path $layout "AppxManifest.xml"), $manifest, (New-Object System.Text.UTF8Encoding($false)))

$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter makeappx.exe |
  Where-Object { $_.FullName -match '\\bin\\\d+\.\d+\.\d+\.\d+\\x64\\' } |
  Sort-Object { [version]($_.FullName -replace '.*\\bin\\(\d+\.\d+\.\d+\.\d+)\\.*', '$1') } -Descending |
  Select-Object -First 1
if (-not $makeappx) { throw "makeappx.exe not found: the Windows SDK is missing from this runner" }
Write-Host "Using $($makeappx.FullName)"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
& $makeappx.FullName pack /d $layout /p $Out /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed with exit code $LASTEXITCODE" }
Get-Item $Out | Format-List Name, Length
