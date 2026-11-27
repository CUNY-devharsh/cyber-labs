#!/usr/bin/env bash
# Builds QEMU twice from one source and puts the results in OUT_DIR:
#   web/     QEMU compiled to WebAssembly, for the page (out.js, .wasm, .worker.js)
#   bios/    the BIOS files QEMU loads
#   native/  the same QEMU for this computer. build.sh uses it to boot the
#            machine once and save its state, which the page then starts from.
#
# The source is https://github.com/ktock/qemu-wasm, a version of QEMU that
# compiles the guest's code to WebAssembly, plus the patches in patches/.
# Both builds must come from the same source, or the saved state does not load
# in the browser.
#
# Needs Docker and git. The two build environments take the longest the first
# time. After that a build took 9 minutes on 2 cores.
# usage: ./build-qemu.sh OUT_DIR
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${1:?usage: build-qemu.sh OUT_DIR}"
OUT="$(cd "$1" && pwd)"
WORK="${LAB_WORK:-$DIR/../work}"
QEMU_REPO="${QEMU_REPO:-https://github.com/ktock/qemu-wasm.git}"
QEMU_COMMIT="${QEMU_COMMIT:-0ef7b4e2814b231705d8371dd7997f5b72e70baf}"
SRC="${LAB_QEMU_SRC:-$WORK/qemu-src}"
WASM_ENV="${LAB_WASM_ENV:-lab/qemu-wasm-build}"
NATIVE_ENV="${LAB_NATIVE_ENV:-lab/qemu-native-build}"
JOBS="${LAB_JOBS:-$(nproc)}"
mkdir -p "$WORK" "$OUT/web" "$OUT/bios" "$OUT/native"

echo "== 1/4 QEMU source at $QEMU_COMMIT"
if [ "$(cat "$SRC/.lab-commit" 2>/dev/null || true)" != "$QEMU_COMMIT" ]; then
  mkdir -p "$SRC"
  git -C "$SRC" init --quiet
  git -C "$SRC" remote add origin "$QEMU_REPO" 2>/dev/null || git -C "$SRC" remote set-url origin "$QEMU_REPO"
  git -C "$SRC" fetch --quiet --depth 1 origin "$QEMU_COMMIT"
  git -C "$SRC" checkout --quiet --force FETCH_HEAD
  echo "$QEMU_COMMIT" > "$SRC/.lab-commit"
fi
# Our changes to the source (see patches/). A patch that is in place already is skipped.
for patch in "$DIR"/patches/*.patch; do
  if git -C "$SRC" apply --reverse --check "$patch" 2>/dev/null; then continue; fi
  git -C "$SRC" apply "$patch"
  echo "applied $(basename "$patch")"
done

echo "== 2/4 build environments"
if [ -z "${LAB_SKIP_ENV_BUILD:-}" ]; then
  # Docker Hub sometimes answers 429 (too many requests). Try a few times.
  for attempt in 1 2 3 4; do
    if docker build --tag "$WASM_ENV" --file "$DIR/Dockerfile.wasm" "$DIR" \
      && docker build --tag "$NATIVE_ENV" --file "$DIR/Dockerfile.native" "$DIR"; then break; fi
    [ "$attempt" = 4 ] && { echo "docker build failed"; exit 1; }
    sleep $((attempt * 60))
  done
fi
# QEMU keeps four small libraries outside its own source. Fetch them once.
if [ ! -d "$SRC/subprojects/dtc" ] || [ ! -d "$SRC/subprojects/berkeley-softfloat-3" ]; then
  docker run --rm -v "$SRC":/qemu -w /qemu "$NATIVE_ENV" sh -c \
    "git config --global --add safe.directory '*' && meson subprojects download dtc keycodemapdb berkeley-softfloat-3 berkeley-testfloat-3"
fi

echo "== 3/4 QEMU for the browser"
# The flags are the ones the qemu-wasm project uses, plus the shared folder (virtfs).
WASM_FLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"
docker run --rm -v "$SRC":/qemu:ro -v "$OUT":/out -e WASM_FLAGS="$WASM_FLAGS" -e JOBS="$JOBS" "$WASM_ENV" bash -euc '
  emconfigure /qemu/configure --static --target-list=x86_64-softmmu --cpu=wasm32 --cross-prefix= \
    --without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
    --extra-cflags="$WASM_FLAGS" --extra-cxxflags="$WASM_FLAGS" \
    --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"
  emmake make -j "$JOBS" qemu-system-x86_64
  cp qemu-system-x86_64 /out/web/out.js
  cp qemu-system-x86_64.wasm qemu-system-x86_64.worker.js /out/web/
  cp /qemu/pc-bios/bios-256k.bin /qemu/pc-bios/vgabios-stdvga.bin /qemu/pc-bios/kvmvapic.bin /qemu/pc-bios/linuxboot_dma.bin /out/bios/
  cp /qemu/COPYING /out/web/LICENSE-qemu.txt
  chmod -R a+rX /out/web /out/bios
'
{
  printf 'QEMU for the browser, built from\n%s\ncommit %s\n' "${QEMU_REPO%.git}" "$QEMU_COMMIT"
  printf 'with these patches and the build script from\nhttps://github.com/CUNY-devharsh/cyber-labs/tree/main/browser-vm64/qemu\n'
  for patch in "$DIR"/patches/*.patch; do printf '  %s\n' "$(basename "$patch")"; done
} > "$OUT/web/SOURCE.txt"

echo "== 4/4 QEMU for this computer"
docker run --rm -v "$SRC":/qemu:ro -v "$OUT":/out -e JOBS="$JOBS" "$NATIVE_ENV" bash -euc '
  /qemu/configure --static --target-list=x86_64-softmmu --cross-prefix= \
    --without-default-features --enable-system --with-coroutine=ucontext --enable-virtfs --enable-attr
  make -j "$JOBS" qemu-system-x86_64
  cp qemu-system-x86_64 /out/native/
  chmod -R a+rX /out/native
'
echo "$QEMU_COMMIT" > "$OUT/commit"
echo "== done"
ls -la "$OUT/web" "$OUT/bios" "$OUT/native"
