#!/usr/bin/env node
// Boots the machine once inside v86 under Node, waits until it is fully up,
// runs a few checks, and saves the machine state. The web page restores that
// state, so a student gets a running machine in seconds without a boot.
//
// usage: node build-state.mjs <v86 dir> <fs.json> <image dir> [--no-save]
//   <v86 dir>    holds libv86.mjs, v86.wasm, seabios.bin and vgabios.bin
//   <image dir>  holds flat/ and receives state.bin.zst and info.json

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const [v86Dir, fsJson, imageDir, ...flags] = process.argv.slice(2);
if(!imageDir) { console.error("usage: build-state.mjs <v86 dir> <fs.json> <image dir> [--no-save]"); process.exit(2); }
const SAVE = !flags.includes("--no-save");
const MEMORY_MB = Number(process.env.LAB_MEMORY_MB || 384);
const VGA_MEMORY_MB = 2;
const BOOT_TIMEOUT_S = Number(process.env.LAB_BOOT_TIMEOUT_S || 1500);
export const CMDLINE = "rw root=host9p console=ttyS0 systemd.hostname=kali " +
    "mitigations=off init_on_free=on tsc=reliable nowatchdog loglevel=4 systemd.show_status=1";

const { V86 } = await import(pathToFileURL(path.join(v86Dir, "libv86.mjs")).href);

const emulator = new V86({
    wasm_path: path.join(v86Dir, "v86.wasm"),
    bios: { url: path.join(v86Dir, "seabios.bin") },
    vga_bios: { url: path.join(v86Dir, "vgabios.bin") },
    memory_size: MEMORY_MB * 1024 * 1024,
    vga_memory_size: VGA_MEMORY_MB * 1024 * 1024,
    bzimage_initrd_from_filesystem: true,
    cmdline: CMDLINE,
    filesystem: {
        basefs: { url: fsJson },
        baseurl: path.join(imageDir, "flat") + "/",
    },
    virtio_console: true,
    screen_dummy: true,
    disable_speaker: true,
    autostart: true,
});

const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(0);
let control = "";      // everything printed on ttyS0 (kernel log, then the control shell)
let terminal = "";     // everything printed on hvc0 (the student's terminal)
const decoder = new TextDecoder();

emulator.add_listener("serial0-output-byte", byte => {
    const c = String.fromCharCode(byte);
    control += c;
    if(process.env.LAB_VERBOSE) process.stdout.write(c);
});
emulator.add_listener("virtio-console0-output-bytes", bytes => { terminal += decoder.decode(bytes); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(get, needle, timeoutS, what) {
    const end = Date.now() + timeoutS * 1000;
    while(Date.now() < end) {
        if(get().includes(needle)) return;
        await sleep(250);
    }
    console.error("\n--- last control output ---\n" + control.slice(-3000));
    console.error("\n--- last terminal output ---\n" + terminal.slice(-1500));
    throw new Error("timed out after " + timeoutS + " s waiting for " + what);
}
let seq = 0;
// Runs a command in the root control shell on ttyS0 and returns what it printed.
async function root(cmd, timeoutS = 120) {
    const tag = "LABDONE" + (++seq);
    const from = control.length;
    emulator.serial0_send(cmd + "; echo " + tag + "=$?\n");
    await waitFor(() => control.slice(from), tag + "=", timeoutS, "control command: " + cmd);
    const out = control.slice(from);
    // Drop terminal escape codes so only the command's own text is left.
    return out.slice(0, out.indexOf(tag + "=")).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\r/g, "").trim();
}
// Types into the student's terminal on hvc0 and waits for some text.
async function student(text, expect, timeoutS = 180) {
    const from = terminal.length;
    emulator.bus.send("virtio-console0-input-bytes", new TextEncoder().encode(text));
    if(expect) await waitFor(() => terminal.slice(from), expect, timeoutS, "terminal text: " + expect);
    return terminal.slice(from);
}

try {
    console.log("booting, this takes a few minutes ...");
    await waitFor(() => control, "LAB_CONTROL_READY", BOOT_TIMEOUT_S, "the control shell");
    console.log(`control shell up after ${secs()} s`);
    const kernel = await root("uname -r");
    console.log("kernel:  Linux " + kernel + " " + await root("uname -m"));
    // Wait for boot to finish, then report anything that failed.
    console.log("state:   " + await root("systemctl is-system-running --wait", 900));
    console.log("failed:  " + ((await root("systemctl --failed --no-legend --plain | cut -d' ' -f1 | tr '\\n' ' '")) || "none"));
    const system = await root(". /etc/os-release; echo $PRETTY_NAME $VERSION_ID");
    console.log("system:  " + system + ", " + await root("dpkg --print-architecture"));
    console.log("memory:  " + await root("free -m | awk '/Mem:/{print $2\" MB total, \"$3\" MB used\"}'"));
    console.log("consoles: " + await root("ls /dev/hvc0 /dev/ttyS0 | tr '\\n' ' '"));

    // The student's terminal: wait for the first prompt, then use it like a student would.
    await waitFor(() => terminal, "$", 600, "the kali prompt on hvc0");
    console.log(`kali prompt up after ${secs()} s`);
    const who = await student("echo I am $(whoami) on $(tty)\n", "I am kali on /dev/hvc0");
    console.log("terminal: " + who.split("\n").filter(l => l.startsWith("I am")).pop());
    emulator.bus.send("virtio-console0-resize", [132, 40]);
    await sleep(1500);
    const size = await student("echo size=$(stty size | tr ' ' x)\n", "size=", 120);
    console.log("resize:  " + (size.match(/size=\d+x\d+/) || ["?"])[0] + " (asked for 40x132)");

    if(SAVE) {
        // Warm up the commands students run first, then leave a clean screen.
        await root("su kali -c 'nmap --version; python3 -V; lab-info' >/dev/null 2>&1; true", 600);
        await student("clear\n", null);
        await sleep(3000);
        await root("dmesg -n 1; journalctl --rotate --vacuum-size=1M >/dev/null 2>&1; sync; echo 3 > /proc/sys/vm/drop_caches; true", 300);
        await sleep(4000);
        const state = new Uint8Array(await emulator.save_state());
        const out = path.join(imageDir, "state.bin");
        fs.writeFileSync(out, state);
        execFileSync("zstd", ["-19", "-T0", "-f", "--rm", out, "-o", out + ".zst"], { stdio: "inherit" });
        const packed = fs.readFileSync(out + ".zst");
        console.log(`state:   ${(state.length / 1048576).toFixed(0)} MB raw, ${(packed.length / 1048576).toFixed(1)} MB compressed`);
        // The page reads this file first. The id changes with every build, so
        // a machine saved in the browser is only loaded into the build it came from.
        fs.writeFileSync(path.join(imageDir, "info.json"), JSON.stringify({
            id: createHash("sha256").update(packed).digest("hex").slice(0, 16),
            built: new Date().toISOString().slice(0, 10),
            system: system + " packages, 32-bit",
            kernel: kernel,
            memory_mb: MEMORY_MB,
            vga_memory_mb: VGA_MEMORY_MB,
            state: "state.bin.zst",
            state_bytes: packed.length,
        }, null, 1) + "\n");
    }
    console.log(`done in ${secs()} s`);
    await emulator.destroy();
    process.exit(0);
}
catch(e) {
    console.error("FAILED: " + e.message);
    process.exit(1);
}
