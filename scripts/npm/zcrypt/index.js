"use strict";

const path = require("path");
const fs = require("fs");

const PLATFORMS = {
  "darwin-arm64": "@zcrypt/cli-darwin-arm64",
  "darwin-x64": "@zcrypt/cli-darwin-x64",
  "linux-x64": "@zcrypt/cli-linux-x64",
  "linux-arm64": "@zcrypt/cli-linux-arm64",
  "win32-x64": "@zcrypt/cli-win32-x64",
  "win32-arm64": "@zcrypt/cli-win32-arm64",
};

function getBinaryPath() {
  const platformKey = `${process.platform}-${process.arch}`;
  const pkg = PLATFORMS[platformKey];
  if (!pkg) return null;

  try {
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    const binaryName = process.platform === "win32" ? "zcrypt.exe" : "zcrypt";
    const binaryPath = path.join(pkgDir, "bin", binaryName);
    if (fs.existsSync(binaryPath)) return binaryPath;
    return null;
  } catch {
    return null;
  }
}

module.exports = { getBinaryPath, PLATFORMS };
