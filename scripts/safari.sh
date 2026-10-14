#!/usr/bin/env bash
# Builds the Mac app that carries the extension into Safari (safari/, ADR-0008) on the Mac build
# host and installs it in ~/Applications there.
#   npm run build && scripts/safari.sh          # build, install and open the app
#   NODKEY_MAC_HOST=other-mac scripts/safari.sh
# The host needs Xcode, xcodegen and the signing keychain named in ~/.appstoreconnect/config.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${NODKEY_MAC_HOST:-fintermac}"
REMOTE="${NODKEY_REMOTE:-github/nodkey-browser}"
test -f dist/safari/manifest.json || { echo "Run npm run build first." >&2; exit 1; }

ssh "$HOST" "mkdir -p ~/$REMOTE/dist"
rsync -az --delete --exclude '*.xcodeproj' --exclude build safari/ "$HOST:$REMOTE/safari/"
rsync -az --delete dist/safari/ "$HOST:$REMOTE/dist/safari/"
ssh "$HOST" "REMOTE=$REMOTE bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
cd ~/"$REMOTE/safari"
~/xcodegen-2.45.4/bin/xcodegen generate --quiet
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
source ~/.appstoreconnect/config
security unlock-keychain -p "$(cat "$KEYCHAIN_PASSWORD_FILE")" "$KEYCHAIN_PATH"
# Always a clean build: the copied web extension must be sealed into a fresh signature.
rm -rf build
xcodebuild -project NodkeySafari.xcodeproj -scheme NodkeySafari -configuration Debug -derivedDataPath build \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN_PATH" build 2>&1 |
  grep -E 'error:|warning:|BUILD (SUCCEEDED|FAILED)' | grep -v appintentsmetadataprocessor | tail -30
app="build/Build/Products/Debug/Nodkey for Safari.app"
test -d "$app"
mkdir -p ~/Applications
rm -rf ~/Applications/"Nodkey for Safari.app"
cp -R "$app" ~/Applications/
codesign --verify --deep --strict ~/Applications/"Nodkey for Safari.app" && echo "signature ok"
open ~/Applications/"Nodkey for Safari.app"
sleep 2
pluginkit -mAvvv -p com.apple.Safari.web-extension 2>/dev/null | grep -A2 nodkey || true
REMOTE_SCRIPT
