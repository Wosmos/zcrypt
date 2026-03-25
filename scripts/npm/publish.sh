#!/usr/bin/env bash
set -euo pipefail

# Publishes all 7 npm packages after GoReleaser builds the binaries.
# Usage: ./scripts/npm/publish.sh <version>
# Expects: GoReleaser dist/ directory with built archives.

VERSION="${1:?Usage: publish.sh <version>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$(mktemp -d)"
DIST_DIR="${GITHUB_WORKSPACE:-$(pwd)}/dist"

trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> Publishing npm packages for zcrypt v${VERSION}"

# Mapping: npm-suffix -> archive-name | npm-os | npm-cpu
declare -A PLATFORM_MAP=(
  ["darwin-arm64"]="zcrypt_${VERSION}_darwin_arm64.tar.gz|darwin|arm64"
  ["darwin-x64"]="zcrypt_${VERSION}_darwin_amd64.tar.gz|darwin|x64"
  ["linux-x64"]="zcrypt_${VERSION}_linux_amd64.tar.gz|linux|x64"
  ["linux-arm64"]="zcrypt_${VERSION}_linux_arm64.tar.gz|linux|arm64"
  ["win32-x64"]="zcrypt_${VERSION}_windows_amd64.zip|win32|x64"
  ["win32-arm64"]="zcrypt_${VERSION}_windows_arm64.zip|win32|arm64"
)

# Publish each platform package first
for platform in "${!PLATFORM_MAP[@]}"; do
  IFS='|' read -r archive npm_os npm_cpu <<< "${PLATFORM_MAP[$platform]}"
  pkg_name="@zcrypt/cli-${platform}"
  pkg_dir="${WORK_DIR}/${platform}"

  echo "==> Packaging ${pkg_name}"
  mkdir -p "${pkg_dir}/bin" "${pkg_dir}/tmp"

  archive_path="${DIST_DIR}/${archive}"
  if [[ ! -f "${archive_path}" ]]; then
    echo "ERROR: Archive not found: ${archive_path}"
    exit 1
  fi

  # Extract binary from archive
  if [[ "${archive}" == *.zip ]]; then
    unzip -o "${archive_path}" -d "${pkg_dir}/tmp"
    cp "${pkg_dir}/tmp/zcrypt.exe" "${pkg_dir}/bin/zcrypt.exe"
  else
    tar -xzf "${archive_path}" -C "${pkg_dir}/tmp"
    cp "${pkg_dir}/tmp/zcrypt" "${pkg_dir}/bin/zcrypt"
    chmod +x "${pkg_dir}/bin/zcrypt"
  fi
  rm -rf "${pkg_dir}/tmp"

  # Generate package.json from template
  sed -e "s|__PKG_NAME__|${pkg_name}|g" \
      -e "s|__VERSION__|${VERSION}|g" \
      -e "s|__OS__|${npm_os}|g" \
      -e "s|__CPU__|${npm_cpu}|g" \
      "${SCRIPT_DIR}/platform-template/package.json.tmpl" > "${pkg_dir}/package.json"

  (cd "${pkg_dir}" && npm publish --access public)
  echo "==> Published ${pkg_name}@${VERSION}"
done

# Publish the main wrapper package last
echo "==> Packaging @zcrypt/cli"
main_dir="${WORK_DIR}/main"
cp -r "${SCRIPT_DIR}/zcrypt" "${main_dir}"

# Update version in package.json and optionalDependencies
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('${main_dir}/package.json', 'utf8'));
  pkg.version = '${VERSION}';
  for (const dep of Object.keys(pkg.optionalDependencies || {})) {
    pkg.optionalDependencies[dep] = '${VERSION}';
  }
  fs.writeFileSync('${main_dir}/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

(cd "${main_dir}" && npm publish --access public)
echo "==> Published @zcrypt/cli@${VERSION}"
echo "==> All npm packages published successfully"
