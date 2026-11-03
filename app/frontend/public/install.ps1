# zcrypt desktop installer for Windows.
#
#   irm https://zcrypt.cloud/install.ps1 | iex
#
# Downloads the current installer, runs it silently for the current user (no
# admin prompt) and starts zcrypt. Set $env:ZCRYPT_NO_OPEN = "1" to skip the
# launch, and $env:ZCRYPT_SITE to download from another site.

& {
  $ErrorActionPreference = "Stop"
  # The progress bar makes Invoke-WebRequest many times slower on Windows PowerShell 5.
  $ProgressPreference = "SilentlyContinue"
  $site = if ($env:ZCRYPT_SITE) { $env:ZCRYPT_SITE.TrimEnd("/") } else { "https://zcrypt.cloud" }
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "zcrypt for Windows needs a 64-bit version of Windows. The web app works on any device: $site"
  }

  $setup = Join-Path ([IO.Path]::GetTempPath()) "zcrypt-setup-$([guid]::NewGuid().ToString('N')).exe"

  Write-Host "==> Downloading zcrypt for Windows"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$site/dl/windows-exe" -OutFile $setup
  } catch {
    Write-Host "$site didn't answer, downloading from GitHub instead"
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/Wosmos/zcrypt/releases/latest/download/zcrypt-windows-x64-setup.exe" -OutFile $setup
  }

  try {
    # A script download carries no Mark of the Web, but clear it in case it was
    # added some other way, so SmartScreen doesn't stop the silent install.
    Unblock-File -Path $setup -ErrorAction SilentlyContinue

    Get-Process -Name "zcrypt" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    Write-Host "==> Installing"
    $proc = Start-Process -FilePath $setup -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
      throw "the installer exited with code $($proc.ExitCode)"
    }
  } finally {
    Remove-Item -Path $setup -Force -ErrorAction SilentlyContinue
  }

  $exe = @(
    (Join-Path $env:LOCALAPPDATA "zcrypt\zcrypt.exe"),
    (Join-Path $env:ProgramFiles "zcrypt\zcrypt.exe")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  Write-Host "==> zcrypt is installed. You'll find it in the Start menu."
  if ($exe -and $env:ZCRYPT_NO_OPEN -ne "1") {
    Start-Process -FilePath $exe
  }
}
