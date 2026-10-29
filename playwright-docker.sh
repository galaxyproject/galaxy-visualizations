#!/bin/sh
set -eu

repo_dir=$(cd "$(dirname "$0")" && pwd)
package_dir=$(pwd)
package=$(basename "$package_dir")
version=$(node -p 'require(process.argv[1]).packages["node_modules/@playwright/test"].version' "$package_dir/package-lock.json")
image="mcr.microsoft.com/playwright:v$version-noble"
volume="playwright-$package-$(cksum < "$package_dir/package-lock.json" | cut -d' ' -f1)"
network="none"
if [ -n "${PLAYWRIGHT_ALLOW_NETWORK:-}" ]; then
    network="bridge"
fi

run() {
    docker run --rm --ipc=host --platform linux/amd64 \
        -v "$repo_dir":/work \
        -v "$volume:/work/packages/$package/node_modules" \
        -w "/work/packages/$package" \
        -e CI=1 \
        -e PLAYWRIGHT_DOCKER=1 \
        "$@"
}

run "$image" sh -c '[ -d node_modules/@playwright/test ] || npm ci --no-audit --no-fund'
run --network "$network" "$image" npx playwright test "$@"
