#!/usr/bin/env bash
set -euo pipefail

# ====== CONFIG ======
BASE_DIR="context/spec/"
# ====================

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <short-name>" >&2
  exit 1
fi

SHORT_NAME=$1
max_index=-1

# Walk one level deep, NUL-safe
while IFS= read -r -d '' dir; do
  name=${dir%/}
  name=${name##*/}

  if [[ $name =~ ^([0-9]{3})- ]]; then
    idx_str=${BASH_REMATCH[1]}
    idx_val=$((10#$idx_str))
    if (( idx_val > max_index )); then
      max_index=$idx_val
    fi
  fi
done < <(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d -print0)

# Compute next index
if (( max_index < 0 )); then
  next=1
else
  next=$((max_index + 1))
fi

if (( next > 999 )); then
  echo "Error: next index would exceed 999." >&2
  exit 1
fi

NEXT_INDEX=$(printf "%03d" "$next")
NEW_DIR="$BASE_DIR/$NEXT_INDEX-$SHORT_NAME"

# Create directory
mkdir -p "$NEW_DIR"

echo "Created: $NEW_DIR"
