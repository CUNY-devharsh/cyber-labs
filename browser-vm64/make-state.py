#!/usr/bin/env python3
"""Boots the 64-bit guest once on a native QEMU built from the same source as
the browser build, waits for the prompt, checks the tools and saves the
machine state. The page starts from this state instead of booting.

usage: make-state.py QEMU PACK_DIR STATE_FILE FACTS_JSON
  QEMU        the native qemu-system-x86_64
  PACK_DIR    holds the BIOS files, vmlinuz, initrd and disk.img
  STATE_FILE  where the state is written
  FACTS_JSON  where the facts for the page are written (kernel, QEMU arguments)
"""
import subprocess, sys, time, os, select, re, json, tempfile
qemu, pack_dir, state_path, facts_path = sys.argv[1:5]
MEM = os.environ.get("LAB_MEMORY_MB", "512")
READY = "Kali tools on a real 64-bit Linux kernel"   # the first line lab-start prints
PROMPT = "\u2514\u2500$"                              # the end of Kali's shell prompt
share = tempfile.mkdtemp(prefix="lab64-share-")

def machine(pack, shared):
    """The machine, the same in the build and in the browser. The saved state
    only loads into a QEMU that was started with these exact devices."""
    return ["-nographic", "-m", MEM + "M", "-accel", "tcg,tb-size=500", "-L", pack + "/", "-nic", "none",
            "-drive", f"if=virtio,format=raw,file={pack}/disk.img,readonly=on",
            "-virtfs", f"local,path={shared},mount_tag=labs,security_model=none,id=labs",
            "-kernel", f"{pack}/vmlinuz", "-initrd", f"{pack}/initrd",
            "-append", "console=ttyS0,115200n8 boot=lab64 root=/dev/vda init=/usr/local/sbin/lab-init mitigations=off loglevel=3"]

# The state is saved from a stopped machine (see below). Leave the "stopped"
# out of the file, so the machine starts to run by itself when a tab loads it.
args = [qemu, "-global", "migration.store-global-state=off"] + machine(pack_dir, share)
print("QEMU arguments after the program name:\n  " + " ".join(args[1:]))
p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
os.set_blocking(p.stdout.fileno(), False)
buf = b""; t0 = time.time()
clean = lambda b: re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\\\)|\x1b[=>]|\r", "", b.decode("utf8", "ignore"))
def pump(until, timeout):
    global buf
    t = time.time()
    while time.time() - t < timeout:
        r, _, _ = select.select([p.stdout], [], [], 0.5)
        if r:
            d = p.stdout.read()
            if d: buf += d
        if re.search(until, clean(buf)): return True
        if p.poll() is not None: raise SystemExit("QEMU stopped:\n" + clean(buf)[-800:])
    return False
def send(s): p.stdin.write(s.encode()); p.stdin.flush()
def run(cmd, timeout=300):
    """Runs one command at the prompt and returns what it printed."""
    global buf
    buf = b""; send(" echo LAB_B''EGIN; " + cmd + "; echo LAB_D''ONE $?\n")
    if not pump(r"LAB_DONE \d+", timeout): raise SystemExit("timed out: " + cmd + "\n" + clean(buf)[-600:])
    out = clean(buf).split("LAB_BEGIN\n")[-1].split("LAB_DONE")[0]
    return "\n".join(l for l in out.split("\n") if l.strip())
if not pump(r"└─\$ ?$", 300): raise SystemExit("no prompt:\n" + clean(buf)[-1200:])
print(f"prompt after {time.time() - t0:.0f} s")
time.sleep(3)
facts = {"memory_mb": int(MEM), "qemu_args": machine("/pack", "/share")}
facts["kernel"] = run("uname -r").strip()
facts["system"] = run(". /etc/os-release; echo $PRETTY_NAME").strip()
facts["qemu_version"] = subprocess.run([qemu, "--version"], capture_output=True, text=True).stdout.split("\n")[0].replace("QEMU emulator version ", "").strip()
print("kernel:  " + run("uname -srm"))
print("user:    " + run("id -un"))
print("root:    " + run("grep ' / ' /proc/mounts | cut -d' ' -f1-3"))
checks = {"gdb": "gdb --version | head -1", "strace": "strace -V | head -1", "ltrace": "ltrace -V 2>&1 | head -1",
          "objdump": "objdump --version | head -1", "upx": "upx --version | head -1", "r2": "r2 -v 2>&1 | head -1",
          "gcc": "gcc --version | head -1", "python3": "python3 --version", "yara": "yara --version", "readpe": "readpe --version 2>&1 | head -1"}
for name, cmd in checks.items(): print(f"{name:8} " + run(cmd, 600).strip()[:70])
print("debug:   " + run("printf 'int main(){return 0;}' > /tmp/w.c && gcc -o /tmp/w /tmp/w.c && gdb -q -batch -ex run /tmp/w 2>&1 | grep -c 'exited normally'", 900).strip() + " (1 means gcc and gdb work)")
# The warm Python server started when the machine did. Wait until it has loaded
# its libraries, so they are part of the saved state.
print("python:  " + run("for i in $(seq 600); do [ -S /run/lab-pywarm.sock ] && break; sleep 1; done; "
                        "cut -c1-60 /run/lab-pywarm.log; "
                        "python3 -c 'import sys; print(\"warm start:\", \"pandas\" in sys.modules and \"matplotlib\" in sys.modules)'", 900).strip()[-110:])
# Keep the state small: forget the file cache, then touch only the basics.
# Free memory that still holds old data would land in the state file, so
# fill the free memory with zeros once and release it again.
run("sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'")
free_mb = int(run("awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo").strip().split()[-1])
run(f"sudo sh -c 'mount -o remount,size=95% /dev/shm; dd if=/dev/zero of=/dev/shm/zero bs=1M count={max(free_mb - 24, 1)} 2>/dev/null; sync; rm -f /dev/shm/zero; mount -o remount,size=50% /dev/shm'", 900)
run("sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'")
# Start the tools students use most once more, so the parts of their files
# that a start needs are in memory and the first start in a tab is quicker.
run("ls / >/dev/null; id >/dev/null; cat /etc/hostname >/dev/null; sudo true")
run("gdb -q -batch -ex run /tmp/w >/dev/null 2>&1; objdump -d /tmp/w >/dev/null; strace -o /dev/null /tmp/w; ltrace /tmp/w >/dev/null 2>&1; "
    "readelf -h /tmp/w >/dev/null; strings /tmp/w >/dev/null; file /tmp/w >/dev/null; python3 -c pass; rm -f /tmp/w /tmp/w.c", 900)
print("memory:  " + run("free -m | awk '/Mem:/{print $2\" MB total, \"$3\" MB used, \"$6\" MB cache\"}'"))
run("clear")
time.sleep(1)
# Leave lab-start waiting for the line the page sends when a tab opens.
send(" sudo lab-start\n")
time.sleep(4)
# Stop the machine before saving. A save from a running machine can miss
# memory that changed during the save: one build produced a state whose
# kernel crashed in its timer code as soon as it was loaded.
buf = b""; send("\x01c"); pump(r"\(qemu\)", 30)
buf = b""; send("stop\n"); pump(r"\(qemu\)", 30)
if os.path.exists(state_path): os.unlink(state_path)
buf = b""; send(f"migrate file:{state_path}\n"); pump(r"\(qemu\)", 600)
buf = b""; send("info migrate\n"); pump(r"\(qemu\)", 30)
status = re.search(r"Migration status: (\w+)", clean(buf))
print("migration: " + (status.group(1) if status else clean(buf)[-200:]))
send("quit\n"); time.sleep(1); p.kill(); p.wait()
size = os.path.getsize(state_path)
print(f"state:   {size / 1e6:.1f} MB at {state_path}")
if not status or status.group(1) != "completed": raise SystemExit(1)

# Check the state the way the page uses it: load it into a fresh QEMU, send
# the line the page sends, and wait for the welcome text and a prompt.
p = subprocess.Popen([qemu, "-incoming", "file:" + state_path] + machine(pack_dir, share),
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
os.set_blocking(p.stdout.fileno(), False)
buf = b""; t0 = time.time(); sent = 0; ok = False
while time.time() - t0 < 120:
    r, _, _ = select.select([p.stdout], [], [], 0.3)
    if r:
        d = p.stdout.read()
        if d: buf += d
    text = clean(buf)
    if READY in text:
        if PROMPT in text.split(READY)[-1]: ok = True; break
    elif time.time() - sent > 2:
        sent = time.time(); send("30 100\r")
    if "Kernel panic" in text or p.poll() is not None: break
p.kill()
print(f"load test: {'passed' if ok else 'FAILED'} after {time.time() - t0:.0f} s")
if not ok: raise SystemExit("the saved state does not start:\n" + clean(buf)[-1500:])
facts["state_raw_bytes"] = size
facts["ready_text"] = READY
facts["prompt_text"] = PROMPT
json.dump(facts, open(facts_path, "w"), indent=1)
