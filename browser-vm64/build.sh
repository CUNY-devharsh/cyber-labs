#!/usr/bin/env bash
# Builds everything the web page docs/kali-browser64/ needs to run the 64-bit
# machine and puts it beside the page:
#   qemu/       QEMU compiled to WebAssembly (from qemu/build-qemu.sh)
#   xterm/      the terminal
#   xterm-pty/  connects the terminal to QEMU's serial line
#   fflate/     unpacks the disk pieces
#   image/      BIOS files, the disk in pieces (disk/), the saved state and info.json
#
# Needs Docker, Node 20 or newer, Python 3, squashfs-tools 4.5 or newer and git.
# usage: ./build.sh [site dir]      (default: ../docs/kali-browser64)
#
# The published copy lives on its own GitHub Pages site (the repository
# cyber-labs-kali64), because one Pages site may hold 1 GB and the two machines
# together need more. The workflow in that repository runs this script.
#
# QEMU itself is built by qemu/build-qemu.sh. This script runs it only when
# LAB_QEMU_OUT (default: work/qemu-out) does not hold a build yet.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SITE="${1:-$DIR/../docs/kali-browser64}"
WORK="${LAB_WORK:-$DIR/work}"
QEMU_OUT="${LAB_QEMU_OUT:-$WORK/qemu-out}"
XTERM_VERSION="${XTERM_VERSION:-6.0.0}"
FIT_VERSION="${FIT_VERSION:-0.11.0}"
XTERM_PTY_VERSION="${XTERM_PTY_VERSION:-0.10.1}"    # must match the version in qemu/Dockerfile.wasm
FFLATE_VERSION="${FFLATE_VERSION:-0.8.3}"
IMAGE="${LAB_IMAGE:-lab/kali-q64:latest}"
PACK="$WORK/pack"
mkdir -p "$SITE" "$WORK" "$PACK"
SITE="$(cd "$SITE" && pwd)"

echo "== 1/6 QEMU"
if [ ! -s "$QEMU_OUT/web/qemu-system-x86_64.wasm" ] || [ ! -x "$QEMU_OUT/native/qemu-system-x86_64" ]; then
  LAB_WORK="$WORK" bash "$DIR/qemu/build-qemu.sh" "$QEMU_OUT"
fi
rm -rf "$SITE/qemu" && mkdir -p "$SITE/qemu"
cp "$QEMU_OUT/web/"* "$SITE/qemu/"
# QEMU is built with 28 MB of debug data that only a debugger reads. Leave it
# out of the copy on the site. The page downloads the program itself and
# unpacks it, so keep it packed: 41 MB becomes 3.4 MB on the site.
python3 "$DIR/tools/strip-wasm-debug.py" "$QEMU_OUT/web/qemu-system-x86_64.wasm" "$SITE/qemu/qemu-system-x86_64.wasm"
gzip -9 -f "$SITE/qemu/qemu-system-x86_64.wasm"

echo "== 2/6 terminal files"
rm -rf "$SITE/xterm" "$SITE/xterm-pty" "$SITE/fflate" && mkdir -p "$SITE/xterm" "$SITE/xterm-pty" "$SITE/fflate"
tmp="$(mktemp -d)"
(cd "$tmp" && npm pack --silent "@xterm/xterm@$XTERM_VERSION" "@xterm/addon-fit@$FIT_VERSION" "xterm-pty@$XTERM_PTY_VERSION" "fflate@$FFLATE_VERSION" >/dev/null \
  && mkdir xterm fit pty fflate && tar xzf xterm-xterm-*.tgz -C xterm && tar xzf xterm-addon-fit-*.tgz -C fit \
  && tar xzf xterm-pty-*.tgz -C pty && tar xzf fflate-*.tgz -C fflate)
cp "$tmp/xterm/package/lib/xterm.js" "$tmp/xterm/package/css/xterm.css" "$tmp/fit/package/lib/addon-fit.js" "$SITE/xterm/"
cp "$tmp/xterm/package/LICENSE" "$SITE/xterm/LICENSE-xterm.txt"
cp "$tmp/pty/package/index.js" "$SITE/xterm-pty/"
cp "$tmp/pty/package/LICENSE.txt" "$SITE/xterm-pty/LICENSE-xterm-pty.txt"
cp "$tmp/fflate/package/umd/index.js" "$SITE/fflate/fflate.js"
cp "$tmp/fflate/package/LICENSE" "$SITE/fflate/LICENSE-fflate.txt"
rm -rf "$tmp"

echo "== 3/6 system image"
if [ -z "${LAB_SKIP_DOCKER_BUILD:-}" ]; then
  # Docker Hub sometimes answers 429 (too many requests). Try a few times.
  for attempt in 1 2 3 4; do
    if docker build --platform linux/amd64 --tag "$IMAGE" ${LAB_TOOLS:+--build-arg "LAB_TOOLS=$LAB_TOOLS"} "$DIR"; then break; fi
    [ "$attempt" = 4 ] && { echo "docker build failed"; exit 1; }
    sleep $((attempt * 60))
  done
fi

echo "== 4/6 disk"
# The disk is one squashfs file system, stored without compression: the page
# downloads it in pieces, and each piece is compressed on its own instead.
docker rm -f lab-kali-q64-export >/dev/null 2>&1 || true
docker create --platform linux/amd64 --name lab-kali-q64-export "$IMAGE" >/dev/null
cp "$QEMU_OUT/bios/"*.bin "$PACK/"
docker cp -L lab-kali-q64-export:/boot/lab-vmlinuz "$PACK/vmlinuz"
docker cp -L lab-kali-q64-export:/boot/lab-initrd "$PACK/initrd"
rm -f "$PACK/disk.img"
docker export lab-kali-q64-export | sqfstar -noI -noD -noF -noX -b 128K -quiet -no-progress "$PACK/disk.img" boot .dockerenv
docker rm lab-kali-q64-export >/dev/null
rm -rf "$SITE/image" && mkdir -p "$SITE/image"
python3 "$DIR/tools/make-disk.py" "$PACK/disk.img" "$SITE/image/disk"

echo "== 5/6 boot once, check, and save the state"
rm -f "$WORK/vm.state" "$WORK/facts.json"
python3 "$DIR/make-state.py" "$QEMU_OUT/native/qemu-system-x86_64" "$PACK" "$WORK/vm.state" "$WORK/facts.json"
gzip -9 -c "$WORK/vm.state" > "$SITE/image/vm.state.gz"
rm -f "$WORK/vm.state"

echo "== 6/6 files for the page"
cp "$PACK/"*.bin "$SITE/image/"
# QEMU reads the kernel and the first RAM disk when it starts, even though the
# saved state replaces the memory they were loaded into. The page only needs
# the first part of each file for that, so students download 1 MB, not 25.
head -c 1048576 "$PACK/vmlinuz" > "$SITE/image/vmlinuz"
head -c 4096 "$PACK/initrd" > "$SITE/image/initrd"
python3 - "$SITE" "$WORK/facts.json" "$QEMU_OUT" <<'PY'
import json, sys, os, hashlib, datetime
site, facts_path, qemu_out = sys.argv[1:4]
facts = json.load(open(facts_path))
disk = json.load(open(f"{site}/image/disk/disk.json"))
commit = open(f"{qemu_out}/commit").read().strip()
files = ["bios-256k.bin", "vgabios-stdvga.bin", "kvmvapic.bin", "linuxboot_dma.bin", "vmlinuz", "initrd"]
size = lambda p: os.path.getsize(f"{site}/{p}")
digest = hashlib.sha256()
for path in ["qemu/qemu-system-x86_64.wasm.gz", "image/vm.state.gz"]:
    digest.update(hashlib.sha256(open(f"{site}/{path}", "rb").read()).digest())
digest.update(disk["sha256"].encode())
info = {
    "id": digest.hexdigest()[:16],
    "built": datetime.date.today().isoformat(),
    "system": facts["system"] + " packages, 64-bit",
    "kernel": facts["kernel"],
    "memory_mb": facts["memory_mb"],
    "qemu_version": facts["qemu_version"],
    "qemu_source": "https://github.com/ktock/qemu-wasm/tree/" + commit,
    "qemu_changes": "https://github.com/CUNY-devharsh/cyber-labs/tree/main/browser-vm64/qemu",
    "qemu_args": facts["qemu_args"],
    "ready_text": facts["ready_text"],
    "prompt_text": facts["prompt_text"],
    "files": files,
    "state": "vm.state.gz",
    "state_bytes": size("image/vm.state.gz"),
    "state_raw_bytes": facts["state_raw_bytes"],
    "download_bytes": sum(size("image/" + f) for f in files) + size("image/vm.state.gz") + size("qemu/qemu-system-x86_64.wasm.gz"),
    "disk": {k: disk[k] for k in ("size", "chunk", "count", "empty", "packed_bytes")},
}
json.dump(info, open(f"{site}/image/info.json", "w"), indent=1)
PY
echo "== done"
du -sh "$SITE/image/disk" "$SITE/image/vm.state.gz" "$SITE/qemu" "$SITE" 2>/dev/null || true
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d['disk']['empty']=len(d['disk']['empty']); print(json.dumps(d, indent=1))" "$SITE/image/info.json"
