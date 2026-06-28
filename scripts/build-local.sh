#!/usr/bin/env bash
# Build a locally verifiable IABar: clean build → unpacked dist/ + zip + a
# fixed-id .crx + a refreshed self-host bundle, then print a verify checklist.
# Usage: pnpm run build:local
set -euo pipefail
cd "$(dirname "$0")/.."

ID=obnegfbdllkgcmchabhaomkdgceaelik
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "▶ clean build"
rm -rf dist
pnpm run build

VER=$(node -p "require('./package.json').version")

echo "▶ zip"
rm -f "iabar-${VER}.zip"
( cd dist && zip -rq "../iabar-${VER}.zip" . )

echo "▶ crx (fixed id)"
# Chrome's --pack-extension-key needs a PKCS#8 key; derive it from key.pem once.
if [ ! -f key.pkcs8.pem ]; then
  [ -f key.pem ] || openssl genrsa 2048 > key.pem 2>/dev/null
  openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem 2>/dev/null
fi
if [ -x "$CHROME" ]; then
  "$CHROME" --pack-extension="$PWD/dist" --pack-extension-key="$PWD/key.pkcs8.pem" --no-message-box >/dev/null 2>&1 || true
  mkdir -p selfhost
  [ -f dist.crx ] && mv -f dist.crx selfhost/iabar.crx
  cat > selfhost/update_manifest.xml <<XML
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${ID}'>
    <updatecheck codebase='http://localhost:8731/iabar.crx' version='${VER}' />
  </app>
</gupdate>
XML
  echo "  → selfhost/iabar.crx (v${VER})"
else
  echo "  ⚠ Chrome not at $CHROME — skipped crx (unpacked dist/ still works)"
fi

cat <<TXT

✅ Local build ready — v${VER}, id ${ID}
   unpacked : dist/               (chrome://extensions → Load unpacked)
   zip      : iabar-${VER}.zip
   crx      : selfhost/iabar.crx  (force-install bundle in selfhost/)

Verify checklist (Load unpacked dist/, then):
   [ ] side panel opens; no "Engine failed to load"
   [ ] Settings → DeepSeek → paste key → 获取模型列表 shows "✓ N models"
   [ ] pick a model → 测试 shows "✓ works" → 保存
   [ ] Chat: send a message → assistant replies
   [ ] type @ → pick a tab → allow site → context chip attaches → reply uses it
   [ ] Theme 跟随系统/浅色/深色 applies live
   [ ] History: conversation listed; reopen + delete work
   [ ] reload the extension → same id; settings + history persist
TXT
