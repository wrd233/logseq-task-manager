#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel)
expected_root=$(CDPATH= cd -- "$script_dir/.." && pwd)

fail() {
  echo "Repository boundary check failed: $*" >&2
  exit 1
}

[ "$repo_root" = "$expected_root" ] || fail "Git top-level is $repo_root, expected $expected_root"
cd "$repo_root"

git check-ignore -q logseq/pages/task-copilot-logseq-bridge.md || fail "logseq/ is not ignored"
tracked_logseq=$(git ls-files --stage -- logseq 'logseq/**')
[ -z "$tracked_logseq" ] || fail "outer index contains logseq paths or a gitlink:\n$tracked_logseq"

forbidden=$(git ls-files | grep -E '(^|/)(node_modules|dist|\.parcel-cache|\.vite|coverage)(/|$)|(^|/)(\.DS_Store|[^/]*\.log)$' || true)
[ -z "$forbidden" ] || fail "generated paths are tracked:\n$forbidden"

[ -d apps/logseq-plugin-capability-lab ] || fail "authoritative plugin directory is missing"
[ -d apps/task-copilot-logseq-plugin ] || fail "formal Task Copilot plugin directory is missing"
[ ! -e logseq/tools/logseq-plugin-capability-lab ] || fail "old plugin path still exists inside test Graph"

plugin_dirs=$(find . -path './.git' -prune -o -path './logseq' -prune -o -type d -name logseq-plugin-capability-lab -print)
[ "$plugin_dirs" = "./apps/logseq-plugin-capability-lab" ] || fail "unexpected plugin source locations: $plugin_dirs"

old_path="$repo_root/logseq/tools/logseq-plugin-capability-lab"
if rg -n --hidden --glob '!.git/**' --glob '!logseq/**' --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!scripts/check-repository-boundary.sh' "$old_path" .; then
  fail "documentation or source still references the old absolute load path"
fi

[ -f apps/logseq-plugin-capability-lab/dist/index.html ] || fail "dist/index.html is missing; run the build"
git check-ignore -q apps/logseq-plugin-capability-lab/dist/index.html || fail "dist output is not ignored"
[ -z "$(git ls-files 'apps/logseq-plugin-capability-lab/dist/**')" ] || fail "dist output is tracked"

[ -f apps/task-copilot-logseq-plugin/dist/index.html ] || fail "formal plugin dist/index.html is missing; run the build"
git check-ignore -q apps/task-copilot-logseq-plugin/dist/index.html || fail "formal plugin dist output is not ignored"
[ -z "$(git ls-files 'apps/task-copilot-logseq-plugin/dist/**')" ] || fail "formal plugin dist output is tracked"

tracked_graph_pages=$(git ls-files | grep -E '(^|/)(pages|journals|whiteboards)/' || true)
[ -z "$tracked_graph_pages" ] || fail "Graph runtime content is tracked:\n$tracked_graph_pages"

echo "Repository boundary check passed."
