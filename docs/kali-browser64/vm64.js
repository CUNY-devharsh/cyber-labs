/* Kali in this tab, 64-bit. Starts QEMU (compiled to WebAssembly), restores
   the saved machine state and connects the machine's serial console to the
   terminal on the page. */
"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var statusText = $("status-text"), statusDot = $("status-dot"), note = $("note");
  var progress = $("progress"), progressBar = $("progress-bar");
  var buttons = ["btn-save", "btn-send", "btn-get", "btn-full", "btn-reset"].map($);
  var info = null, term = null, fit = null, pty = null, machine = null, disk = null;
  var running = false, dirty = false, shareMount = null;
  var SHARE = "/share", SIZE_FILE = ".size", MAX_SAVE = 256 * 1048576;

  function setStatus(kind, text) {
    statusDot.className = "vm-dot" + (kind ? " " + kind : "");
    statusText.textContent = text;
  }
  function say(text, bad) { note.textContent = text || ""; note.className = "vm-note" + (bad ? " bad" : ""); }
  function fail(text) { running = false; setStatus("failed", text); progress.hidden = true; }
  function megabytes(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB"; }
  function versioned(path) { return path + "?v=" + encodeURIComponent(info.id); }

  /* ---------- the page must be cross-origin isolated ---------- */
  /* QEMU's threads share memory, and browsers allow that only on an isolated
     page. sw.js adds the two headers that ask for it, then the page reloads
     once so the headers apply. */
  function isolate() {
    if (window.crossOriginIsolated) { try { sessionStorage.removeItem("lab64-reloads"); } catch (e) {} return Promise.resolve(true); }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return Promise.resolve(false);
    return navigator.serviceWorker.register("sw.js")
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function () {
        var tries = 0;
        try { tries = Number(sessionStorage.getItem("lab64-reloads") || 0); sessionStorage.setItem("lab64-reloads", String(tries + 1)); } catch (e) { tries = 9; }
        if (tries >= 2) return false;
        location.reload();
        return new Promise(function () {});
      })
      .catch(function () { return false; });
  }

  /* ---------- terminal ---------- */
  function makeTerminal() {
    term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 15, lineHeight: 1.15, cursorBlink: true, scrollback: 5000,
      theme: { background: "#0d1424", foreground: "#e6ebf5", cursor: "#7fb0ff", selectionBackground: "#2f62e8aa" }
    });
    fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open($("terminal"));
    fit.fit();
    pty = openpty();
    term.loadAddon(pty.master);
    term.onData(function () { if (running) dirty = true; });
    /* Ctrl+C copies when text is selected and interrupts otherwise. Ctrl+V pastes. */
    term.attachCustomKeyEventHandler(function (e) {
      if (e.type !== "keydown" || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return true;
      if (e.key === "c" && term.hasSelection()) {
        if (navigator.clipboard) navigator.clipboard.writeText(term.getSelection()).catch(function () {});
        term.clearSelection();
        return false;
      }
      if (e.key === "v") return false;
      return true;
    });
    var pending = 0;
    function refit() {
      clearTimeout(pending);
      pending = setTimeout(function () { fit.fit(); writeSize(); }, 80);
    }
    window.addEventListener("resize", refit);
    document.addEventListener("fullscreenchange", refit);
    if (window.ResizeObserver) new ResizeObserver(refit).observe($("screen"));
  }
  /* The serial line cannot carry the window size, so the page writes it to a
     file in the shared folder. The shell in the machine reads that file each
     time it draws a prompt. */
  function writeSize() {
    if (!machine) return;
    try { machine.FS.writeFile(SHARE + "/" + SIZE_FILE, term.rows + " " + term.cols + "\n"); } catch (e) {}
  }
  function screenText() {
    var buffer = term.buffer.active, lines = [];
    for (var i = 0; i < buffer.length; i++) { var line = buffer.getLine(i); if (line) lines.push(line.translateToString(true)); }
    return lines.join("\n");
  }

  /* ---------- downloads ---------- */
  var received = 0, expected = 0;
  function showProgress() {
    progress.hidden = false;
    progressBar.style.width = (expected ? Math.min(100, 100 * received / expected) : 0) + "%";
    setStatus("", "Downloading the machine: " + megabytes(received) + (expected ? " of " + megabytes(expected) : "") + ".");
  }
  function download(path) {
    return fetch(versioned(path)).then(function (response) {
      if (!response.ok) throw new Error(path + " (HTTP " + response.status + ")");
      if (!response.body || !response.body.getReader) {
        return response.arrayBuffer().then(function (b) { received += b.byteLength; showProgress(); return new Uint8Array(b); });
      }
      var reader = response.body.getReader(), parts = [], size = 0;
      function step() {
        return reader.read().then(function (r) {
          if (r.done) {
            var all = new Uint8Array(size), at = 0;
            parts.forEach(function (p) { all.set(p, at); at += p.length; });
            return all;
          }
          parts.push(r.value); size += r.value.length; received += r.value.length;
          showProgress();
          return step();
        });
      }
      return step();
    });
  }
  /* One retry: a web server sometimes answers a single request with an error. */
  function downloadTwice(path) {
    var before = received;
    return download(path).catch(function () {
      received = before;
      return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(function () { return download(path); });
    });
  }
  function gunzip(bytes) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }

  /* ---------- files kept in this browser (IndexedDB) ---------- */
  function db() {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open("cyber-labs-kali-browser64", 1);
      open.onupgradeneeded = function () { open.result.createObjectStore("labs"); };
      open.onsuccess = function () { resolve(open.result); };
      open.onerror = function () { reject(open.error); };
    });
  }
  function dbDo(mode, work) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction("labs", mode), req = work(tx.objectStore("labs"));
        tx.oncomplete = function () { d.close(); resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { d.close(); reject(tx.error); };
      });
    });
  }
  function readSaved() {
    return dbDo("readonly", function (s) { return s.get("files"); }).catch(function () { return null; });
  }
  /* Everything in the shared folder, as a list of { path, mode, data }. */
  function listShare(dir, out) {
    var FS = machine.FS;
    FS.readdir(dir).forEach(function (name) {
      if (name === "." || name === ".." || (dir === SHARE && name === SIZE_FILE)) return;
      var path = dir + "/" + name, stat = FS.lstat(path);
      if (FS.isDir(stat.mode)) { out.push({ path: path.slice(SHARE.length + 1), mode: stat.mode & 511, dir: true }); listShare(path, out); }
      else if (FS.isFile(stat.mode)) out.push({ path: path.slice(SHARE.length + 1), mode: stat.mode & 511, data: FS.readFile(path) });
    });
    return out;
  }
  function saveFiles() {
    var list;
    try { list = listShare(SHARE, []); } catch (e) { say("The files could not be read: " + e.message + ".", true); return Promise.resolve(); }
    var bytes = list.reduce(function (n, f) { return n + (f.data ? f.data.length : 0); }, 0);
    var count = list.filter(function (f) { return !f.dir; }).length;
    if (bytes > MAX_SAVE) { say("~/labs holds " + megabytes(bytes) + ". The page saves up to " + megabytes(MAX_SAVE) + ". Remove large files and save again.", true); return Promise.resolve(); }
    var record = { saved: Date.now(), bytes: bytes, count: count, files: list.map(function (f) { return f.dir ? f : { path: f.path, mode: f.mode, data: new Blob([f.data]) }; }) };
    return dbDo("readwrite", function (s) { return s.put(record, "files"); })
      .then(function () { dirty = false; say("Saved " + count + (count === 1 ? " file" : " files") + " from ~/labs at " + new Date(record.saved).toLocaleTimeString() + " (" + megabytes(bytes) + " in this browser)."); })
      .catch(function (e) { say("The save failed: " + (e && e.message ? e.message : "not enough browser storage") + ".", true); });
  }
  /* Blobs become bytes before QEMU starts, because its start-up code cannot wait. */
  function loadSaved() {
    return readSaved().then(function (record) {
      if (!record || !record.files) return null;
      return Promise.all(record.files.map(function (f) {
        if (f.dir) return f;
        return f.data.arrayBuffer().then(function (b) { return { path: f.path, mode: f.mode, data: new Uint8Array(b) }; });
      })).then(function (files) { return { saved: record.saved, count: record.count, files: files }; });
    }).catch(function () { return null; });
  }

  /* ---------- the shared folder ---------- */
  /* The machine sees /share as ~/labs. Emscripten's memory file system says
     every file belongs to root, and then the kali user could not change its
     own files. Report kali (1000) as the owner of everything in the folder. */
  function ownShare(FS) {
    FS.mkdir(SHARE);
    FS.mount(FS.lookupPath("/").node.mount.type, {}, SHARE);
    shareMount = FS.lookupPath(SHARE).node.mount;
    FS.writeFile(SHARE + "/" + SIZE_FILE, term.rows + " " + term.cols + "\n");
    var patched = [];
    [FS.lookupPath(SHARE).node, FS.lookupPath(SHARE + "/" + SIZE_FILE).node].forEach(function (node) {
      var ops = node.node_ops;
      if (patched.indexOf(ops) !== -1) return;
      patched.push(ops);
      var getattr = ops.getattr;
      ops.getattr = function (n) {
        var attr = getattr(n);
        if (n.mount === shareMount) { attr.uid = 1000; attr.gid = 1000; }
        return attr;
      };
    });
  }
  function putFile(FS, relative, data, mode) {
    var parts = relative.split("/"), dir = SHARE;
    for (var i = 0; i < parts.length - 1; i++) { dir += "/" + parts[i]; try { FS.mkdir(dir); } catch (e) {} }
    FS.writeFile(SHARE + "/" + relative, data);
    FS.chmod(SHARE + "/" + relative, mode);
  }

  /* ---------- start ---------- */
  function start(isolated) {
    if (!isolated) {
      fail("This browser did not allow the 64-bit machine to start.");
      note.innerHTML = 'Open the page in a normal (not private) window of a current Chrome, Edge, Firefox or Safari, or use the <a href="../kali-browser/">32-bit machine</a>.';
      return;
    }
    var files = {}, saved = null, wasm = null, state = null;
    expected = info.download_bytes || 0;
    showProgress();
    var chain = Promise.resolve();
    info.files.forEach(function (name) {
      chain = chain.then(function () { return downloadTwice("image/" + name); }).then(function (data) { files[name] = data; });
    });
    chain
      .then(function () { return downloadTwice("qemu/qemu-system-x86_64.wasm"); }).then(function (data) { wasm = data; })
      .then(function () { return downloadTwice("image/" + info.state); })
      .then(function (packed) { setStatus("", "Unpacking the machine."); progressBar.style.width = "100%"; return gunzip(packed); })
      .then(function (data) { state = data; return loadSaved(); })
      .then(function (record) { saved = record; return import(new URL(versioned("qemu/out.js"), location.href).href); })
      .then(function (glue) {
        setStatus("", "Starting the machine.");
        disk = new LabDisk("image/disk/", info.disk, info.id, fflate.gunzipSync);
        disk.onError = function () { fail("A part of the machine's disk failed to download. Check your connection and reload the page."); };
        return glue.default({
          arguments: ["-incoming", "file:/pack/vm.state"].concat(info.qemu_args),
          pty: pty.slave,
          wasmBinary: wasm.buffer,
          locateFile: function (path) { return versioned("qemu/" + path); },
          mainScriptUrlOrBlob: new URL(versioned("qemu/out.js"), location.href).href,
          preRun: [function (module) {
            var FS = module.FS;
            FS.mkdir("/pack");
            Object.keys(files).forEach(function (name) { FS.writeFile("/pack/" + name, files[name]); });
            FS.writeFile("/pack/vm.state", state);
            files = state = wasm = null;
            disk.attach(FS, "/pack", "disk.img");
            ownShare(FS);
            if (saved) saved.files.forEach(function (f) {
              try { if (f.dir) { FS.mkdir(SHARE + "/" + f.path); FS.chmod(SHARE + "/" + f.path, f.mode); } else putFile(FS, f.path, f.data, f.mode); } catch (e) {}
            });
          }]
        });
      })
      .then(function (instance) {
        machine = instance;
        /* From the qemu-wasm example page: tell QEMU when the terminal has no input. */
        var poll = instance.TTY.stream_ops.poll, slave = pty.slave;
        instance.TTY.stream_ops.poll = function (stream, timeout) {
          if (!slave.readable) return slave.writable ? 4 : 0;
          return poll.call(stream, timeout);
        };
        return waitForBanner(saved);
      })
      .catch(function (e) {
        if (statusDot.className.indexOf("failed") !== -1) return;
        fail("The machine could not start. Check your connection and reload the page.");
        say(e && e.message ? e.message : String(e), true);
      });
  }
  /* The saved machine waits for one line: the terminal size. The page cannot
     see the moment the machine starts to run, and a line that arrives before
     that is lost. So it sends the line every two seconds until the welcome
     text shows. The machine drops the extra copies. */
  function waitForBanner(saved) {
    return new Promise(function (resolve, reject) {
      var began = Date.now(), sent = 0, welcomed = 0;
      var timer = setInterval(function () {
        var text = screenText(), at = text.indexOf(info.ready_text);
        if (at !== -1) {
          /* The welcome text is there. The machine is ready when the prompt follows it. */
          welcomed = welcomed || Date.now();
          if (text.indexOf(info.prompt_text, at) !== -1 || Date.now() - welcomed > 20000) { clearInterval(timer); resolve(); }
          return;
        }
        if (Date.now() - began > 180000) { clearInterval(timer); reject(new Error("The machine did not answer in three minutes.")); return; }
        /* Wait until QEMU has taken over the terminal (no local echo any more). */
        var raw = false;
        try { raw = (pty.slave.ioctl("TCGETS").lflag & 2) === 0; } catch (e) {}
        if (raw && Date.now() - sent >= 2000) { sent = Date.now(); term.input(term.rows + " " + term.cols + "\r", false); }
      }, 200);
    }).then(function () {
      running = true;
      progress.hidden = true;
      setStatus("running", "Running. Click the terminal and type.");
      buttons.forEach(function (b) { b.disabled = false; });
      if (saved && saved.count) say("Put back " + saved.count + (saved.count === 1 ? " file" : " files") + " you saved on " + new Date(saved.saved).toLocaleString() + " into ~/labs.");
      term.focus();
    });
  }

  /* ---------- files in and out ---------- */
  function sendFiles(fileList) {
    var list = Array.prototype.slice.call(fileList), done = [];
    var next = function () {
      var file = list.shift();
      if (!file) return Promise.resolve();
      if (file.size > 64 * 1048576) { say(file.name + " is larger than 64 MB and was not sent.", true); return next(); }
      var name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "file";
      return file.arrayBuffer().then(function (data) { putFile(machine.FS, name, new Uint8Array(data), 420); done.push(name); return next(); });
    };
    return next().then(function () { if (done.length) { dirty = true; say("Sent to ~/labs: " + done.join(", ") + "."); } })
      .catch(function (e) { say("The file could not be sent: " + e.message + ".", true); });
  }
  function getFile(path) {
    var clean = path.trim().replace(/^~\//, "").replace(/^\/home\/kali\//, "").replace(/^labs\//, "");
    if (!clean || clean.indexOf("..") !== -1 || clean.charAt(0) === "/") { say("Give the name of a file in ~/labs, for example notes.txt.", true); return; }
    var data;
    try { data = machine.FS.readFile(SHARE + "/" + clean); } catch (e) { say("There is no file at ~/labs/" + clean + ". Copy the file into ~/labs first.", true); return; }
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
    link.download = clean.split("/").pop();
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
    say("Downloaded " + clean + " (" + megabytes(data.length) + ").");
  }

  /* ---------- buttons ---------- */
  function confirmFirst(text, action) {
    var dialog = $("confirm");
    $("confirm-text").textContent = text;
    dialog.onclose = function () { if (dialog.returnValue === "ok") action(); };
    dialog.showModal();
  }
  $("btn-save").addEventListener("click", saveFiles);
  $("btn-reset").addEventListener("click", function () {
    confirmFirst("Start over with a fresh machine? Files you saved from ~/labs come back. Everything else is lost.", function () { dirty = false; location.reload(); });
  });
  $("btn-send").addEventListener("click", function () { $("file-input").click(); });
  $("file-input").addEventListener("change", function () { if (this.files.length) sendFiles(this.files); this.value = ""; });
  $("btn-get").addEventListener("click", function () {
    var dialog = $("ask"), input = $("ask-input");
    $("ask-label").textContent = "Which file in ~/labs? Copy the file there first if it is somewhere else.";
    input.value = "";
    dialog.onclose = function () { if (dialog.returnValue === "ok") getFile(input.value); };
    dialog.showModal();
  });
  $("btn-full").addEventListener("click", function () {
    var screen = $("screen");
    if (document.fullscreenElement) document.exitFullscreen(); else if (screen.requestFullscreen) screen.requestFullscreen();
    term.focus();
  });
  window.addEventListener("beforeunload", function (e) { if (running && dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- go ---------- */
  if (!window.WebAssembly || !window.DecompressionStream) { fail("This browser cannot run the machine. Use a current Chrome, Edge, Firefox or Safari."); return; }
  makeTerminal();
  fetch("image/info.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("missing"); return r.json(); })
    .then(function (data) {
      info = data;
      $("fact-system").textContent = info.system + ", on the Kali kernel " + info.kernel + ". The machine has " + info.memory_mb + " MB of memory.";
      $("fact-built").textContent = "Built on " + info.built + ".";
      var source = $("fact-source");
      function link(href, text) {
        var a = document.createElement("a");
        a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = text;
        return a;
      }
      source.textContent = "This build of QEMU " + info.qemu_version + " comes from ";
      source.appendChild(link(info.qemu_source, "this source"));
      source.appendChild(document.createTextNode(" with "));
      source.appendChild(link(info.qemu_changes, "these changes"));
      source.appendChild(document.createTextNode("."));
      return isolate();
    })
    .then(start)
    .catch(function () { fail("The machine image is not on this site yet."); });

  window.labMachine = { pty: function () { return pty; }, terminal: function () { return term; }, isRunning: function () { return running; }, instance: function () { return machine; }, disk: function () { return disk; }, screenText: screenText };
})();
