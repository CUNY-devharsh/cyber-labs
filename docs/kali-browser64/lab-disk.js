/* A read-only disk for QEMU in the browser that downloads itself in pieces.
 *
 * The disk image is cut into one-megabyte pieces by browser-vm64/tools/
 * make-disk.py. QEMU sees one ordinary file. When it reads a part of the file
 * that is not here yet, this code fetches that piece, unpacks it and hands
 * the bytes over. Pieces that follow are fetched in the background.
 *
 * QEMU's file reads run on the page's main thread and must return at once,
 * so a missing piece is fetched with a synchronous request. That is the one
 * place where the page waits for the network.
 */
(function () {
  "use strict";

  function LabDisk(baseUrl, meta, version, gunzipSync) {
    this.baseUrl = baseUrl;
    this.meta = meta;
    this.version = version;
    this.gunzipSync = gunzipSync;
    this.empty = new Set(meta.empty);
    this.cache = new Map();      /* piece number -> Uint8Array */
    this.pending = new Map();    /* piece number -> AbortController of its background request */
    this.maxPending = 2;         /* background requests at a time, so that a request the
                                    machine waits for always finds a free connection */
    this.maxCached = 320;        /* about 320 MB of unpacked pieces */
    this.zero = new Uint8Array(meta.chunk);
    this.stats = { waited: 0, background: 0, bytes: 0, waitMs: 0, collisions: 0, failed: 0 };
    this.onActivity = null;
    this.onError = null;
  }

  LabDisk.prototype.url = function (i) {
    return this.baseUrl + "c" + String(i).padStart(6, "0") + ".gz?v=" + this.version;
  };

  LabDisk.prototype.remember = function (i, data) {
    this.cache.delete(i);
    this.cache.set(i, data);
    if (this.cache.size > this.maxCached) {
      this.cache.delete(this.cache.keys().next().value);
    }
  };

  /* Fetch one piece and wait for it. A web server sometimes answers one
     request with an error, so try a few times before giving up: a failed
     read here reaches the machine as a broken disk. */
  LabDisk.prototype.fetchNow = function (i) {
    var started = performance.now(), packed = null, status = 0;
    /* A background request for this piece may be under way. It cannot finish
       while this thread waits here, and the browser makes a second request
       for the same address wait for the first. The two then wait for each
       other and the machine stops for good, with no error. So when the piece
       is on its way, stop that request and ask under another address. Where
       the browser allows it (in a worker), also give up on one answer after
       20 seconds and ask again. */
    var other = "";
    if (this.pending.has(i)) {
      other = "&now=1";
      this.stats.collisions++;
      try { this.pending.get(i).abort(); } catch (e) { /* it ends on its own later */ }
    }
    for (var attempt = 0; attempt < 5 && !packed; attempt++) {
      if (attempt) {
        var until = performance.now() + 400 * attempt;
        while (performance.now() < until) { /* wait without giving up the thread */ }
      }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", this.url(i) + other + (attempt ? "&try=" + attempt : ""), false);
        try { xhr.timeout = 20000; } catch (e) { /* a page's main thread may not set it */ }
        xhr.overrideMimeType("text/plain; charset=x-user-defined");
        xhr.send();
        status = xhr.status;
        if (status === 200) {
          var text = xhr.responseText;
          packed = new Uint8Array(text.length);
          for (var k = 0; k < text.length; k++) { packed[k] = text.charCodeAt(k) & 0xff; }
        }
      } catch (e) { status = 0; this.stats.failed++; }
    }
    if (!packed) {
      if (this.onError) { this.onError(i, status); }
      throw new Error("disk piece " + i + ": HTTP " + status);
    }
    var data = this.gunzipSync(packed);
    this.stats.waited++;
    this.stats.bytes += packed.length;
    this.stats.waitMs += performance.now() - started;
    if (this.onActivity) { this.onActivity(this.stats); }
    return data;
  };

  /* Fetch one piece without waiting, so it is ready when QEMU asks. */
  LabDisk.prototype.fetchLater = function (i) {
    var self = this;
    if (i >= this.meta.count || this.empty.has(i) || this.cache.has(i) || this.pending.has(i)) { return; }
    if (this.pending.size >= this.maxPending) { return; }
    var stop = new AbortController();
    this.pending.set(i, stop);
    fetch(this.url(i), { signal: stop.signal }).then(function (res) {
      if (!res.ok) { throw new Error("HTTP " + res.status); }
      self.stats.bytes += Number(res.headers.get("content-length") || 0);
      return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }).then(function (buf) {
      self.remember(i, new Uint8Array(buf));
      self.stats.background++;
    }).catch(function () { /* QEMU will ask again and wait for it */ }).then(function () {
      if (self.pending.get(i) === stop) { self.pending.delete(i); }
    });
  };

  LabDisk.prototype.piece = function (i) {
    if (this.empty.has(i)) { return this.zero; }
    var data = this.cache.get(i);
    if (!data) {
      data = this.fetchNow(i);
      this.remember(i, data);
    }
    this.fetchLater(i + 1);
    this.fetchLater(i + 2);
    return data;
  };

  /* Copy length bytes starting at position into buffer at offset. */
  LabDisk.prototype.read = function (buffer, offset, length, position) {
    var size = this.meta.size, chunk = this.meta.chunk;
    if (position >= size) { return 0; }
    var end = Math.min(position + length, size), done = 0;
    while (position < end) {
      var i = Math.floor(position / chunk), within = position - i * chunk;
      var n = Math.min(chunk - within, end - position);
      buffer.set(this.piece(i).subarray(within, within + n), offset + done);
      position += n;
      done += n;
    }
    return done;
  };

  /* Put the disk into QEMU's file system as one read-only file. */
  LabDisk.prototype.attach = function (FS, dir, name) {
    var self = this;
    var node = FS.createFile(dir, name, {}, true, false);
    node.contents = null;
    Object.defineProperty(node, "usedBytes", { get: function () { return self.meta.size; } });
    var ops = {};
    Object.keys(node.stream_ops).forEach(function (key) { ops[key] = node.stream_ops[key]; });
    ops.read = function (stream, buffer, offset, length, position) {
      return self.read(buffer, offset, length, position);
    };
    ops.write = function () { throw new FS.ErrnoError(30); };  /* read-only file system */
    ops.mmap = function () { throw new FS.ErrnoError(19); };
    node.stream_ops = ops;
    return node;
  };

  window.LabDisk = LabDisk;
}());
