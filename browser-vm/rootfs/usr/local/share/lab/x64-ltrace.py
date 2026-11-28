# ltrace for x86-64 programs on the 32-bit lab machine. /usr/local/bin/ltrace
# starts gdb with this file.
#
# The program runs in the lab runner (qemu-x86_64) with its debugger port open.
# This script puts a breakpoint on every entry of the program's procedure
# linkage table, which is where a call to a shared library leaves the program.
# At each one it reads the arguments from the registers, and at the return
# address it reads the result. The output follows ltrace's layout.
import os
import re
import socket
import struct
import subprocess
import sys
import time

import gdb

RUNNER = "/usr/local/bin/qemu-x86_64"
PROG = os.environ["LAB_LT_PROG"]
ARGS = os.environ.get("LAB_LT_ARGS", "")
ONLY = set(filter(None, re.split(r"[+,]", os.environ.get("LAB_LT_ONLY", ""))))
SIZE = int(os.environ.get("LAB_LT_SIZE") or 32)
# The trace goes straight to the file or to standard error, not through gdb's
# own output, which this script turns off (see main).
OUT = open(os.environ["LAB_LT_OUT"], "w") if os.environ.get("LAB_LT_OUT") else os.fdopen(os.dup(2), "w")

# Argument kinds: s string, i signed number, u unsigned, p pointer, c character.
# A trailing "." means more arguments follow that are not shown.
CALLS = {
    "puts": "s", "printf": "s.", "fprintf": "ps.", "sprintf": "ps.", "snprintf": "pus.",
    "putchar": "c", "fputs": "sp", "fputc": "cp", "perror": "s", "getenv": "s",
    "setenv": "ssi", "strcmp": "ss", "strncmp": "ssu", "strcasecmp": "ss", "memcmp": "ppu",
    "strlen": "s", "strcpy": "ps", "strncpy": "psu", "strcat": "ss", "strncat": "ssu",
    "strchr": "sc", "strrchr": "sc", "strstr": "ss", "strdup": "s", "strcspn": "ss",
    "strspn": "ss", "strtok": "ss", "memcpy": "ppu", "memmove": "ppu", "memset": "piu",
    "atoi": "s", "atol": "s", "strtol": "spi", "strtoul": "spi", "malloc": "u",
    "calloc": "uu", "realloc": "pu", "free": "p", "fopen": "ss", "fclose": "p",
    "fgets": "pip", "fread": "puup", "fwrite": "puup", "fflush": "p", "getchar": "",
    "gets": "p", "scanf": "s.", "__isoc99_scanf": "s.", "sscanf": "ss.",
    "__isoc99_sscanf": "ss.", "open": "si", "close": "i", "read": "ipu", "write": "ipu",
    "exit": "i", "_exit": "i", "abort": "", "sleep": "u", "usleep": "u", "time": "p",
    "srand": "u", "rand": "", "getpid": "", "getppid": "", "getuid": "", "geteuid": "",
    "ptrace": "iipp", "system": "s", "signal": "ip", "alarm": "u", "setvbuf": "ppiu",
    "isatty": "i", "access": "si", "unlink": "s", "remove": "s", "fork": "", "wait": "p",
    "execve": "spp", "execl": "ss.", "dlopen": "si", "dlsym": "ps", "toupper": "c",
    "tolower": "c", "isdigit": "c", "isalpha": "c", "abs": "i",
}
RETURNS_STRING = {"getenv", "strcpy", "strncpy", "strcat", "strncat", "strchr", "strrchr",
                  "strstr", "strdup", "strtok", "fgets", "gets"}
RETURNS_POINTER = {"malloc", "calloc", "realloc", "fopen", "memcpy", "memmove", "memset",
                   "signal", "dlopen", "dlsym"}
RETURNS_NOTHING = {"free", "srand", "perror", "exit", "_exit", "abort"}
NO_RETURN = {"exit", "_exit", "abort", "execve", "execl"}
SKIP = {"__cxa_finalize", "__gmon_start__", "__stack_chk_fail", "_ITM_deregisterTMCloneTable",
        "_ITM_registerTMCloneTable"}
REGS = ("rdi", "rsi", "rdx", "rcx", "r8", "r9")
pending = {}


def say(text):
    OUT.write(text + "\n")
    OUT.flush()


def reg(name):
    return int(gdb.parse_and_eval("$" + name)) & 0xFFFFFFFFFFFFFFFF


def signed(value, bits=32):
    value &= (1 << bits) - 1
    return value - (1 << bits) if value >> (bits - 1) else value


def text_at(address):
    if address == 0:
        return "nil"
    try:
        data = bytes(gdb.selected_inferior().read_memory(address, SIZE + 1))
    except gdb.MemoryError:
        return hex(address)
    end = data.find(b"\0")
    cut = end < 0
    data = data[:SIZE] if cut else data[:end]
    shown = "".join(chr(b) if 32 <= b < 127 and b not in (34, 92) else
                    {10: "\\n", 9: "\\t", 13: "\\r", 34: '\\"', 92: "\\\\"}.get(b, "\\%03o" % b)
                    for b in data)
    return '"%s"%s' % (shown, "..." if cut else "")


def show(kind, value):
    if kind == "s":
        return text_at(value)
    if kind == "i":
        return str(signed(value))
    if kind == "u":
        return str(value)
    if kind == "c":
        return "'%s'" % chr(value & 0xFF) if 32 <= (value & 0xFF) < 127 else str(signed(value))
    return "nil" if value == 0 else hex(value)


def call_text(name):
    kinds = CALLS.get(name)
    if kinds is None:
        return "%s(%s)" % (name, ", ".join(show("p", reg(r)) for r in REGS[:4]))
    more = kinds.endswith(".")
    shown = [show(kind, reg(REGS[n])) for n, kind in enumerate(kinds.rstrip("."))]
    return "%s(%s%s)" % (name, ", ".join(shown), ", ..." if more and shown else "")


def result_text(name, value):
    if name in RETURNS_NOTHING:
        return "<void>"
    if name in RETURNS_STRING:
        return text_at(value)
    if name in RETURNS_POINTER:
        return show("p", value)
    return str(signed(value))


class Return(gdb.Breakpoint):
    def stop(self):
        waiting = pending.get(self.address)
        if waiting:
            name, text = waiting.pop()
            say("%-48s = %s" % (text, result_text(name, reg("rax"))))
        return False


class Call(gdb.Breakpoint):
    def stop(self):
        text = call_text(self.name)
        if self.name in NO_RETURN:
            say("%s <no return ...>" % text)
            return False
        back = struct.unpack("<Q", bytes(gdb.selected_inferior().read_memory(reg("rsp"), 8)))[0]
        if back not in pending:
            pending[back] = []
            point = Return("*0x%x" % back, internal=True)
            point.silent = True
            point.address = back
        pending[back].append((self.name, text))
        return False


def plt_entries():
    """Name and file address of each procedure linkage table entry."""
    found = {}
    listing = subprocess.run(["objdump", "-d", "-j", ".plt", "-j", ".plt.sec", "-j", ".plt.got", PROG],
                             capture_output=True, text=True).stdout
    for match in re.finditer(r"^([0-9a-f]+) <([^>@]+)@plt>:", listing, re.M):
        found.setdefault(match.group(2), int(match.group(1), 16))
    return found


def main():
    for setting in ("confirm off", "pagination off", "sysroot /", "print thread-events off",
                    "logging file /dev/null", "logging redirect on", "logging enabled on"):
        gdb.execute("set " + setting, to_string=True)
    gdb.execute("file " + PROG, to_string=True)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    proc = subprocess.Popen(["/bin/sh", "-c", "exec %s -g %d '%s' %s" % (RUNNER, port, PROG, ARGS)])
    for _ in range(300):
        if proc.poll() is not None:
            say("ltrace: the program could not be started")
            return
        try:
            gdb.execute("target remote localhost:%d" % port, to_string=True)
            break
        except gdb.error:
            time.sleep(0.1)
    # Where the program was loaded: the entry address in memory minus the one in the file.
    in_file = int(re.search(r"Entry point address:\s+(0x[0-9a-f]+)",
                            subprocess.run(["readelf", "-h", PROG], capture_output=True,
                                           text=True).stdout).group(1), 16)
    entry = re.search(r"AT_ENTRY.*?(0x[0-9a-f]+)\s*$", gdb.execute("info auxv", to_string=True), re.M)
    base = (int(entry.group(1), 16) - in_file) if entry else 0
    entries = plt_entries()
    if not entries:
        say("ltrace: this program has no calls into shared libraries to show")
    for name, address in sorted(entries.items(), key=lambda item: item[1]):
        if name in SKIP or (ONLY and name not in ONLY):
            continue
        point = Call("*0x%x" % (address + base), internal=True)
        point.silent = True
        point.name = name
    gdb.events.exited.connect(lambda event: say(
        "+++ exited (status %d) +++" % getattr(event, "exit_code", 0)))
    try:
        gdb.execute("continue", to_string=True)
    except gdb.error as error:
        say("ltrace: %s" % str(error).strip())
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


main()
