# gdb on the 32-bit lab machine, for x86-64 programs.
#
# A 32-bit kernel cannot start or trace an x86-64 program. The lab runner
# (qemu-x86_64) runs one, and it has a debugger port. This file makes the usual
# gdb commands use that port, so a lab handout written for a 64-bit machine
# works unchanged:
#
#   run, r, start, starti      start the program in the runner and attach to it
#   break, finish, stepi, x, info registers, catch syscall ...   as always
#
# The wrapper /usr/local/bin/gdb loads this file. It changes nothing until an
# x86-64 program is loaded. A 32-bit program is debugged by gdb directly.
import os
import shlex
import subprocess
import time

import gdb

RUNNER = "/usr/local/bin/qemu-x86_64"
state = {"proc": None, "installed": False}


def program():
    return gdb.current_progspace().filename


def is_x64(path):
    try:
        with open(path, "rb") as handle:
            head = handle.read(20)
    except (OSError, TypeError):
        return False
    return head[:5] == b"\x7fELF\x02" and head[18:20] == b"\x3e\x00"


def free_port():
    import socket
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def inferior_environment():
    env = {}
    for line in gdb.execute("show environment", to_string=True).splitlines():
        name, sep, value = line.partition("=")
        if sep:
            env[name] = value
    return env


def quiet(command):
    """Run a gdb command and hide what gdb prints while it runs."""
    for setting in ("file /dev/null", "redirect on", "enabled on"):
        gdb.execute("set logging " + setting, to_string=True)
    try:
        gdb.execute(command, to_string=True)
    finally:
        gdb.execute("set logging enabled off", to_string=True)


def stop_running():
    proc = state["proc"]
    if proc is not None and proc.poll() is None:
        try:
            gdb.execute("kill", to_string=True)
        except gdb.error:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    state["proc"] = None


def launch(args):
    """Start the program in the runner, stopped at its first instruction."""
    path = program()
    if not path:
        raise gdb.GdbError("No program loaded. Use: file PROGRAM")
    if not is_x64(path):
        raise gdb.GdbError("This gdb session is set up for x86-64 programs. "
                           "Start a new gdb for a 32-bit program.")
    stop_running()
    if not args:
        args = gdb.parameter("args") or ""
    port = free_port()
    command = "exec %s -g %d %s %s" % (RUNNER, port, shlex.quote(path), args)
    proc = subprocess.Popen(["/bin/sh", "-c", command], env=inferior_environment())
    state["proc"] = proc
    last = "the runner did not start"
    for _ in range(300):
        if proc.poll() is not None:
            raise gdb.GdbError("The program could not be started (%s)." % last)
        try:
            quiet("target remote localhost:%d" % port)
            return
        except gdb.error as error:
            last = str(error).strip()
            time.sleep(0.1)
    proc.kill()
    raise gdb.GdbError("Could not attach to the program (%s)." % last)


class Run(gdb.Command):
    """Start the x86-64 program in the lab runner and let it run.
Arguments and redirections work as usual, for example: run < input.txt"""

    def __init__(self, name):
        super().__init__(name, gdb.COMMAND_RUNNING, gdb.COMPLETE_FILENAME)

    def invoke(self, args, from_tty):
        launch(args)
        gdb.execute("continue", from_tty)


class Start(gdb.Command):
    """Start the x86-64 program in the lab runner and stop at main."""

    def __init__(self):
        super().__init__("start", gdb.COMMAND_RUNNING, gdb.COMPLETE_FILENAME)

    def invoke(self, args, from_tty):
        launch(args)
        gdb.execute("tbreak main", to_string=True)
        gdb.execute("continue", from_tty)


class Starti(gdb.Command):
    """Start the x86-64 program in the lab runner and stop at its first instruction."""

    def __init__(self):
        super().__init__("starti", gdb.COMMAND_RUNNING, gdb.COMPLETE_FILENAME)

    def invoke(self, args, from_tty):
        launch(args)
        gdb.execute("frame", from_tty)


def install():
    if state["installed"]:
        return
    state["installed"] = True
    for setting in ("confirm off", "sysroot /", "startup-with-shell off"):
        try:
            gdb.execute("set " + setting, to_string=True)
        except gdb.error:
            pass
    Run("run")
    Run("r")
    Start()
    Starti()
    gdb.write("x86-64 program on a 32-bit machine: gdb runs it in the lab runner. "
              "run, start, break, finish and catch syscall work as usual.\n")


def on_new_objfile(event):
    if not state["installed"] and is_x64(program()):
        install()


gdb.events.new_objfile.connect(on_new_objfile)


def on_exit(event):
    proc = state["proc"]
    state["proc"] = None
    if proc is not None:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


gdb.events.exited.connect(on_exit)
if program() and is_x64(program()):
    install()
