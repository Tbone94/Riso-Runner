#!/bin/zsh
# tools/itch-build.sh — pack the browser build for itch.io.
# Writes promo/itch/riso-runner-<stamp>.zip with index.html at the root. Upload it as the HTML5 file
# ("This file will be played in the browser"). The offline service worker is left out: itch serves every
# upload at a fresh URL, so its iframe shouldn't keep an offline copy of an old build.
set -e
cd "${0:A:h}/.."
stamp=$(date +%Y%m%d%H%M)
tmp=$(mktemp -d)
cp -R index.html riso.js manifest.webmanifest src lib models fonts icons music "$tmp/"
python3 - "$tmp/index.html" <<'PY'
import re,sys
p=sys.argv[1];s=open(p).read()
s2=re.sub(r"<script>\s*// Offline support.*?</script>\s*","",s,flags=re.S)
assert s2!=s,"service-worker block not found in index.html"
open(p,'w').write(s2)
PY
mkdir -p promo/itch
out="promo/itch/riso-runner-$stamp.zip"
(cd "$tmp" && zip -qr -X - . -x '.*' '*/.*') > "$out"
rm -rf "$tmp"
echo "$out ($(du -h "$out" | cut -f1))"
