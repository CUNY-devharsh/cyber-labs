#!/usr/bin/python3
"""Warm Python for the 64-bit tab machine.

The emulated processor in a browser tab is slow, and most of the time a Python
lab takes there is spent importing libraries: about 2 minutes for pandas and
more for matplotlib. This server imports them once, before the machine's
start-up state is saved, so they are already in memory when a student opens the
page. Each "python3" command then becomes a copy (fork) of this process, which
starts in about a second.

/usr/local/bin/python3 is the small client. It passes its terminal, arguments,
folder and environment to this server and returns the program's exit status.
Anything the server does not handle goes to the real /usr/bin/python3, and so
does everything when LAB_PY=cold is set.
"""
import atexit
import gc
import io
import os
import pwd
import select
import signal
import socket
import struct
import sys
import threading
import traceback

SOCKET = "/run/lab-pywarm.sock"
CLIENT = "/usr/local/bin/python3"
PRELOAD = """json csv re math random datetime time collections itertools functools hashlib hmac
secrets base64 binascii string textwrap argparse subprocess shutil pathlib glob tempfile ssl
sqlite3 urllib.request urllib.parse http.server http.client logging unittest typing dataclasses
enum statistics decimal fractions pprint copy pickle zlib gzip zipfile code codeop readline
multiprocessing multiprocessing.spawn concurrent.futures
rlcompleter runpy site getpass platform uuid ipaddress operator bisect heapq queue
numpy pandas matplotlib matplotlib.pyplot flask""".split()


def preload():
    loaded = []
    for name in PRELOAD:
        try:
            __import__(name)
            loaded.append(name)
        except Exception:      # a missing library must not stop the server
            pass
    return loaded


def read_request(conn):
    """One message: the client's three standard files and a block of text fields."""
    data, fds, _flags, _addr = socket.recv_fds(conn, 65536, 3)
    head, _, body = data.partition(b"\n")
    tag, size = head.split()
    if tag != b"LABPY1" or len(fds) != 3:
        raise ValueError("bad request")
    size = int(size)
    while len(body) < size:
        more = conn.recv(size - len(body))
        if not more:
            raise ValueError("short request")
        body += more
    fields = [os.fsdecode(part) for part in body[:size].split(b"\0")]
    umask, cwd, argc = int(fields[0], 8), fields[1], int(fields[2])
    argv = fields[3:3 + argc]
    envc = int(fields[3 + argc])
    env = dict(item.split("=", 1) for item in fields[4 + argc:4 + argc + envc] if "=" in item)
    return fds, umask, cwd, argv, env


def standard_files(unbuffered):
    sys.stdin = sys.__stdin__ = open(0, "r", encoding="utf-8", errors="surrogateescape", closefd=False)
    if unbuffered:
        raw = open(1, "wb", buffering=0, closefd=False)
        sys.stdout = io.TextIOWrapper(raw, encoding="utf-8", errors="surrogateescape", write_through=True)
    else:
        sys.stdout = open(1, "w", encoding="utf-8", errors="surrogateescape",
                          buffering=1 if os.isatty(1) else -1, closefd=False)
    sys.__stdout__ = sys.stdout
    sys.stderr = sys.__stderr__ = open(2, "w", encoding="utf-8", errors="backslashreplace",
                                       buffering=1, closefd=False)


def become(uid, gid, umask, cwd, env):
    os.umask(umask)
    if os.geteuid() == 0 and uid != 0:
        os.initgroups(pwd.getpwuid(uid).pw_name, gid)
        os.setgid(gid)
        os.setuid(uid)
    os.environ.clear()
    os.environ.update(env)
    os.chdir(cwd)


def fresh_state(env):
    """Things a new interpreter would set up for itself."""
    import random
    import site
    import time
    random.seed()
    time.tzset()
    if "numpy" in sys.modules:
        sys.modules["numpy"].random.seed()
    if "matplotlib" in sys.modules and env.get("MPLBACKEND"):
        try:
            sys.modules["matplotlib"].use(env["MPLBACKEND"])
        except Exception:
            pass
    # A program that starts another Python with sys.executable should get a warm
    # one too. multiprocessing is the exception: it hands extra open files to
    # the interpreter it starts, which only the real one accepts.
    try:
        import multiprocessing.spawn
        multiprocessing.spawn.set_executable(sys.executable)
    except Exception:
        pass
    sys.executable = CLIENT
    site.USER_SITE = site.USER_BASE = None
    user_site = site.getusersitepackages()
    if os.path.isdir(user_site) and user_site not in sys.path:
        site.addsitedir(user_site)
    for folder in reversed([p for p in env.get("PYTHONPATH", "").split(":") if p]):
        sys.path.insert(0, folder)


def interactive():
    import code
    banner = 'Python %s on %s\nType "help", "copyright", "credits" or "license" for more information.' % (
        sys.version, sys.platform)
    try:
        import readline
        import rlcompleter
        readline.parse_and_bind("tab: complete")
    except Exception:
        pass
    code.interact(banner=banner, local={"__name__": "__main__", "__doc__": None}, exitmsg="")


def run_python(argv):
    """Do what the python3 command line asks. Returns the exit status."""
    import runpy
    args = argv[1:]
    unbuffered = False
    while args and args[0] in ("-u", "-B", "-q"):
        unbuffered = unbuffered or args[0] == "-u"
        args.pop(0)
    standard_files(unbuffered or os.environ.get("PYTHONUNBUFFERED"))
    main = sys.modules["__main__"] = type(sys)("__main__")
    try:
        if not args:
            sys.argv = [""]
            sys.path.insert(0, "")
            if os.isatty(0):
                interactive()
            else:
                exec(compile(sys.stdin.read(), "<stdin>", "exec"), main.__dict__)
        elif args[0] == "-":
            sys.argv = ["-"] + args[1:]
            sys.path.insert(0, "")
            exec(compile(sys.stdin.read(), "<stdin>", "exec"), main.__dict__)
        elif args[0] == "-c":
            sys.argv = ["-c"] + args[2:]
            sys.path.insert(0, "")
            exec(compile(args[1], "<string>", "exec"), main.__dict__)
        elif args[0] == "-m":
            sys.argv = args[1:]
            sys.path.insert(0, os.getcwd())
            runpy.run_module(args[1], run_name="__main__", alter_sys=True)
        else:
            script = args[0]
            if not os.path.exists(script):
                sys.stderr.write("python3: can't open file %r: [Errno 2] No such file or directory\n"
                                 % os.path.abspath(script))
                return 2
            sys.argv = args
            sys.path.insert(0, os.path.dirname(os.path.realpath(script)))
            runpy.run_path(os.path.abspath(script), run_name="__main__")
        return 0
    except SystemExit as stop:
        if stop.code is None:
            return 0
        if isinstance(stop.code, int):
            return stop.code & 0xFF
        sys.stderr.write("%s\n" % (stop.code,))
        return 1
    except KeyboardInterrupt:
        traceback.print_exc()
        return 130
    except BaseException:
        kind, value, trace = sys.exc_info()
        # Leave this server's own frames out of the report.
        while trace is not None and trace.tb_frame.f_code.co_filename in (__file__, runpy.__file__,
                                                                           "<frozen runpy>"):
            trace = trace.tb_next
        sys.excepthook(kind, value.with_traceback(trace), trace)
        return 1


def child(listener, others, fds, cred, umask, cwd, argv, env):
    status = 1
    try:
        signal.set_wakeup_fd(-1)
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.default_int_handler)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        listener.close()
        for other in others:
            other.close()
        for number, fd in enumerate(fds):
            os.dup2(fd, number)
        for fd in fds:
            if fd > 2:
                os.close(fd)
        become(cred[1], cred[2], umask, cwd, env)
        fresh_state(env)
        status = run_python(argv)
        try:
            threading._shutdown()
        except Exception:
            pass
        atexit._run_exitfuncs()
    except BaseException:
        try:
            traceback.print_exc()
        except Exception:
            pass
    finally:
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.flush()
            except Exception:
                pass
        os._exit(status)


def serve():
    loaded = preload()
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(SOCKET)
    os.chmod(SOCKET, 0o666)
    listener.listen(16)
    wake_read, wake_write = socket.socketpair()
    wake_read.setblocking(False)
    wake_write.setblocking(False)
    signal.set_wakeup_fd(wake_write.fileno())
    signal.signal(signal.SIGCHLD, lambda number, frame: None)
    gc.collect()
    gc.freeze()
    print("lab-pywarm: ready, %d libraries loaded: %s" % (len(loaded), " ".join(loaded)), flush=True)
    running = {}
    while True:
        try:
            ready, _, _ = select.select([listener, wake_read], [], [])
        except InterruptedError:
            continue
        if wake_read in ready:
            try:
                wake_read.recv(256)
            except BlockingIOError:
                pass
            while running:
                try:
                    pid, status = os.waitpid(-1, os.WNOHANG)
                except ChildProcessError:
                    break
                if pid == 0:
                    break
                conn = running.pop(pid, None)
                if conn is not None:
                    if os.WIFSIGNALED(status):
                        reply = b"S %d\n" % os.WTERMSIG(status)
                    else:
                        reply = b"X %d\n" % os.WEXITSTATUS(status)
                    try:
                        conn.sendall(reply)
                    except OSError:
                        pass
                    conn.close()
        if listener in ready:
            conn, _ = listener.accept()
            fds = []
            try:
                cred = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED,
                                                           struct.calcsize("3i")))
                fds, umask, cwd, argv, env = read_request(conn)
                sys.stdout.flush()
                pid = os.fork()
                if pid == 0:
                    conn.close()
                    child(listener, list(running.values()) + [wake_read, wake_write],
                          fds, cred, umask, cwd, argv, env)
                conn.sendall(b"P %d\n" % pid)
                running[pid] = conn
            except Exception as error:
                print("lab-pywarm: request failed: %r" % (error,), flush=True)
                conn.close()
            finally:
                for fd in fds:
                    try:
                        os.close(fd)
                    except OSError:
                        pass


if __name__ == "__main__":
    serve()
