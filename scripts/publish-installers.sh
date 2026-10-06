#!/usr/bin/env bash
# Upload installers to a GitHub release, each twice: under its own name and
# under a version-less alias.
#
#   scripts/publish-installers.sh <tag> <file>...
#
# Every bundler name embeds the version (zcrypt_0.1.4_aarch64.dmg), so none of
# them can be fetched from a stable /releases/latest/download/<name> URL: the
# download page, the docs and the install scripts all had to know the version.
# The alias copy (zcrypt-macos-arm64.dmg) keeps one URL per platform working
# across releases. Identical bytes, --clobber replaces. Files with no alias
# (.sig sidecars) are uploaded once.
set -euo pipefail

tag="${1:?usage: publish-installers.sh <tag> <file>...}"
shift
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"

[ "$#" -gt 0 ] || { echo "no installer files given"; exit 0; }

alias_for() {
  case "$1" in
    *_aarch64.dmg)    echo zcrypt-macos-arm64.dmg ;;
    *_x64.dmg)        echo zcrypt-macos-x64.dmg ;;
    *-setup.exe)      echo zcrypt-windows-x64-setup.exe ;;
    *.msi)            echo zcrypt-windows-x64.msi ;;
    *.AppImage)       echo zcrypt-linux-amd64.AppImage ;;
    *.deb)            echo zcrypt-linux-amd64.deb ;;
    *.rpm)            echo zcrypt-linux-x86_64.rpm ;;
    *)                echo "" ;;
  esac
}

printf 'uploading: %s\n' "$@"
gh release upload "$tag" "$@" --repo "$repo" --clobber

aliasdir="$(mktemp -d)"
aliases=()
for f in "$@"; do
  name="$(alias_for "$f")"
  [ -z "$name" ] && continue
  cp "$f" "$aliasdir/$name"
  aliases+=("$aliasdir/$name")
done
if [ "${#aliases[@]}" -gt 0 ]; then
  printf 'alias: %s\n' "${aliases[@]}"
  gh release upload "$tag" "${aliases[@]}" --repo "$repo" --clobber
fi
