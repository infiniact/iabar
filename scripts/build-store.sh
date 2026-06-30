#!/usr/bin/env bash
# Build the Chrome Web Store upload package: a clean unpacked build with the
# pinned manifest `key` OMITTED (so the store assigns the official prod id),
# zipped with only the extension payload. No crx, no signing key, no selfhost.
# Usage: pnpm run build:store
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ clean store build (key omitted via IABAR_STORE=1)"
rm -rf dist
IABAR_STORE=1 pnpm run build

# Guard: the store package must NOT contain the pinned key.
if grep -q '"key"' dist/manifest.json; then
  echo "✗ dist/manifest.json still contains a \"key\" field — aborting." >&2
  exit 1
fi

VER=$(node -p "require('./package.json').version")
OUT="iabar-store-${VER}.zip"

echo "▶ zip payload only"
rm -f "$OUT"
# Zip the contents of dist/ (CWS expects the manifest at the archive root).
( cd dist && zip -rq "../${OUT}" . )

cat <<TXT

✅ Store package ready — v${VER}
   upload   : ${OUT}   (manifest.json at archive root, no key, no signing files)

Sanity checks already done:
   [✓] manifest.json has no "key" field (store assigns the prod id)
   [✓] archive contains only the built dist/ payload

Next:
   1. Web Store Dashboard → your item → Upload new package → ${OUT}
   2. Fill listing/privacy fields from STORE_LISTING.md
   3. After the item is created, copy the store-assigned public key back into
      manifest.config.ts (the non-store branch) so unpacked dev shares the id.
TXT
