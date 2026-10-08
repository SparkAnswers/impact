#!/bin/sh
# Installs dependencies inside the node container when they are missing or package-lock.json changed.
set -eu
cd "$(dirname "$0")/.."
STAMP=node_modules/.impact-lock-stamp
WANT=$(cksum package-lock.json | cut -d' ' -f1)
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$WANT" ] && [ -d node_modules/@grafana ]; then
  exit 0
fi
npm ci --no-audit --no-fund
echo "$WANT" > "$STAMP"
