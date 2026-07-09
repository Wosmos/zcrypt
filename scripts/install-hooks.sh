#!/usr/bin/env bash
#
# install-hooks — point git at the version-controlled hooks in scripts/git-hooks/.
# Run once per clone:
#
#     bash scripts/install-hooks.sh
#
# This sets core.hooksPath so the tracked hooks take effect. Undo with:
#
#     git config --unset core.hooksPath
#
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
git -C "$ROOT" config core.hooksPath scripts/git-hooks
chmod +x "$ROOT"/scripts/git-hooks/* 2>/dev/null || true

echo "✓ git hooks installed — core.hooksPath = scripts/git-hooks"
echo "  pre-push runs: scripts/prepush.sh --gates-only --enforce (scoped to changed modules)"
echo "  bypass once with: git push --no-verify"
