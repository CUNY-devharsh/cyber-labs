/* Kali in this tab. Starts the v86 emulator, restores the saved machine state,
   and connects the machine's console to the terminal on the page. */
"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var statusText = $("status-text"), statusDot = $("status-dot"), note = $("note");
  var progress = $("progress"), progressBar = $("progress-bar");
  var buttons = ["btn-save", "btn-load", "btn-send", "btn-get", "btn-full", "btn-reset"].map($);
  var encoder = new TextEncoder();
  var emulator = null, info = null, term = null, fit = null;
  var running = false, dirty = false;

  function setStatus(kind, text) {
    statusDot.className = "vm-dot" + (kind ? " " + kind : "");
    statusText.textContent = text;
  }
  function say(text, bad) { note.textContent = text || ""; note.className = "vm-note" + (bad ? " bad" : ""); }
  function fail(text) { running = false; setStatus("failed", text); progress.hidden = true; }
  function megabytes(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB"; }

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
    term.onData(function (text) { dirty = true; typeToMachine(text); });
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
      pending = setTimeout(function () { fit.fit(); sendSize(); }, 80);
    }
    window.addEventListener("resize", refit);
    document.addEventListener("fullscreenchange", refit);
    if (window.ResizeObserver) new ResizeObserver(refit).observe($("screen"));
  }
  function sendSize() {
    if (emulator && running) emulator.bus.send("virtio-console0-resize", [term.cols, term.rows]);
  }

  /* Keys and pasted text go to the machine in small pieces, because the
     machine's console drops input that arrives faster than it reads. */
  var queue = [], pumping = false;
  function typeToMachine(text) {
    if (!emulator || !running) return;
    var bytes = encoder.encode(text);
    for (var i = 0; i < bytes.length; i += 32) queue.push(bytes.subarray(i, i + 32));
    if (!pumping) { pumping = true; pump(); }
  }
  function pump() {
    var piece = queue.shift();
    if (!piece) { pumping = false; return; }
    emulator.bus.send("virtio-console0-input-bytes", piece);
    setTimeout(pump, queue.length ? 14 : 0);
  }

  /* ---------- control line (ttyS0): a hidden root shell ---------- */
  var waiters = [], sequence = 0;
  function onControlByte(byte) {
    if (!waiters.length) return;
    var c = String.fromCharCode(byte);
    for (var i = waiters.length - 1; i >= 0; i--) {
      var w = waiters[i];
      w.text += c;
      var at = w.text.indexOf(w.tag + "=");
      if (at !== -1 && /=\d+\s/.test(w.text.slice(at + w.tag.length))) {
        waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve({ out: w.text.slice(0, at).trim(), code: parseInt(w.text.slice(at + w.tag.length + 1), 10) });
      }
    }
  }
  function control(command, seconds) {
    return new Promise(function (resolve, reject) {
      var w = { tag: "LABDONE" + (++sequence) + "Z", text: "", resolve: resolve };
      w.timer = setTimeout(function () {
        waiters.splice(waiters.indexOf(w), 1);
        reject(new Error("The machine did not answer."));
      }, (seconds || 20) * 1000);
      waiters.push(w);
      emulator.serial0_send(command + "; echo " + w.tag + "=$?\n");
    });
  }

  /* ---------- start ---------- */
  function start() {
    emulator = new V86({
      wasm_path: "v86/v86.wasm",
      bios: { url: "v86/seabios.bin" },
      vga_bios: { url: "v86/vgabios.bin" },
      memory_size: info.memory_mb * 1048576,
      vga_memory_size: info.vga_memory_mb * 1048576,
      filesystem: { baseurl: "image/flat/" },
      initial_state: { url: "image/" + info.state },
      virtio_console: true,
      screen_dummy: true,
      disable_speaker: true,
      autostart: true
    });
    emulator.add_listener("download-progress", function (e) {
      if (!e.file_name || e.file_name.indexOf(info.state) === -1) return;
      progress.hidden = false;
      var total = e.total || info.state_bytes;
      if (total) progressBar.style.width = Math.min(100, 100 * e.loaded / total) + "%";
      setStatus("", "Downloading the machine: " + megabytes(e.loaded) + (total ? " of " + megabytes(total) : "") + ".");
    });
    emulator.add_listener("download-error", function () {
      fail("A file failed to download. Check your connection and reload the page.");
    });
    emulator.add_listener("emulator-loaded", function () {
      progressBar.style.width = "100%";
      if (!running) setStatus("", "Starting the machine.");
    });
    emulator.add_listener("serial0-output-byte", onControlByte);
    emulator.add_listener("virtio-console0-output-bytes", function (bytes) { term.write(bytes); });
    emulator.add_listener("emulator-started", function () { if (!running) afterStart(true); });
  }

  /* Runs after a fresh start and after a saved machine is loaded. */
  function afterStart(fresh) {
    running = true;
    progress.hidden = true;
    setStatus("running", "Running. Click the terminal and type.");
    buttons.forEach(function (b) { if (b.id !== "btn-load") b.disabled = false; });
    term.reset();
    if (fresh) {
      term.writeln("\x1b[1mKali tools on a real Linux kernel, running inside this browser tab\x1b[0m");
      term.writeln("  lab-info      show what this machine is and what is installed");
      term.writeln("  lab-targets   start practice targets on this machine (web and SSH)");
      term.writeln("  This machine has no internet. Press Save machine before you close the tab.");
      term.writeln("");
    }
    fit.fit();
    sendSize();
    /* A restored machine still has the clock of the moment it was saved. */
    control("date -s @" + Math.floor(Date.now() / 1000) + " >/dev/null").catch(function () {});
    /* The new size makes the shell draw its prompt. If the size happened to be
       the same as before, nothing is drawn, so press Enter for the student. */
    setTimeout(function () {
      var buffer = term.buffer.active, line = buffer.getLine(buffer.baseY + buffer.cursorY);
      if (!line || !line.translateToString(true).trim()) typeToMachine("\r");
      term.focus();
    }, 900);
    refreshSaved();
  }

  /* ---------- save and load in this browser (IndexedDB) ---------- */
  function db() {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open("cyber-labs-kali-browser", 1);
      open.onupgradeneeded = function () { open.result.createObjectStore("machines"); };
      open.onsuccess = function () { resolve(open.result); };
      open.onerror = function () { reject(open.error); };
    });
  }
  function dbDo(mode, work) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction("machines", mode), req = work(tx.objectStore("machines"));
        tx.oncomplete = function () { d.close(); resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { d.close(); reject(tx.error); };
      });
    });
  }
  function squeeze(buffer, Stream) {
    if (!window[Stream]) return Promise.resolve(new Blob([buffer]));
    return new Response(new Blob([buffer]).stream().pipeThrough(new window[Stream]("gzip"))).blob();
  }
  function refreshSaved() {
    return dbDo("readonly", function (s) { return s.get("meta"); }).then(function (meta) {
      var usable = meta && meta.image === info.id;
      $("btn-load").disabled = !(usable && running);
      if (usable && !note.textContent) say("You have a saved machine from " + new Date(meta.saved).toLocaleString() + ".");
      if (meta && !usable) say("Your saved machine was made with an older version of this page and cannot be loaded.");
      return meta;
    }).catch(function () {});
  }
  function saveMachine() {
    var before = statusText.textContent;
    setStatus("", "Saving the machine.");
    return control("sync").catch(function () {}).then(function () { return emulator.save_state(); })
      .then(function (state) { return squeeze(state, "CompressionStream"); })
      .then(function (blob) {
        var meta = { image: info.id, saved: Date.now(), bytes: blob.size, packed: !!window.CompressionStream };
        return dbDo("readwrite", function (s) { s.put(blob, "state"); return s.put(meta, "meta"); }).then(function () { return meta; });
      })
      .then(function (meta) {
        dirty = false;
        setStatus("running", before);
        say("Saved at " + new Date(meta.saved).toLocaleTimeString() + " (" + megabytes(meta.bytes) + " in this browser).");
        $("btn-load").disabled = false;
      })
      .catch(function (e) { setStatus("running", before); say("The save failed: " + (e && e.message ? e.message : "not enough browser storage") + ".", true); });
  }
  function loadMachine() {
    setStatus("", "Loading your saved machine.");
    var meta;
    return dbDo("readonly", function (s) { return s.get("meta"); })
      .then(function (m) { meta = m; return dbDo("readonly", function (s) { return s.get("state"); }); })
      .then(function (blob) {
        if (!blob || !meta || meta.image !== info.id) throw new Error("there is no saved machine for this version");
        return meta.packed ? new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : blob.arrayBuffer();
      })
      .then(function (buffer) { running = false; return emulator.stop().then(function () { return emulator.restore_state(buffer); }); })
      .then(function () { return emulator.run(); })
      .then(function () { dirty = false; afterStart(false); say("Loaded the machine you saved on " + new Date(meta.saved).toLocaleString() + "."); })
      .catch(function (e) { setStatus(running ? "running" : "failed", running ? "Running." : "The saved machine could not be loaded. Reload the page."); say("Loading failed: " + e.message + ".", true); });
  }

  /* ---------- files in and out ---------- */
  function sendFiles(files) {
    var list = Array.prototype.slice.call(files), done = [];
    var next = function () {
      var file = list.shift();
      if (!file) return Promise.resolve();
      if (file.size > 64 * 1048576) { say(file.name + " is larger than 64 MB and was not sent.", true); return next(); }
      var name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "file";
      return file.arrayBuffer()
        .then(function (data) { return emulator.create_file("/home/kali/labs/" + name, new Uint8Array(data)); })
        .then(function () { return control("chown kali:kali '/home/kali/labs/" + name + "'"); })
        .then(function () { done.push(name); return next(); });
    };
    return next().then(function () { if (done.length) { dirty = true; say("Sent to ~/labs: " + done.join(", ") + "."); } })
      .catch(function (e) { say("The file could not be sent: " + e.message + ".", true); });
  }
  function getFile(path) {
    var clean = path.trim().replace(/^~\//, "").replace(/^\/home\/kali\//, "");
    if (!clean || clean.indexOf("..") !== -1 || clean.charAt(0) === "/") { say("Give a path inside your home folder, for example labs/notes.txt.", true); return; }
    return control("sync").catch(function () {}).then(function () { return emulator.read_file("/home/kali/" + clean); })
      .then(function (data) {
        var link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([data]));
        link.download = clean.split("/").pop();
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
        say("Downloaded " + clean + " (" + megabytes(data.length) + ").");
      })
      .catch(function () { say("There is no file at ~/" + clean + ".", true); });
  }

  /* ---------- buttons ---------- */
  function confirmFirst(text, action) {
    var dialog = $("confirm");
    $("confirm-text").textContent = text;
    dialog.onclose = function () { if (dialog.returnValue === "ok") action(); };
    dialog.showModal();
  }
  $("btn-save").addEventListener("click", saveMachine);
  $("btn-load").addEventListener("click", function () {
    confirmFirst("Load your saved machine? What is on the screen now will be replaced.", loadMachine);
  });
  $("btn-reset").addEventListener("click", function () {
    confirmFirst("Start over with a fresh machine? Anything you have not saved is lost. Your saved machine is kept.", function () { dirty = false; location.reload(); });
  });
  $("btn-send").addEventListener("click", function () { $("file-input").click(); });
  $("file-input").addEventListener("change", function () { if (this.files.length) sendFiles(this.files); this.value = ""; });
  $("btn-get").addEventListener("click", function () {
    var dialog = $("ask"), input = $("ask-input");
    $("ask-label").textContent = "Which file in your home folder? Run sync first if you just wrote it.";
    input.value = "labs/";
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
  if (!window.WebAssembly) { fail("This browser cannot run the machine. Use a current Chrome, Edge, Firefox or Safari."); return; }
  makeTerminal();
  fetch("image/info.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("missing"); return r.json(); })
    .then(function (data) {
      info = data;
      $("fact-system").textContent = info.system + ", on Linux " + info.kernel + " (the 32-bit long-term kernel from Debian).";
      $("fact-built").textContent = "Built on " + info.built + ".";
      start();
    })
    .catch(function () { fail("The machine image is not on this site yet."); });

  window.labMachine = { control: control, type: typeToMachine, terminal: function () { return term; }, isRunning: function () { return running; }, emulator: function () { return emulator; } };
})();
