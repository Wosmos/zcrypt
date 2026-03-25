#!/usr/bin/env node

"use strict";

const { execFileSync } = require("child_process");
const { getBinaryPath } = require("../index.js");

const binary = getBinaryPath();

if (!binary) {
  const platformKey = `${process.platform}-${process.arch}`;
  console.error(
    `Error: No zcrypt binary found for ${platformKey}.\n` +
    `Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64, win32-arm64\n\n` +
    `Try reinstalling:\n` +
    `  npm install -g @zcrypt/cli\n\n` +
    `Or install directly:\n` +
    `  curl -fsSL https://zcrypt.cloud/install.sh | sh`
  );
  process.exit(1);
}

try {
  execFileSync(binary, process.argv.slice(2), { stdio: "inherit" });
} catch (e) {
  if (e.status !== undefined) {
    process.exit(e.status);
  }
  console.error(e.message);
  process.exit(1);
}
