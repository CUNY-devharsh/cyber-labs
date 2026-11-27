#!/usr/bin/env bash
# Builds everything the web page docs/kali-browser/ needs to run the machine
# and puts it beside the page:
#   v86/     the emulator and BIOS files
#   xterm/   the terminal
#   image/   the root file system (flat/), the saved state and info.json
#
# Needs Docker, Node 20 or newer, Python 3 with the zstandard module, zstd and git.
# usage: ./build.sh [site dir]      (default: ../docs/kali-browser)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SITE="${1:-$DIR/../docs/kali-browser}"
WORK="${LAB_WORK:-$DIR/work}"
V86_VERSION="${V86_VERSION:-0.5.476}"               # npm package: the emulator
V86_COMMIT="${V86_COMMIT:-9457e7a}"                 # git commit: the BIOS files
XTERM_VERSION="${XTERM_VERSION:-6.0.0}"
FIT_VERSION="${FIT_VERSION:-0.11.0}"
IMAGE="${LAB_IMAGE:-lab/kali-v86:latest}"

mkdir -p "$SITE/v86" "$SITE/xterm" "$SITE/image" "$WORK/v86"

echo "== 1/4 emulator and terminal files"
if [ ! -f "$WORK/v86/libv86.mjs" ]; then
  tmp="$(mktemp -d)"
  (cd "$tmp" && npm pack --silent "v86@$V86_VERSION" "@xterm/xterm@$XTERM_VERSION" "@xterm/addon-fit@$FIT_VERSION" >/dev/null \
    && mkdir v86 xterm fit && tar xzf v86-*.tgz -C v86 && tar xzf xterm-xterm-*.tgz -C xterm && tar xzf xterm-addon-fit-*.tgz -C fit)
  git clone --quiet --filter=blob:none --no-checkout https://github.com/copy/v86.git "$tmp/src"
  git -C "$tmp/src" checkout --quiet "$V86_COMMIT" -- bios/seabios.bin bios/vgabios.bin bios/COPYING.LESSER
  cp "$tmp/v86/package/build/libv86.mjs" "$tmp/v86/package/build/v86.wasm" "$tmp/src/bios/seabios.bin" "$tmp/src/bios/vgabios.bin" "$WORK/v86/"
  cp "$tmp/v86/package/build/libv86.js" "$tmp/v86/package/build/v86.wasm" "$tmp/src/bios/seabios.bin" "$tmp/src/bios/vgabios.bin" "$SITE/v86/"
  cp "$tmp/v86/package/LICENSE" "$SITE/v86/LICENSE-v86.txt"
  cp "$tmp/src/bios/COPYING.LESSER" "$SITE/v86/LICENSE-bios.txt"
  cp "$tmp/xterm/package/lib/xterm.js" "$tmp/xterm/package/css/xterm.css" "$tmp/fit/package/lib/addon-fit.js" "$SITE/xterm/"
  cp "$tmp/xterm/package/LICENSE" "$SITE/xterm/LICENSE-xterm.txt"
  rm -rf "$tmp"
fi

echo "== 2/4 system image"
if [ -z "${LAB_SKIP_DOCKER_BUILD:-}" ]; then
  # Docker Hub sometimes answers 429 (too many requests). Try a few times.
  for attempt in 1 2 3 4; do
    if docker build --platform linux/386 --target vm --tag "$IMAGE" ${LAB_TOOLS:+--build-arg "LAB_TOOLS=$LAB_TOOLS"} "$DIR"; then break; fi
    [ "$attempt" = 4 ] && { echo "docker build failed"; exit 1; }
    sleep $((attempt * 60))
  done
fi
docker rm -f lab-kali-v86-export >/dev/null 2>&1 || true
docker create --platform linux/386 --name lab-kali-v86-export "$IMAGE" >/dev/null
docker export lab-kali-v86-export > "$WORK/rootfs.tar"
docker rm lab-kali-v86-export >/dev/null

echo "== 3/4 file store"
rm -rf "$WORK/flat" "$WORK/fs.json"
python3 "$DIR/tools/pack-rootfs.py" "$WORK/rootfs.tar" "$WORK"
rm -f "$WORK/rootfs.tar"

echo "== 4/4 boot once, check, and save the state"
rm -rf "$SITE/image" && mkdir -p "$SITE/image"
mv "$WORK/flat" "$SITE/image/flat"
node "$DIR/build-state.mjs" "$WORK/v86" "$WORK/fs.json" "$SITE/image" ${LAB_NO_SAVE:+--no-save}
echo "== done"
du -sh "$SITE/image/flat" "$SITE/image/state.bin.zst" "$SITE" 2>/dev/null || true
cat "$SITE/image/info.json" 2>/dev/null || true
