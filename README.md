# Cyber Labs

Kali Linux 2026 and Windows Server in a browser tab, for MAC courses at LaGuardia Community College.

Site: https://cuny-devharsh.github.io/cyber-labs/

Students open the site, pick a machine, and press Launch. The machine starts in GitHub Codespaces and shows up in their browser. They need a free GitHub account and nothing else.

Two machines are different. Kali in this tab and Kali in this tab, 64-bit run a real Linux kernel inside the student's own browser and need no account at all.

Student guide for the Kali machines: [START-HERE.md](START-HERE.md). The rest of this file is for the instructor.

## How it works

| Part | Where it lives | What it does |
| --- | --- | --- |
| Launcher site | `docs/` served by GitHub Pages | Lists the machines and builds the launch links |
| Cloud machines | `.devcontainer/` run by GitHub Codespaces | Kali terminal, Kali desktop, Windows Server 2019, 2022, 2025 |
| Kali in this tab | `docs/kali-browser/`, built by `browser-vm/` | A Linux kernel and the Kali tools on the v86 emulator, inside the browser |
| Kali in this tab, 64-bit | `docs/kali-browser64/`, built by `browser-vm64/`, published by the repository `cyber-labs-kali64` | A 64-bit Linux kernel and the lab tools on QEMU compiled to WebAssembly, inside the browser |

GitHub Pages only serves files, so nothing runs on GitHub's side for a visitor. The site gets around that in two ways.

The cloud machines run in GitHub Codespaces. They are the full 64-bit Kali 2026 and Windows Server, and each student's free Codespaces allowance pays for them.

Kali in this tab runs in the student's own browser on [v86](https://github.com/copy/v86), an emulator of a 32-bit PC written in JavaScript and WebAssembly. It boots a real Linux kernel. It is 32-bit, slower than a cloud machine, and has no internet and no desktop. Windows Server 2019 and later cannot run this way: they are 64-bit only, and the Windows image may not be republished.

Kali in this tab, 64-bit is a second machine of the same kind. v86 has no 64-bit mode, so this one runs on [QEMU](https://www.qemu.org/) compiled to WebAssembly. It runs 64-bit programs and it is about ten times slower than the 32-bit machine. The site keeps both: the 32-bit machine for everyday command line labs, the 64-bit machine for labs that hand out 64-bit programs.

## Machines

| Machine | Dev container file | Default size | Screen |
| --- | --- | --- | --- |
| Kali Linux terminal | `.devcontainer/devcontainer.json` | 2 cores | Terminal in the editor page |
| Kali Linux desktop | `.devcontainer/kali-desktop/devcontainer.json` | 2 cores | XFCE desktop through noVNC on port 6080 |
| Kali Linux desktop with a target | `.devcontainer/kali-targets/devcontainer.json` | 2 cores | The same desktop, plus Metasploitable 2 at 192.168.56.101 |
| Windows Server 2019 | `.devcontainer/windows-server-2019/devcontainer.json` | 2 cores | Web viewer on port 8006 |
| Windows Server 2022 | `.devcontainer/windows-server-2022/devcontainer.json` | 2 cores | Web viewer on port 8006 |
| Windows Server 2025 | `.devcontainer/windows-server-2025/devcontainer.json` | 2 cores | Web viewer on port 8006 |

Kali is built from the official `kalilinux/kali-rolling` image (version 2026.3 on the build date, November 20, 2026). User `kali`, password `kali`, sudo without a password, time zone America/New_York.

The Kali machines expose `/dev/net/tun`, so OpenVPN can join a lab network such as TryHackMe. The student steps are in START-HERE.md.

Windows Server uses the open source [dockur/windows](https://github.com/dockur/windows) container and follows that project's own Codespaces setup. On first start it downloads the evaluation ISO from Microsoft and installs it without input. User `Docker`, password `admin`. No Microsoft files are stored in this repository.

Every machine starts on 2 cores, the smallest size. GitHub ignores a machine size in a launch link that offers to resume a machine. A student who wants 4 cores stops the machine and picks Change machine type at https://github.com/codespaces. To force 4 cores for one machine, add `"hostRequirements": { "cpus": 4 }` to its dev container file.

## Kali in this tab

| Item | Value |
| --- | --- |
| Page | `docs/kali-browser/` |
| Emulator | v86 0.5.476 from npm, a 32-bit PC with an x86 to WebAssembly translator |
| Kernel | Linux 6.1.0-57-686, the 32-bit long-term kernel from Debian 12. Kali stopped building a 32-bit kernel in October 2024 |
| User space | Kali rolling 2026.3, 32-bit packages from the official `kalilinux/kali-rolling` image |
| Memory | 384 MB for the machine |
| Tools | nmap, hydra, john, sqlmap, nikto, gobuster, ffuf, tshark, tcpdump, smbclient, aircrack-ng, gdb, strace, ltrace, radare2, upx, yara, readpe, gcc, g++, Java (see the Java kit below), python3 with pandas, numpy, matplotlib and flask, FreeRADIUS, Snort and google-authenticator, plus OpenSSH server and Apache as practice targets. `hashcat` is a front end that runs the attack with John the Ripper (see The hashcat command in the tab machines). No VPN clients, no Metasploit, no desktop |
| Console | The student's terminal is a virtio console (`hvc0`) shown with xterm.js. A hidden root shell on `ttyS0` lets the page set the clock |
| Download | 20 MB at start. After that each file is fetched the first time the machine reads it. The whole file store is about 680 MB in about 45,400 files |
| Network | None. `lab-targets` starts SSH and a web server inside the machine to attack |
| x86-64 programs | The kernel is 32-bit, so a lab runner starts them, and `gdb`, `strace` and `ltrace` work on them (see x86-64 programs in the 32-bit tab machine) |
| Student work | Kept in the tab's memory. Save machine stores a snapshot in the browser (IndexedDB). Send a file and Get a file move files in and out of `~/labs` |

It is labeled Beta on the site. Treat it as an unofficial build: Kali tools on a kernel that Kali does not ship.

### How it is built

`browser-vm/build.sh` does the whole job. It needs Docker, Node 20 or newer, Python 3 with the `zstandard` module, `zstd` and `git`.

1. `browser-vm/Dockerfile` builds a 32-bit Kali system with a kernel, systemd, the tools and the lab helpers.
2. `browser-vm/tools/pack-rootfs.py` turns that system into a store of compressed files named by hash. v86 serves it to the kernel as the root file system over 9p and fetches files over HTTP on demand.
3. `browser-vm/build-state.mjs` boots the machine once under Node, checks it, and saves its state. The page restores that state, so a student gets a running machine without waiting for a boot.

The built files go to `docs/kali-browser/v86`, `xterm` and `image`. They are about 700 MB and are not kept in git.

### Publish it

The built files are too large for git, so GitHub builds them. `.github/workflows/pages.yml` runs `build.sh` and publishes `docs/` to GitHub Pages. It runs when `docs/` or `browser-vm/` changes. The 64-bit machine is published from a second repository and has its own section below.

The machine image is built once for each version of `browser-vm/` and kept as a release file in the repository. A change to the site alone reuses it. This matters to students: a machine saved in the browser loads only into the image it was saved from. To rebuild the image with fresh Kali packages, change the number in `browser-vm/VERSION`, and do it between terms.

The build job runs on `ubuntu-24.04` on purpose. The `ubuntu-26.04` image, which `ubuntu-latest` now points to, ships Docker 29.4.2. Its default seccomp profile blocks the `socketcall` system call that 32-bit programs use for networking, so the build fails with `Temporary failure resolving`. Docker 29.4.3 fixes this ([actions/runner-images issue 14790](https://github.com/actions/runner-images/issues/14790)). After the 26.04 image ships that version, `ubuntu-latest` works again.

One-time setup: in the repository open Settings, then Pages, and set Source to GitHub Actions. Until then the page says the machine image is not on the site yet. A run that builds the machine takes about 11 minutes.

### What was tested

On November 26, 2026, in headless Chrome against a local copy of the site:

| Item | Result |
| --- | --- |
| Kernel boots under v86 | Passed. Linux 6.1.0-56-686 i686, systemd reaches the running state with no failed units, in about 2 minutes under Node |
| Start from the saved state | Passed. A prompt is ready about 1 second after the files arrive |
| Terminal | Passed. Signed in as kali on `/dev/hvc0`, window resize follows the page, clock set from the browser |
| `sudo nmap -sS -sV` against the local targets | Passed in 22 seconds |
| `hydra` against local SSH | Passed in 13 seconds |
| `john` on an MD5 hash | Passed in 6 seconds |
| `sqlmap --version`, `tshark -v`, `python3` | Passed in 35, 6 and 4 seconds |
| `gcc` builds and runs a C program | Passed in 11 seconds |
| Save machine and Load saved machine | Passed. Save took 3 to 7 seconds and 38 to 84 MB of browser storage. Load took about 1 second and restored the files |
| Send a file, Get a file | Passed |
| On the published site, headless Chrome on Linux | Passed twice on November 26, 2026. Running 2.3 seconds after the page opened. First use of each tool includes its download: `nmap -sS -sV` 28 to 30 seconds, `hydra` 33 to 38, `john` 9, `gcc` 13 to 14, `sqlmap --version` 49 to 53. Save 8 seconds and 84 MB. Load 1.6 seconds. Send a file and Get a file passed. In one run, 1 of 974 file requests got a 503 from GitHub Pages and v86 fetched it again by itself |
| On the published site, the browser in the Claude desktop app on a Mac (Chrome 156 engine) | Passed. The machine started, `lab-targets` took 20 seconds and `nmap -sS -sV` 26 seconds. 250 requests, none failed |
| On the published site in Edge, Firefox, Safari and on a Chromebook | Not tested |
| The GitHub Actions workflow | Passed. The first run failed on `ubuntu-26.04` (see Publish it). On `ubuntu-24.04` a run that builds the machine took 10 minutes 41 seconds. A run that reuses the stored image took 1 minute 2 seconds |

## The Java kit in both tab machines

COSC 112 and 113 need `javac` and `java`. The full JDK is 300 MB, so both Dockerfiles build a small one with `jlink`: the modules an introductory course uses, 100 MB for 32-bit and 140 MB for 64-bit. It is in `/opt/lab-jdk`, and `/usr/local/bin` has `java`, `javac`, `jshell` and `jar`.

Java starts slowly on an emulated processor. Two things help. `javac` starts from a cache of its own classes, already loaded and linked (the AOT cache of JDK 25). Both commands use only the quick compiler and a simple memory collector. On a normal computer this cut the processor time of one `javac` run from 1.08 to 0.31 seconds for 64-bit.

Kali has no Java for 32-bit x86 with a compiler inside the virtual machine. The 32-bit kit is the Zero build of OpenJDK 25, which interprets every instruction. It works and it is slow.

## x86-64 programs in the 32-bit tab machine

The COSC 332 targets are x86-64 programs. A 32-bit kernel cannot start one, and its debugger interface cannot trace one. These parts make the targets work in Kali in this tab, so the same handout works on every machine:

| Part | What it does |
| --- | --- |
| `/usr/local/bin/qemu-x86_64` | The lab runner: the user-mode part of QEMU 9.2.4, built by the stage `x64run` of `browser-vm/Dockerfile`. It runs one x86-64 program on a 32-bit system. It has to be the 9.2 series, because QEMU 10.0 removed 64-bit programs on 32-bit hosts |
| `browser-vm/x64/qemu-lab.patch` | Changes a reverse engineering lab needs. `PTRACE_TRACEME` works once when no debugger is attached and fails when one is, as on Linux, so an anti-debugging target behaves the same. At a `catch syscall` stop gdb sees -38 on entry and the result on return, and it can change the result. The runner prints nothing when gdb ends the program. The floating point tests are left out of the build, because they need two more source trees |
| `/usr/lib/binfmt.d/lab-x86_64.conf` | Tells the kernel to hand every x86-64 program to the runner, so `./program` works |
| `/usr/local/bin/gdb` and `/usr/local/share/lab/x64-gdb.py` | gdb debugs a 32-bit program directly. For an x86-64 program `run`, `start` and `starti` start it in the runner and attach to the runner's debugger port. `break`, `finish`, `stepi`, `x`, `info registers`, `catch syscall` and `set $rax = 0` then work as the handout says |
| `/usr/local/bin/strace` | Starts the real strace for a 32-bit program. For an x86-64 program it prints the runner's system call log in strace's layout. It supports `-f`, `-o` and `-e trace=` with names and the classes `%file`, `%process` and `%network` |
| `/usr/local/bin/ltrace` and `/usr/local/share/lab/x64-ltrace.py` | Starts the real ltrace for a 32-bit program. For an x86-64 program a gdb script stops at each entry of the procedure linkage table and prints the call, its arguments and its result in ltrace's layout |
| `libc6-amd64`, `lib64gcc` and `lib64stdc++` packages | The C and C++ libraries an x86-64 program loads, and the files `gcc -m64` needs to build one. Plain `gcc` builds 32-bit programs |

Each front end prints one line that says the lab runner is in use. Limits: an x86-64 program runs on two emulators stacked, so it is slow. `strace -p` and `gdb -p` cannot attach to an x86-64 program that is already running. A library built for the `LD_PRELOAD` exercise needs `gcc -m64`.

On November 28, 2026 all 23 steps of the COSC 332 answer key passed in this machine in 126 seconds, in headless Chrome against a local copy of the site. Before this change 11 passed.

## The hashcat command in the tab machines

hashcat needs a graphics card, or a fast processor with an OpenCL runtime. A browser tab has neither: a test build of the 32-bit machine with hashcat took 469 seconds to try three words. Both tab machines have `/usr/local/bin/hashcat` instead, a script that accepts the commands the COSC 489 password lab uses and runs the same attack with John the Ripper:

| Command | Result |
| --- | --- |
| `hashcat --help \| grep -i md5` | Lists the hash modes the script knows: 0, 100, 900, 1000, 1400, 1700, 3000, 500, 1800, 7400 and 3200 |
| `hashcat -m 0 -a 0 hashes.txt wordlist.txt` | Word list attack. Prints `hash:password` lines and a status block |
| `hashcat -m 0 -a 3 hashes.txt ?l?l?d?d` | Mask attack. The script prints how many candidates the mask has. The lab's mask `?u?l?l?l?l?d?d?d` has 11.9 billion, which no browser tab can try. The script says so and starts anyway |
| `hashcat -m 0 hashes.txt --show` | Shows what was cracked |
| `hashcat -m 22000 ...` | Not available. The script points to `aircrack-ng`, which is installed |

The first line of its output says that John the Ripper runs the attack. The lab task is about graphics card speed, so the full mask attack and the Wi-Fi attack with the rockyou list belong on a computer with a graphics card.

## Kali in this tab, 64-bit

This machine has the 64-bit kernel that Kali ships, so an x86-64 program runs on it directly and the real `gdb`, `strace` and `ltrace` trace it. Its emulator is much slower than the 32-bit one. The 32-bit machine runs the COSC 332 targets too, through its lab runner. Use this machine when a lab needs a real 64-bit system.

| Item | Value |
| --- | --- |
| Page | `docs/kali-browser64/`, published at `/cyber-labs-kali64/` by the repository `cyber-labs-kali64` (see Where it is published) |
| Emulator | QEMU 8.2.0 (`qemu-system-x86_64`) compiled to WebAssembly. The source is [qemu-wasm](https://github.com/ktock/qemu-wasm) at commit `0ef7b4e`, with three patches in `browser-vm64/qemu/patches/` |
| Kernel | Linux 7.2.15+kali-amd64, the kernel Kali ships |
| User space | Kali rolling, 64-bit packages from the official `kalilinux/kali-rolling` image. BusyBox init and bash start the machine, not systemd and zsh |
| Memory | 512 MB for the machine |
| Tools | The reverse engineering set (gdb, strace, ltrace, objdump, readelf, radare2, upx, yara, readpe, patchelf, hexedit), gcc, g++, Java, python3 with pandas, numpy, matplotlib and flask, and the system and network set: OpenSSH, Apache, nftables, iptables, nmap, tshark, tcpdump, john, hydra, aircrack-ng, sqlmap, nikto, gnupg, git, FreeRADIUS, Snort, google-authenticator. `lab-targets` starts SSH and a web server to practice on. No hashcat, no Metasploit, no desktop |
| Console | The serial port `ttyS0`, shown with xterm.js through xterm-pty |
| Download | About 85 MB at start: the saved state (80 MB, with Python and its data libraries already loaded) and QEMU (3.4 MB, without its debug data). The disk is 1.8 GB, cut into 1,756 pieces that total 691 MB compressed. A piece is fetched the first time the machine reads it |
| Network | None |
| Student work | The folder `~/labs` is shared with the page. Send a file and Get a file use it. Save my files stores the folder in the browser (IndexedDB), up to 256 MB, and the page puts it back at the next start. Everything else starts fresh each time |
| Browser | QEMU's threads share memory, which browsers allow only on a cross-origin isolated page. GitHub Pages cannot send the two headers for that, so the service worker `sw.js` adds them and the page reloads once on the first visit. A private window that blocks service workers cannot run the machine |

It is labeled Beta on the site. It is an unofficial build.

This machine has no systemd. `systemctl` here is a shell script written for it (`browser-vm64/rootfs/usr/bin/systemctl`). It reads the same unit files and starts, stops and reports on a service, so the `systemctl` steps of a lab work. The script that the Kali cloud machines use is written in Python and took more than 15 minutes for one call on this emulated processor.

### Where it is published

One GitHub Pages site may hold 1 GB. With every lab tool in both machines, the 32-bit machine needs about 700 MB and the 64-bit machine about 740 MB. So the 64-bit machine has its own site, published by a second repository:

- Repository: https://github.com/CUNY-devharsh/cyber-labs-kali64
- Site: https://cuny-devharsh.github.io/cyber-labs-kali64/

That repository holds a workflow and a README, and no source. Its workflow checks this repository out, runs `browser-vm64/build.sh`, copies the page from `docs/kali-browser64/` and publishes the result. The page and the build files stay here.

After you change `browser-vm64/` or `docs/kali-browser64/`, open the Actions page of `cyber-labs-kali64` and press Run workflow. The workflow also runs four times a day by itself and publishes only when those files have changed. GitHub switches scheduled runs off after 60 days without a commit in that repository. Run workflow still works then.

The old address, `/cyber-labs/kali-browser64/`, has a copy of the page and no machine. That copy forwards visitors to the new site.

### How it is built

`browser-vm64/build.sh` does the whole job. It needs Docker, Node 20 or newer, Python 3, squashfs-tools 4.5 or newer and `git`.

1. `browser-vm64/qemu/build-qemu.sh` builds QEMU twice from one source: once for the browser and once for the build computer. This took 9 minutes on 2 cores once the two build environments existed. On GitHub's runner the whole step, environments included, took 10 minutes 34 seconds.
2. `browser-vm64/Dockerfile` builds the Kali system with the kernel and the tools.
3. The system becomes one squashfs disk without compression. `browser-vm64/tools/make-disk.py` cuts it into pieces of 1 MB and compresses each piece.
4. `browser-vm64/make-state.py` boots the machine once on the native QEMU, checks the tools, stops the machine and saves its state. Then it loads the state into a fresh QEMU and waits for the prompt, so a bad state fails the build. The page starts QEMU from that state. A cold boot in the browser takes more than seven minutes.

The built files are `qemu`, `xterm`, `xterm-pty`, `fflate` and `image`. They are about 740 MB and are not kept in git.

The workflow in `cyber-labs-kali64` keeps two release files there. QEMU is rebuilt only when `browser-vm64/qemu/` changes. The machine image is rebuilt when anything in `browser-vm64/` changes. To rebuild the image with fresh Kali packages, change the number in `browser-vm64/VERSION`.

### Known problem: the machine can stop

During long, heavy work this machine sometimes stops for good: no new output, no error, the page still says Running, and the browser uses no processor time. In test loops (`tshark`, `gcc`, a Python import and `nmap`, over and over) it happened after 2 to 20 minutes. Short work such as the COSC 332 answer key (3 minutes) ran without it. Start over brings the machine back. The folder `~/labs` survives only if Save my files was pressed, so students should press it often.

What is known on November 28, 2026: the page's own thread is healthy, the emulated processor is idle and waiting, and QEMU's main loop thread sits in a call that it sends to the page's thread about 1,400 times per second. Ruled out by test: memory, Python, the disk reader waiting on its own background request, the way the page's thread is woken (`Atomics.waitAsync`), and QEMU starting and ending its disk helper threads. The cause is not found yet. Until it is fixed, the 32-bit machine is the one to give a class. It now runs every lab this one runs, including COSC 332.

### Warm Python

On this emulator most of the time a Python lab took was spent importing libraries. Measured on the published site on November 28, 2026: `import pandas` 1 minute 56 seconds, `import matplotlib.pyplot` 4 minutes 35 seconds, `import flask` 50 seconds.

The machine now starts a small server when it boots (`/usr/local/lib/lab/pywarm.py`). It imports pandas, numpy, matplotlib, flask and the common standard modules once, before the start-up state is saved, so they are in memory when a student opens the page. `/usr/local/bin/python3` is a small client written in C (`pyfast.c`). It passes its terminal, arguments, folder and environment to the server, which runs the program in a copy of itself (a fork) under the student's account and returns the exit status. Ctrl-C and other signals are passed on.

With it, a script that imports all four libraries starts in 2 seconds in the tab. The cost is a larger saved state: 80 MB, up from 56 MB.

The client starts the real `/usr/bin/python3` for anything the server does not handle (options other than `-c`, `-m`, `-u`, `-B` and `-q`), when the server is not running, and when `LAB_PY=cold` is set. `python` is the same command. matplotlib's font list, which takes minutes to build here, is built in the Dockerfile for both tab machines.

### Parts written for this machine

| Part | What it does |
| --- | --- |
| `docs/kali-browser64/lab-disk.js` and `browser-vm64/tools/make-disk.py` | A disk that downloads itself. QEMU sees one file. A read of a part that is not there yet fetches that piece, and the next two pieces follow in the background. A failed request is tried again up to four times |
| `docs/kali-browser64/sw.js` | The service worker that makes the page cross-origin isolated on GitHub Pages |
| `browser-vm64/rootfs/usr/bin/systemctl` | A `systemctl` in shell for a machine without systemd: start, stop, restart, reload, status, is-active, is-enabled, enable, disable. After a start it waits until the service listens on its port, so a request sent right away is answered |
| `browser-vm64/rootfs/usr/local/lib/lab/pywarm.py` and `usr/local/src/lab/pyfast.c` | Warm Python, described above |
| `rootfs/usr/local/bin/hashcat` in both machine folders | The hashcat front end for John the Ripper |
| `browser-vm64/tools/strip-wasm-debug.py` | Removes 28 MB of debug data from QEMU's file before it goes on the site: the packed file is 3.4 MB, down from 14.6 MB |
| `browser-vm64/make-state.py` | Saves the state and tests it. It saves from a stopped machine, because one state saved from a running machine crashed in the kernel's timer code when it was loaded |
| `browser-vm64/rootfs/usr/local/sbin/lab-start` | Finishes the start in the tab. The saved machine waits for one line from the page, then sets the clock from the browser, opens `~/labs` and shows the welcome text |
| `0001-9pfs-translate-emscripten-error-codes.patch` | QEMU sent the browser toolchain's error numbers to the guest. A missing file reached Linux as "Channel number out of range", so nothing could be created in `~/labs`. The patch translates all 131 codes |
| `0002-9pfs-chmod-without-proc-on-emscripten.patch` | QEMU sets the mode of a new file through `/proc/self/fd`, which does not work in the browser. The patch uses `fchmodat` there |
| `0003-wasm-backend-widen-operands-of-32-bit-double-multiply.patch` | A fault in the part of qemu-wasm that compiles guest code to WebAssembly. A signed 32-bit multiply of a negative number reported an overflow that did not happen. The `ssh` client checks every multiply for overflow, so it stopped with Aborted on each connection. `browser-vm64/tools/mul-check.c` is the test that showed it: 2 million wrong answers in 6 million multiplies before the patch |

The window size cannot travel over a serial line. The page writes it to `~/labs/.size`, and the shell reads that file before each prompt. A new size takes effect at the next prompt.

### What was tested

On November 27, 2026, in headless Chrome against a local copy of the site:

| Item | Result |
| --- | --- |
| Start from the saved state | Passed. The machine was running 11 seconds after the page opened, with the files on the same computer |
| Service worker path | Passed with a web server that sends no isolation headers. The page registered `sw.js`, reloaded once and started |
| Terminal | Passed. Signed in as kali, size set from the page, clock set from the browser, resize applied at the next prompt |
| Files in `~/labs` | Passed: create, append, `mkdir`, `chmod`, run a program, rename, delete, and `gcc` writing its output there |
| Send a file, Get a file | Passed. Checksums matched in both directions |
| Save my files | Passed. 8 files saved, and after a reload they were back with their modes |
| COSC 332 answer key | Passed. The 7 targets went in with Send a file, and all 23 steps passed in 195 seconds: `strings`, `ltrace`, `strace`, `objdump`, `gdb`, byte patching, the `ptrace` bypasses, `upx`, `r2`, `readelf`, `yara` |
| Speed | `gdb --version` took 28 seconds the first time and 24 after that. `python3 -c pass` took 5 seconds, `gcc --version` 1 second. A shell loop runs about 10 times slower than on the 32-bit machine |
| Saved state | Passed 4 of 4 load tests after the change to save from a stopped machine |
| On the published site, headless Chrome on Linux | Passed twice on November 27, 2026. Running 16 to 17 seconds after the page opened, with the service worker step included. The COSC 332 answer key passed 23 of 23 steps in 187 seconds, with the targets sent through Send a file. During that run the page fetched 233 disk pieces, 95 MB, and waited 8.8 seconds in total for 73 of them. Send a file, Get a file, Save my files and a reload passed, and a reload took 15 seconds. `gdb --version` took 28 seconds, then 23. `python3 -c pass` took 4 seconds |
| On the published site, Chrome 158 on a Mac | Passed. Running 16 seconds after the page opened. A command ran and printed the 64-bit kernel version |
| On the published site in Edge, Firefox, Safari and on a Chromebook | Not tested |
| The GitHub Actions workflow | Passed on the first run, in 13 minutes 5 seconds: 10 minutes 34 seconds to build QEMU and 1 minute 53 seconds to build the machine image |

## Publish the site (one time)

1. Create a public repository on GitHub and push these files to the `main` branch.
2. In the repository, open Settings, then Pages.
3. Under Build and deployment, set Source to Deploy from a branch. Choose branch `main` and folder `/docs`. Save.
4. After a minute the site is at `https://OWNER.github.io/REPO/`.

The page reads the owner and repository name from its own address, so the launch links need no editing. For a custom domain, set `owner` and `repo` in `docs/config.js`.

The repository must stay public. Students cannot create codespaces from a private repository they cannot read.

## Test before you share the link

Run each machine once from the published site with your own account at the start of each term. A personal account runs two machines at once, so test them in turn.

1. Kali Linux terminal. Run `lab-info`, then `sudo nmap -sS -p 80 127.0.0.1`.
2. Kali Linux desktop. Wait for the desktop tab, open a terminal and Firefox.
3. Windows Server 2019. Watch the viewer tab until the Windows desktop appears. Note how long it takes and write that into `docs/config.js`.
4. Stop one machine, start it again, and check that it comes back.
5. Delete the test machines at https://github.com/codespaces.

Windows Server 2019 passed this test and shows no tag. Windows Server 2022 and 2025 are marked Beta on the site until you test them. After a machine passes, change its `status` from `"beta"` to `"ready"` in `docs/config.js`.

## What was tested

In real codespaces on November 20, 2026, with the CUNY-devharsh account, all on 2 cores:

| Item | Result |
| --- | --- |
| Launch links on the published site | Passed. The Kali terminal, Kali desktop and Windows Server 2019 links each created the right machine. The 2022 and 2025 links open the right setup page |
| Kali Linux terminal, first start | Passed twice, in 3 minutes 45 seconds and 3 minutes 35 seconds. Kali 2026.3, `lab-info`, `sudo nmap -sS` |
| Kali Linux desktop, first start | Passed in 7 minutes 3 seconds. Desktop on port 6080, terminal and nmap inside the desktop |
| Kali Linux desktop after stop and start | Passed. Ready again in about 1 minute. The desktop restarted by itself |
| VPN tunnel device in Kali | Passed. `/dev/net/tun` is present and OpenVPN 2.7.8 created a tunnel device |
| Windows Server 2019, first start | Passed in about 22 minutes. KVM present, 5.65 GB download from Microsoft, desktop reached with no input |
| Windows Server 2019 after stop and start | Passed. Desktop back in 2 minutes 39 seconds with no reinstall |
| Fixes for the problems these tests found | Passed after a full rebuild of the desktop machine and on a new terminal machine: zsh in desktop terminals, the lab banner in every terminal, no Kali setup notice, no notice about port 5901 |
| Windows Server 2022 and 2025 | Not tested. They use the same files as 2019 with a different version number |
| TryHackMe connection with a real `.ovpn` file | Not tested. It needs a TryHackMe account |

In the build sandbox before publishing:

| Item | Result |
| --- | --- |
| Kali terminal image builds from scratch | Passed. About 3 minutes on a 2 core machine |
| Kali desktop image builds from scratch | Passed. About 5 minutes total on a 2 core machine |
| Both Kali dev containers start through the Dev Containers CLI | Passed, including sudo, raw socket scans, packet capture, hashcat on CPU |
| Kali desktop through the noVNC web client in Chrome | Passed. The screenshot on the site is from this test |
| Kali desktop after stop and start, and `start-desktop --restart` | Passed |
| Windows dev container files parse and the compose file matches upstream | Passed |
| Windows container starts and requests the Server 2019 evaluation ISO from Microsoft | Passed up to the download, which the build sandbox blocked |
| Launcher site in Chrome at desktop and phone widths | Passed. No console errors, no sideways scrolling |
| Launch links opened on github.com | Passed. Each link opens the Create codespace page with the right dev container |

## Change things

| To change | Edit |
| --- | --- |
| Courses, machine text, Beta tags | `docs/config.js` |
| Page wording outside the machine list | `docs/index.html` |
| Colors and layout | `docs/styles.css` |
| Kali tools installed by default | The package list in `.devcontainer/kali/Dockerfile` |
| Optional tool sets shown by `lab-install` | `.devcontainer/kali/scripts/lab-install` |
| Kali time zone | `LAB_TZ` in `.devcontainer/kali/Dockerfile` |
| Hide the Copilot chat panel in the Kali editor page | Add `"chat.disableAIFeatures": true` to `settings` in both Kali dev container files. Tested on a real machine: the panel closes |
| Windows memory, cores, disk, account | The `environment` list in `.devcontainer/windows/compose.yml`. See the dockur/windows readme for `USERNAME`, `PASSWORD`, `DISK2_SIZE` and others |

To add a course, copy a block in the `courses` list in `docs/config.js` and set its code, title and machines.

A change to anything under `.devcontainer/` reaches only new machines. Students with an existing machine keep the old one until they delete it or rebuild it.

## Costs and limits

- Each student uses their own allowance. A free personal account gets 120 core hours and 15 GB of storage a month: 60 hours on 2 cores or 30 hours on 4 cores. Verified students and verified teachers get 180 core hours and 20 GB through GitHub Education.
- GitHub Classroom was retired on August 28, 2026, and its shared class allowance ended with it. There is no class-wide pool to draw on.
- A personal account ran two machines at once in testing. GitHub refused a third until one stopped.
- Storage is billed for as long as a machine exists, running or stopped. GitHub listed the test machines at 15 GB for Windows Server 2019, 4.1 GB for the Kali desktop and 2.6 GB for the Kali terminal. A Windows machine kept for a full month uses the whole free 15 GB. Ask students to delete Windows machines after each lab.
- Nothing is billed to you for student machines. Your own test machines use your own allowance.
- With no payment method on an account, GitHub blocks Codespaces when the allowance runs out and does not charge.
- A machine stops after 30 minutes without activity and is deleted after 30 days without use. These are GitHub's defaults.
- Codespaces machines of this size have a 32 GB disk. Windows uses most of it. Server 2019 is the smallest. Server 2025 is the most likely to run out of space.
- Windows Server is the evaluation edition and expires 180 days after install. Each new machine installs fresh, so this rarely matters.
- In a test run, when the Microsoft download failed, the dockur/windows container tried third party mirrors next. In a codespace the Microsoft download is the first choice.
- Kali runs in a container and shares the host kernel. Wi-Fi, USB and kernel module tools do not work.
- Hyper-V labs (MAC 233 week 9) most likely will not run. The Windows machine is already a virtual machine inside a virtual machine.
- Kali Rolling changes every week. If a package is renamed, the Kali build fails for new machines until the package list is fixed. Launch a new Kali machine at the start of each term to check.

## Check the rules before a full class uses it

GitHub's terms for Codespaces (version effective August 27, 2026) do not allow activity unrelated to developing or testing the software project in the repository where the codespace starts. They also forbid using GitHub's servers to disrupt systems or to gain unauthorized access. GitHub may restrict Codespaces for an account, or disable a repository that was made to break these terms.

Course lab machines are a gray area under the first rule. Before a full class depends on this site:

1. Ask GitHub Education support whether this use is allowed, and link this repository in the request.
2. Keep a fallback for every lab: the TryHackMe in-browser machine or the lab computers on campus.
3. Keep the rule on the site and in START-HERE.md: students attack only assigned targets, never GitHub or other sites on the internet.

Terms: https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features

## Optional: faster first start

Codespaces prebuilds can cut the Kali first start to about a minute. Set them up in the repository under Settings, then Codespaces. Prebuilds use your own storage allowance, so they are off by default.

## Course labs on these machines

On November 26, 2026 the lab handouts in the instructor's course folders were read and their steps were run in a local container built from `.devcontainer/kali/Dockerfile`, the image the Kali cloud machines use. The test scripts ran each command and compared the output with the answer keys.

| Course | Labs | Machine | Result |
| --- | --- | --- | --- |
| MAC 237, 246, 247 (LaGuardia) | 36 classroom Python labs | Any Kali machine, including Kali in this tab | All 36 solutions pass their self-checks on a Kali cloud image and in Kali in this tab on the published site, where a course's 12 labs took 8 to 40 seconds. All 36 student starters run |
| MAC 237, 246, 247 | 12 graded labs: system and network steps | Kali terminal or desktop | 37 of 39 checked steps pass: `systemctl` for ssh and Apache, `sshd -T`, users and password aging, `nft`, `iptables`, `tshark` capture and the evidence captures, `nmap -sV`, `gcc`, OpenSSL keys and certificates, Apache with TLS, `gpg`, pandas and flask, `apt`. See the two notes below |
| MAC 247 | 8 graded Python scripts | Any Kali cloud machine | All 8 run to the end |
| MAC 237, 246, 247 | 14 notebooks | Google Colab, or `python3` on Kali | 12 run to the end. 2 stop at a check that asks the student to fill in fields, as designed |
| COSC 332 (Bowie State) | 4 graded labs, 7 targets | Kali terminal or desktop, or either tab machine | All 23 answer-key steps pass on the cloud image: `strings`, `ltrace`, `strace`, `objdump`, `gdb`, byte patching, the `ptrace` bypasses, `upx`. They also pass in Kali in this tab, 64-bit, where the whole key took 195 seconds. In the 32-bit Kali in this tab all 23 pass through the lab runner, in 126 seconds on a local copy of the site |
| COSC 435, 442 | Lab 1 scanning, Lab 2 certificates, Lab 3 access control | Kali desktop with a target | `nmap` against 192.168.56.101, the OpenSSL and Apache steps and the user and group steps pass. Maltego needs `lab-install osint` and its own account. FreeRADIUS installs; its start was checked only with the IPv6 listener removed, because the test computer has no IPv6 |
| COSC 435, 442 | Lab 4 firewall and intrusion detection | Kali desktop with a target | Snort installs and DVWA is on the target. pfSense is a separate operating system and is not included |
| COSC 489 | Lab 2 web attacks, Lab 3 Metasploit, Lab 4 passwords | Kali desktop with a target | The DVWA SQL injection and `sqlmap` steps pass. `vsftpd_234_backdoor` gives a root session on the target. `john`, `hashcat`, `hashid` and `hydra` pass. `aircrack-ng` is installed; the course capture files were not tested. In the tab machines `hashcat` is the John the Ripper front end: the word list attack and `--show` work there, the lab's 8-character mask and the Wi-Fi attack do not finish |
| COSC 489 | Lab 1 open source intelligence | Any Kali cloud machine | `whois` and `dig` pass. theHarvester and recon-ng come with `lab-install osint` and were not run |
| COSC 112, 113 | Java exercises | Any Kali machine | On a cloud machine run `lab-install java` first. Both tab machines have `javac` and `java` (see The Java kit in both tab machines). A generics class compiles and runs on each |
| COSC 330, 414 | C and C++ programs | Any Kali machine | `gcc` and `g++` build and run, including `fork`, on the cloud image and in both tab machines |
| MAC 233 | 11 in-class labs, 4 lab projects | Not covered | The labs need two Windows servers on one private network, snapshots and Hyper-V. Each Windows machine here is a single server |

Not covered by these tests: anything inside a real codespace (the tests ran in a local container), Ghidra and edb (they need the desktop), Burp Suite, and the hosted CompTIA labs for COSC 435, which run on the vendor's own site.

Two things differ from an older Kali lab computer:

- `sshd -T` in OpenSSH 10.6 prints setting names with capital letters, for example `PermitRootLogin`. A handout that filters with `grep -E "^(permitrootlogin|passwordauthentication)"` finds nothing. Use `grep -iE`.
- Kali no longer has a `pev` package. The same tools are in `readpe`, which is installed. Kali has no `gh` package either, so `gh` is installed from GitHub's own package source.

The COSC 332 targets are 64-bit programs. They run on the Kali cloud machines and in both tab machines: directly in Kali in this tab, 64-bit, and through the lab runner in the 32-bit one. Ghidra and edb need a desktop, so those two steps stay on the Kali desktop.

### The two tab machines, lab by lab

The same lab pack ran in both tab machines in headless Chrome. Times are for the whole set on an emulated processor. The COSC 332 time for the 32-bit machine is from a local copy of the site with these changes. The other 32-bit numbers and the 64-bit COSC 332, Java and C numbers are from the published site on November 27 and 28, 2026, before these changes.

| Labs | Kali in this tab (32-bit) | Kali in this tab, 64-bit |
| --- | --- | --- |
| COSC 332 answer key, 23 steps | 23 pass in 126 seconds | 23 pass in 177 seconds |
| MAC 237, 246, 247: 36 Python solutions, 36 starters, 8 graded scripts, 14 notebooks | All pass in 428 seconds. 2 notebooks stop at a fill-in check, as designed | Not run to the end (see Known problem: the machine can stop). A script that imports pandas, numpy, matplotlib and flask starts in 2 seconds |
| MAC 237, 246, 247: 39 system and network steps | 36 pass. `gh`, `whois` and `dig` need the internet | The first 29 steps pass, with `gh` the only failure. The run then stopped (see Known problem). The remaining 10 were not run in the tab |
| COSC 112, 113: compile and run a Java generics class | `javac` 100 seconds, `java` 15 seconds | `javac` 80 to 143 seconds, `java` 21 seconds |
| COSC 330, 414: C with file output, C++ with `fork` | `gcc` 20 seconds, `g++` 77 seconds | `gcc` 29 seconds, `g++` 204 seconds |
| COSC 489 Lab 4: `john`, `hashid`, `hydra`, `aircrack-ng`, `hashcat` word list attack | `john`, `hashid`, `hydra` and `aircrack-ng` pass in the tab. The `hashcat` front end was tested in the machine's image | All were tested in the machine's image, not yet in the tab |

What a browser tab cannot do, on either machine:

- Steps that need the internet: `git push`, `gh`, `apt`, `whois`, `dig`, and the open source intelligence lab. The tab machines have no network outside themselves.
- Metasploit, Burp Suite, Maltego, Ghidra and edb. They need a desktop, gigabytes of files, or both.
- A second machine to attack other than the SSH and web servers that `lab-targets` starts. Metasploitable 2, DVWA and pfSense are on the Kali desktop with a target, or outside this project.
- hashcat at graphics card speed (see The hashcat command in the tab machines).
- `tshark` starts in about 2 minutes in the 64-bit machine. `tcpdump` starts in seconds there.
- The MAC 233 Windows labs.

### What the Kali machines add for these labs

- `systemctl` works. A dev container has no systemd, so the image carries [docker-systemctl-replacement](https://github.com/gdraheim/docker-systemctl-replacement), a script that reads the same unit files and starts the service itself. `sudo systemctl start ssh`, `restart`, `disable --now`, `is-active` and `is-enabled` were checked.
- Debuggers work. The machines start with `SYS_PTRACE` and without the default system call filter, so `gdb` can turn off address randomization.
- Installed for the labs: `strace`, `ltrace`, `upx`, `radare2`, `readpe`, `yara`, `hexedit`, `patchelf`, an SSH server, `at`, `g++`, `gh`, `aircrack-ng`, `hcxtools`, and the Python packages pandas, numpy, matplotlib and flask.
- New tool sets: `lab-install reverse` (Ghidra, edb, GEF and the Kali reverse engineering set), `lab-install java`, `lab-install osint`.
- Kali Linux desktop with a target starts a second container, Metasploitable 2, at 192.168.56.101, the address the handouts use. It also serves DVWA at `http://192.168.56.101/dvwa/`. The target is pinned by its image digest and no port of it is forwarded.

## Files

```
.devcontainer/
  devcontainer.json            Kali terminal (default)
  kali/Dockerfile              Kali image, targets: terminal and desktop
  kali/scripts/                lab-info, lab-install, start-desktop and helpers
  kali/desktop-config/         XFCE settings for the browser desktop
  kali-desktop/                Kali desktop dev container
  kali-targets/                Kali desktop plus the Metasploitable 2 target
  windows/compose.yml          Windows container, shared by the three versions
  windows-server-2019/         Dev container, VERSION 2019
  windows-server-2022/         Dev container, VERSION 2022
  windows-server-2025/         Dev container, VERSION 2025
docs/                          The GitHub Pages site
docs/kali-browser/             Page for Kali in this tab (the image files are built, not stored)
browser-vm/                    Build files for the machine that runs in the browser
browser-vm/x64/                Patch for the x86-64 lab runner of that machine
docs/kali-browser64/           Page for Kali in this tab, 64-bit. Published by the repository cyber-labs-kali64
browser-vm64/                  Build files for the 64-bit machine, with the QEMU build in qemu/
.github/workflows/pages.yml    Builds the 32-bit machine and publishes this site
.github/workflows/kali-image.yml  Builds the Kali cloud image and runs lab steps in it on every change
labs/                          Empty folder for student work inside a Kali machine
START-HERE.md                  Student quick guide, opens inside Kali machines
```

## Credits

- Kali Linux images by the Kali team: https://www.kali.org/docs/containers/official-kalilinux-docker-images/
- Windows in a container by the dockur/windows project (MIT license): https://github.com/dockur/windows
- Browser desktop by noVNC and TigerVNC.
- systemctl in the Kali containers by docker-systemctl-replacement, Guido U. Draheim (EUPL license): https://github.com/gdraheim/docker-systemctl-replacement
- Practice target: Metasploitable 2 by Rapid7, from the `tleemcjr/metasploitable2` image on Docker Hub. DVWA is the Damn Vulnerable Web Application project.
- Kali in this tab runs on v86 by Fabian Hemmer and contributors (BSD 2-Clause license): https://github.com/copy/v86
- Its BIOS files are SeaBIOS and the Bochs VGA BIOS (LGPL). Its terminal is xterm.js (MIT license). Its kernel is from Debian 12 (GPL version 2).
- Kali in this tab, 64-bit runs on QEMU (GPL version 2), in the WebAssembly version by Kohei Tokunaga: https://github.com/ktock/qemu-wasm. The build script and our three patches are in `browser-vm64/qemu/`. The site serves the license and a note naming the source beside the program, in `kali-browser64/qemu/`.
- Its terminal is xterm.js with xterm-pty, and fflate unpacks the disk pieces (all MIT license). Its kernel is the Kali kernel (GPL version 2).

Kali Linux is a trademark of OffSec. Windows Server is a trademark of Microsoft. GitHub and Codespaces are trademarks of GitHub. This project is a course resource. It is not an official website of LaGuardia Community College or CUNY, and it is not affiliated with or endorsed by OffSec, Microsoft or GitHub.
