#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -x /opt/homebrew/opt/node@20/bin/node ]; then
  PATH="/opt/homebrew/opt/node@20/bin:$PATH"
  export PATH
fi

echo "Checking plugin with Node $(node --version) and npm $(npm --version)"
cd "$repo_root/apps/logseq-plugin-capability-lab"
npm ci
npm run check

cd "$repo_root"
./scripts/check-repository-boundary.sh
git diff --check

echo "Test Graph runtime changes — informational only, not a commit gate."
git -C logseq status --short --branch || true

echo "All outer repository checks passed."
