#!/usr/bin/env bash
# Clones or updates every repo in tools.json into folders under $DEST.
# Default DEST is ~/Toolbox (outside iCloud Documents on purpose).
# Safe to re-run: existing clones are fast-forwarded, nothing is deleted.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$HOME/Toolbox}"
mkdir -p "$DEST"

python3 - "$HERE/tools.json" <<'PY' | while IFS=$'\t' read -r folder repo; do
import json, sys
data = json.load(open(sys.argv[1]))
for folder, items in data["folders"].items():
    for item in items:
        print(f"{folder}\t{item['repo']}")
PY
  target="$DEST/$folder/${repo#*/}"
  mkdir -p "$DEST/$folder"
  if [ -d "$target/.git" ]; then
    echo "update  $folder/${repo#*/}"
    git -C "$target" pull --ff-only --quiet || echo "  skipped (local changes)"
  else
    echo "clone   $folder/${repo#*/}"
    git clone --depth 1 --quiet "https://github.com/$repo" "$target"
  fi
done

echo "Done. Tools are in $DEST"
