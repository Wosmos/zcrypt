#!/bin/sh
# zcrypt desktop installer for macOS and Linux.
#
#   curl -fsSL https://zcrypt.cloud/install.sh | sh
#
# macOS: installs zcrypt.app into /Applications (or ~/Applications when
# /Applications isn't writable) and opens it.
# Linux: installs the .deb or .rpm through the system package manager, or the
# AppImage into ~/.local/bin when neither is available or sudo isn't.
#
# Environment overrides:
#   ZCRYPT_INSTALL_DIR  macOS: folder to put zcrypt.app in
#   ZCRYPT_NO_OPEN=1    don't launch zcrypt after installing
#   ZCRYPT_LINUX_FORMAT deb | rpm | appimage, skips detection

set -eu

SITE_DL="https://zcrypt.cloud/dl"
GITHUB_DL="https://github.com/Wosmos/zcrypt/releases/latest/download"

say() { printf '%s\n' "$*"; }
step() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed"; }

# download <site target> <github asset name> <output file>
# Goes through zcrypt.cloud first so installs are counted, and falls back to
# GitHub directly if the site is unreachable.
download() {
  if ! curl -fL --progress-bar --retry 2 -o "$3" "$SITE_DL/$1"; then
    say "zcrypt.cloud didn't answer, downloading from GitHub instead"
    curl -fL --progress-bar --retry 2 -o "$3" "$GITHUB_DL/$2" || die "download failed"
  fi
}

TMP=""
MOUNT=""
cleanup() {
  if [ -n "$MOUNT" ]; then hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; fi
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
}

install_macos() {
  need hdiutil
  need ditto

  # uname -m reports x86_64 inside Rosetta, so ask the hardware instead.
  if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
    arch=arm64
  else
    arch=x64
  fi

  dest="${ZCRYPT_INSTALL_DIR:-/Applications}"
  if [ -z "${ZCRYPT_INSTALL_DIR:-}" ] && [ ! -w /Applications ]; then
    dest="$HOME/Applications"
  fi
  mkdir -p "$dest"

  step "Downloading zcrypt for macOS ($arch)"
  download "macos-$arch" "zcrypt-macos-$arch.dmg" "$TMP/zcrypt.dmg"

  step "Installing to $dest"
  MOUNT="$TMP/mount"
  mkdir -p "$MOUNT"
  hdiutil attach "$TMP/zcrypt.dmg" -nobrowse -readonly -mountpoint "$MOUNT" -quiet \
    || die "couldn't open the disk image"
  app="$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -n 1)"
  [ -n "$app" ] || die "no app found in the disk image"

  if pgrep -x zcrypt >/dev/null 2>&1; then
    say "Closing the running copy of zcrypt"
    osascript -e 'quit app "zcrypt"' >/dev/null 2>&1 || true
    sleep 2
  fi

  rm -rf "$dest/zcrypt.app"
  ditto "$app" "$dest/zcrypt.app"
  hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true
  MOUNT=""

  # curl doesn't set the quarantine flag, but clear it anyway in case this
  # script itself was downloaded through a browser.
  xattr -dr com.apple.quarantine "$dest/zcrypt.app" 2>/dev/null || true

  step "zcrypt is installed in $dest"
  if [ "${ZCRYPT_NO_OPEN:-}" != "1" ]; then
    open "$dest/zcrypt.app"
  fi
}

# as_root <command...>: run as root through sudo, or directly when already root.
as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo "$@"; fi
}

can_root() {
  [ "$(id -u)" = "0" ] || command -v sudo >/dev/null 2>&1
}

install_appimage() {
  bin="$HOME/.local/bin"
  apps="$HOME/.local/share/applications"
  mkdir -p "$bin" "$apps"

  step "Downloading zcrypt AppImage"
  download "linux-appimage" "zcrypt-linux-amd64.AppImage" "$TMP/zcrypt.AppImage"
  mv "$TMP/zcrypt.AppImage" "$bin/zcrypt.AppImage"
  chmod +x "$bin/zcrypt.AppImage"

  cat >"$apps/zcrypt.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=zcrypt
Comment=Encrypted cloud storage on accounts you already own
Exec=$bin/zcrypt.AppImage %U
Terminal=false
Categories=Utility;
MimeType=x-scheme-handler/zcrypt;
EOF

  step "zcrypt is installed in $bin/zcrypt.AppImage"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) say "Add $bin to your PATH to start it from a terminal." ;;
  esac
  LAUNCH="$bin/zcrypt.AppImage"
}

install_linux() {
  case "$(uname -m)" in
    x86_64 | amd64) ;;
    *) die "zcrypt for Linux is only built for x86_64 right now. The web app works on any device: https://zcrypt.cloud" ;;
  esac

  format="${ZCRYPT_LINUX_FORMAT:-}"
  if [ -z "$format" ]; then
    if command -v apt-get >/dev/null 2>&1 && can_root; then
      format=deb
    elif { command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; } && can_root; then
      format=rpm
    else
      format=appimage
    fi
  fi

  LAUNCH="zcrypt"
  case "$format" in
    deb)
      step "Downloading zcrypt (.deb)"
      download "linux-deb" "zcrypt-linux-amd64.deb" "$TMP/zcrypt.deb"
      chmod 755 "$TMP"; chmod 644 "$TMP/zcrypt.deb"
      step "Installing with apt (it may ask for your password)"
      as_root apt-get install -y "$TMP/zcrypt.deb"
      ;;
    rpm)
      step "Downloading zcrypt (.rpm)"
      download "linux-rpm" "zcrypt-linux-x86_64.rpm" "$TMP/zcrypt.rpm"
      chmod 755 "$TMP"; chmod 644 "$TMP/zcrypt.rpm"
      step "Installing the package (it may ask for your password)"
      if command -v dnf >/dev/null 2>&1; then
        as_root dnf install -y "$TMP/zcrypt.rpm"
      elif command -v zypper >/dev/null 2>&1; then
        as_root zypper --non-interactive install --allow-unsigned-rpm "$TMP/zcrypt.rpm"
      else
        as_root yum install -y "$TMP/zcrypt.rpm"
      fi
      ;;
    appimage) install_appimage ;;
    *) die "unknown ZCRYPT_LINUX_FORMAT '$format' (use deb, rpm or appimage)" ;;
  esac

  if [ "$format" != "appimage" ]; then step "zcrypt is installed"; fi
  if [ "${ZCRYPT_NO_OPEN:-}" != "1" ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    nohup "$LAUNCH" >/dev/null 2>&1 &
  fi
}

main() {
  need curl
  TMP="$(mktemp -d 2>/dev/null || mktemp -d -t zcrypt)"
  trap cleanup EXIT INT TERM

  case "$(uname -s)" in
    Darwin) install_macos ;;
    Linux) install_linux ;;
    *) die "this installer is for macOS and Linux. On Windows, run in PowerShell: irm https://zcrypt.cloud/install.ps1 | iex" ;;
  esac
}

main "$@"
