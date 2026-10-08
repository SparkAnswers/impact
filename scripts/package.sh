#!/bin/sh
# Builds ./sparkanswers-impact-app-<version>.zip from ./dist (run `npm run build` first).
set -eu
cd "$(dirname "$0")/.."
ID=sparkanswers-impact-app
VERSION=$(node -p "require('./package.json').version")
[ -d dist ] || { echo "dist/ missing; run the build first" >&2; exit 1; }
rm -rf "work/$ID" && mkdir -p work && cp -r dist "work/$ID"
command -v zip >/dev/null 2>&1 || { apk add --no-cache zip >/dev/null 2>&1 || apt-get install -y zip >/dev/null 2>&1; }
rm -f "$ID-$VERSION.zip"
(cd work && zip -qr "../$ID-$VERSION.zip" "$ID")
rm -rf work
echo "wrote $ID-$VERSION.zip"
