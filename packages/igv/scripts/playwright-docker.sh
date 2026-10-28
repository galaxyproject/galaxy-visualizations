#!/bin/sh
set -eu

package_dir=$(cd "$(dirname "$0")/.." && pwd)
repo_dir=$(cd "$package_dir/../.." && pwd)
package=$(basename "$package_dir")
version=$(node -p 'require(process.argv[1]).packages["node_modules/@playwright/test"].version' "$package_dir/package-lock.json")

exec docker run --rm --ipc=host --platform linux/amd64 \
    -v "$repo_dir":/work \
    -v "playwright-$package-node-modules:/work/packages/$package/node_modules" \
    -w "/work/packages/$package" \
    -e CI=1 \
    "mcr.microsoft.com/playwright:v$version-noble" \
    sh -c '[ -d node_modules/@playwright/test ] || npm ci --no-audit --no-fund; npx playwright test "$@"' sh "$@"
