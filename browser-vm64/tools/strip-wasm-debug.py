#!/usr/bin/env python3
"""Removes the debugging sections from a WebAssembly file.

QEMU is built with -g, so its file carries about 28 MB of DWARF data that only
a debugger reads. A browser downloads the whole file before it starts, so this
cuts the first download. The "name" section stays: it gives each function its
name in an error message.

usage: strip-wasm-debug.py IN.wasm OUT.wasm
"""
import sys


def number(data, at):
    """An unsigned LEB128 number and the position after it."""
    value = shift = 0
    while True:
        byte = data[at]
        at += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return value, at


def main():
    data = open(sys.argv[1], "rb").read()
    if data[:8] != b"\0asm\x01\0\0\0":
        raise SystemExit("not a WebAssembly file: " + sys.argv[1])
    out = bytearray(data[:8])
    at, dropped = 8, 0
    while at < len(data):
        start = at
        kind = data[at]
        size, body = number(data, at + 1)
        at = body + size
        if kind == 0:                              # a custom section starts with its name
            length, text = number(data, body)
            if data[text:text + length].startswith(b".debug_"):
                dropped += at - start
                continue
        out += data[start:at]
    open(sys.argv[2], "wb").write(out)
    print("%s: %.1f MB -> %.1f MB (%.1f MB of debug data removed)" % (
        sys.argv[2], len(data) / 1e6, len(out) / 1e6, dropped / 1e6))


if __name__ == "__main__":
    main()
