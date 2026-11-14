#!/usr/bin/env bash
# registers the iris:// protocol for xdg-open (linux dev testing).
# packaged installs self-register via electron-builder protocols, this is
# only so a dev checkout answers share-link clicks too.
# usage: ./scripts/register-deeplink-linux.sh [--binary /path/to/iris]
set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$HOME/.local/share/applications"

if [ "${1:-}" = "--binary" ]; then
  BIN="${2:?pass a binary path after --binary}"
  [ -x "$BIN" ] || { echo "not executable: $BIN" >&2; exit 1; }
  EXEC="$BIN %u"
  ENTRY="iris-handler.desktop"
  LABEL="Iris"
else
  ELECTRON="$DESKTOP_DIR/node_modules/.bin/electron"
  [ -x "$ELECTRON" ] || { echo "electron not found, run pnpm install first" >&2; exit 1; }
  # second instance forwards the url to the running dev app and quits,
  # so keep the vite dev server running for this to open anything
  EXEC="$ELECTRON $DESKTOP_DIR %u"
  ENTRY="iris-dev.desktop"
  LABEL="Iris (dev)"
fi

mkdir -p "$APP_DIR"
cat > "$APP_DIR/$ENTRY" <<EOF
[Desktop Entry]
Name=$LABEL
Exec=$EXEC
Type=Application
Terminal=false
NoDisplay=true
MimeType=x-scheme-handler/iris;
EOF

update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
xdg-mime default "$ENTRY" x-scheme-handler/iris

echo "handler: $(xdg-mime query default x-scheme-handler/iris)"
echo "test with: xdg-open 'iris://artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ'"
