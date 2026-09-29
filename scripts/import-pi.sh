#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target_directory="${repository_root}/pi"

rm -rf -- "$target_directory"
git clone --depth 1 https://github.com/earendil-works/pi.git "$target_directory"
