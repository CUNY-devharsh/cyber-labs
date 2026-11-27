#!/usr/bin/env python3
"""Turns a root file system tar (from docker export) into the two things v86
needs to serve it over HTTP: an index (fs.json) and a folder of files named by
their SHA-256 hash and compressed with Zstandard (flat/).

It does the same job as v86's copy-to-sha256.py, with the same file names, but
compresses on all CPU cores. The index comes from v86's own fs2json.py.

usage: pack-rootfs.py rootfs.tar out_dir
"""
import concurrent.futures, hashlib, os, subprocess, sys, tarfile
import zstandard

HASH_LENGTH = 10                     # keep in sync with fs2json.py
LEVEL = int(os.environ.get("LAB_ZSTD_LEVEL", "19"))

def compress(job):
    name, data, out_dir = job
    path = os.path.join(out_dir, name)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(zstandard.ZstdCompressor(level=LEVEL).compress(data))
    os.replace(tmp, path)
    return len(data), os.path.getsize(path)

def main():
    tar_path, out_dir = sys.argv[1], sys.argv[2]
    flat = os.path.join(out_dir, "flat")
    os.makedirs(flat, exist_ok=True)
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, os.path.join(here, "fs2json.py"), "--zstd",
                    "--out", os.path.join(out_dir, "fs.json"), tar_path],
                   check=True, stderr=subprocess.DEVNULL)
    seen, raw, packed, pending = set(), 0, 0, []
    with tarfile.open(tar_path, "r") as tar, \
         concurrent.futures.ProcessPoolExecutor() as pool:
        def drain(limit):
            nonlocal raw, packed, pending
            while len(pending) > limit:
                r, p = pending.pop(0).result()
                raw += r; packed += p
        for member in tar:
            if not (member.isfile() or member.islnk()):
                continue
            data = tar.extractfile(member).read()
            name = hashlib.sha256(data).hexdigest()[:HASH_LENGTH] + ".bin.zst"
            if name in seen:
                continue
            seen.add(name)
            pending.append(pool.submit(compress, (name, data, flat)))
            drain(64)
        drain(0)
    print(f"packed {len(seen)} files: {raw / 1048576:.0f} MB -> {packed / 1048576:.0f} MB (zstd level {LEVEL})")

if __name__ == "__main__":
    main()
