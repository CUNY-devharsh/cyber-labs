#!/usr/bin/env python3
"""Cuts a disk image into small compressed pieces for the 64-bit browser machine.

The page does not download the whole disk. It asks for a piece only when the
machine reads that part of the disk (see docs/kali-browser64/lab-disk.js).

  make-disk.py DISK.img OUT_DIR

writes OUT_DIR/c000000.gz, c000001.gz, ... (one per megabyte of the image,
pieces that are all zeros are skipped) and OUT_DIR/disk.json, the index.
"""
import concurrent.futures, gzip, hashlib, json, os, sys

CHUNK = 1024 * 1024


def pack(args):
    path, out_dir, index = args
    with open(path, "rb") as f:
        f.seek(index * CHUNK)
        data = f.read(CHUNK)
    if not data.strip(b"\0"):
        return index, 0
    blob = gzip.compress(data, compresslevel=9, mtime=0)
    with open(os.path.join(out_dir, "c%06d.gz" % index), "wb") as f:
        f.write(blob)
    return index, len(blob)


def main():
    image, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    size = os.path.getsize(image)
    count = (size + CHUNK - 1) // CHUNK
    digest = hashlib.sha256()
    with open(image, "rb") as f:
        for block in iter(lambda: f.read(8 * CHUNK), b""):
            digest.update(block)
    with concurrent.futures.ProcessPoolExecutor() as pool:
        sizes = dict(pool.map(pack, ((image, out_dir, i) for i in range(count)), chunksize=16))
    empty = [i for i in range(count) if sizes[i] == 0]
    packed = sum(sizes.values())
    index = {"size": size, "chunk": CHUNK, "count": count, "empty": empty,
             "sha256": digest.hexdigest(), "packed_bytes": packed}
    with open(os.path.join(out_dir, "disk.json"), "w") as f:
        json.dump(index, f)
    print("disk: %.0f MB in %d pieces, %.0f MB compressed, %d empty" %
          (size / 1e6, count, packed / 1e6, len(empty)))


if __name__ == "__main__":
    main()
