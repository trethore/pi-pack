#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 || -z "${1:-}" ]]; then
  echo "Usage: npm run import:pi -- <tag> (example: npm run import:pi -- v1.1.0)" >&2
  exit 1
fi

tag="$1"
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target_directory="${repository_root}/pi"

rm -rf -- "$target_directory"
git clone --depth 1 --branch "$tag" https://github.com/earendil-works/pi.git "$target_directory"
