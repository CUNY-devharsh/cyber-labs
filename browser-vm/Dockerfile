# Kali tools on a 32-bit Linux kernel, built to run inside the v86 browser
# emulator (https://github.com/copy/v86). Everything here is 32-bit x86 because
# v86 emulates a 32-bit PC.
#
# Kali stopped building a 32-bit kernel in October 2024 but still publishes its
# packages for 32-bit x86. So the user space below is Kali rolling, and the
# kernel is the 32-bit 6.1 long-term kernel from Debian 12.

FROM --platform=linux/386 debian:bookworm-slim AS kernel
RUN apt-get update \
 && mkdir /debs && cd /debs \
 && apt-get download "$(apt-cache depends linux-image-686 | awk '/Depends: linux-image-[0-9]/{print $2; exit}')" \
 && ls -l /debs

# A small Java kit for the programming courses (COSC 112 and 113). The full JDK
# is 300 MB. jlink builds a runtime with only the modules an introductory
# course uses. The class data archive and the compiler's start-up cache make
# java and javac start faster, which matters on an emulated processor.
FROM --platform=linux/386 kalilinux/kali-rolling:latest AS jdk
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends default-jdk-headless \
 && jlink --add-modules java.base,java.compiler,jdk.compiler,java.logging,java.xml,java.sql,java.net.http,java.management,jdk.jshell,jdk.jartool,jdk.zipfs \
      --no-header-files --no-man-pages --generate-cds-archive --output /opt/lab-jdk \
 && cd /tmp && printf 'public class Warm { public static void main(String[] a) { System.out.println("java works"); } }\n' > Warm.java \
 && (/opt/lab-jdk/bin/javac -J-XX:+IgnoreUnrecognizedVMOptions -J-XX:TieredStopAtLevel=1 -J-XX:+UseSerialGC \
        -J-XX:AOTCacheOutput=/opt/lab-jdk/lib/javac.aot Warm.java \
     || /opt/lab-jdk/bin/javac Warm.java) \
 && ls -l /opt/lab-jdk/lib/javac.aot \
 && /opt/lab-jdk/bin/java -cp /tmp Warm && /opt/lab-jdk/bin/java -version && du -sh /opt/lab-jdk

# The COSC 332 targets are x86-64 programs, and a 32-bit kernel cannot start
# one. This stage builds the user-mode part of QEMU, which runs one x86-64
# program on a 32-bit system. It has to be the 9.2 series: QEMU 10.0 removed
# 64-bit programs on 32-bit hosts. x64/qemu-lab.patch adds the two things a
# reverse engineering lab needs: PTRACE_TRACEME answers the way Linux does
# (anti-debugging labs depend on it), and gdb sees and can change the result of
# a system call at a "catch syscall" stop.
FROM --platform=linux/386 debian:bookworm-slim AS x64run
ARG QEMU_TAG=v9.2.4
COPY x64/qemu-lab.patch /tmp/qemu-lab.patch
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates git patch gcc libc6-dev make ninja-build pkg-config python3 python3-venv \
      libglib2.0-dev zlib1g-dev \
 && git clone --depth 1 --branch "${QEMU_TAG}" https://github.com/qemu/qemu /qemu \
 && cd /qemu && patch -p1 < /tmp/qemu-lab.patch \
 && ./configure --target-list=x86_64-linux-user --static --disable-docs --disable-tools \
      --disable-system --disable-plugins --disable-werror --disable-debug-info \
 && make -j"$(nproc)" \
 && strip -o /qemu-x86_64 build/qemu-x86_64 && ls -l /qemu-x86_64

FROM --platform=linux/386 kalilinux/kali-rolling:latest AS vm

ARG DEBIAN_FRONTEND=noninteractive
ARG LAB_TZ=America/New_York

# Leave out documentation and translations. Manual pages stay.
RUN printf '%s\n' \
      'path-exclude=/usr/share/doc/*' \
      'path-include=/usr/share/doc/*/copyright' \
      'path-exclude=/usr/share/locale/*' \
      'path-include=/usr/share/locale/en*' \
      'path-exclude=/usr/share/info/*' \
      > /etc/dpkg/dpkg.cfg.d/lab-slim

# Base system: init, device manager, the pieces the kernel package needs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      systemd-sysv udev dbus kmod initramfs-tools linux-base zstd \
      adduser locales tzdata ca-certificates sudo zsh kali-defaults \
 && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
 && locale-gen \
 && echo 'LANG=en_US.UTF-8' > /etc/default/locale \
 && ln -snf "/usr/share/zoneinfo/${LAB_TZ}" /etc/localtime \
 && echo "${LAB_TZ}" > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

# The kernel, and an initramfs that can mount the root file system over 9p.
# v86 serves the root file system to the guest through a virtio 9p device and
# fetches each file over HTTP the first time the guest reads it.
COPY --from=kernel /debs /tmp/debs
COPY rootfs/usr/local/sbin/lab-prune-modules /usr/local/sbin/lab-prune-modules
RUN chmod +x /usr/local/sbin/lab-prune-modules \
 && printf '%s\n' virtio virtio_ring virtio_pci 9pnet 9pnet_virtio 9p virtio_console \
      >> /etc/initramfs-tools/modules \
 && printf '%s\n' \
      '#!/bin/sh' \
      'case $1 in prereqs) exit 0;; esac' \
      '. /scripts/functions' \
      'if [ "${ROOT}" = "host9p" ]; then' \
      '    mkdir -p ${rootmnt}' \
      '    mount -n -t 9p -o trans=virtio,version=9p2000.L,cache=loose,rw host9p ${rootmnt}' \
      'else' \
      '    . /scripts/local' \
      'fi' \
      > /etc/initramfs-tools/scripts/boot-9p \
 && chmod +x /etc/initramfs-tools/scripts/boot-9p \
 && echo 'BOOT=boot-9p' >> /etc/initramfs-tools/initramfs.conf \
 && sed -i 's/^MODULES=.*/MODULES=list/' /etc/initramfs-tools/initramfs.conf \
 && dpkg -i /tmp/debs/*.deb \
 && rm -rf /tmp/debs \
 && lab-prune-modules \
 && update-initramfs -u \
 && ls -l /boot /vmlinuz /initrd.img

# The lab tools. Packages that Kali does not publish for 32-bit x86 are
# skipped and listed in /etc/lab-missing-packages.
COPY rootfs/usr/local/sbin/lab-apt-install /usr/local/sbin/lab-apt-install
ARG LAB_TOOLS="\
      curl wget git vim nano less man-db procps tmux jq unzip zip tree htop file xxd \
      iproute2 iputils-ping net-tools bind9-dnsutils whois traceroute \
      netcat-traditional ncat socat tcpdump tshark nmap \
      hydra john hashid crunch cewl wordlists \
      sqlmap nikto gobuster dirb ffuf whatweb \
      smbclient enum4linux nbtscan snmp \
      openssl gnupg openssh-client openssh-server apache2 \
      iptables nftables lynis chkrootkit \
      python3 python3-scapy \
      gcc g++ libc6-dev gdb make binutils binwalk libimage-exiftool-perl steghide \
      sqlite3 at sshpass aircrack-ng \
      python3-pandas python3-numpy python3-matplotlib python3-flask \
      strace ltrace upx-ucl radare2 yara readpe \
      freeradius snort libpam-google-authenticator"
RUN echo "wireshark-common wireshark-common/install-setuid boolean true" | debconf-set-selections \
 && chmod +x /usr/local/sbin/lab-apt-install \
 && lab-apt-install ${LAB_TOOLS} \
 && lab-apt-install libc6-amd64 libc6-dev-amd64 lib64gcc-s1 lib64stdc++6 \
      "lib64gcc-$(gcc -dumpversion | cut -d. -f1)-dev" "lib64stdc++-$(gcc -dumpversion | cut -d. -f1)-dev" \
 && rm -f /usr/bin/*-lto-dump-* /usr/libexec/gcc/*/*/lto1 /usr/libexec/gcc/*/*/lto-wrapper \
 && rm -rf /usr/lib/python3/dist-packages/pandas/tests /usr/lib/python3/dist-packages/numpy/tests \
      /usr/lib/python3/dist-packages/numpy/*/tests /usr/lib/python3/dist-packages/matplotlib/tests \
      /usr/lib/python3/dist-packages/mpl_toolkits/*/tests \
      /usr/lib/python3/dist-packages/matplotlib/mpl-data/sample_data \
 && (MPLBACKEND=Agg python3 -c "import pandas, numpy, matplotlib.pyplot, flask; print('python libraries import:', pandas.__version__, numpy.__version__)" || echo "python libraries: not all available for 32-bit") \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/*.bin /var/log/apt /var/log/dpkg.log

# The small Java kit built above. /usr/local/bin has java, javac, jshell and jar.
COPY --from=jdk /opt/lab-jdk /opt/lab-jdk

# The x86-64 runner built above. The packages libc6-amd64 and lib64gcc in the
# tool list give an x86-64 program its C library and let gcc -m64 build one.
# /usr/lib/binfmt.d/lab-x86_64.conf makes ./program start it, and the gdb,
# strace and ltrace commands in /usr/local/bin know about it.
COPY --from=x64run /qemu-x86_64 /usr/local/bin/qemu-x86_64

# The standard Kali account: user kali, password kali, sudo without a password.
RUN useradd --create-home --shell /usr/bin/zsh --groups sudo kali \
 && (getent group wireshark >/dev/null && usermod -aG wireshark kali || true) \
 && echo "kali:kali" | chpasswd \
 && passwd -d root \
 && echo "kali ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kali \
 && chmod 0440 /etc/sudoers.d/kali \
 && touch /home/kali/.hushlogin /root/.hushlogin \
 && chown kali:kali /home/kali/.hushlogin

# Files that make it a lab machine: consoles, banner, helper commands.
COPY rootfs/ /
RUN chmod +x /usr/local/bin/* /usr/local/sbin/* \
 && ln -sf /usr/bin/python3 /usr/local/bin/python \
 && printf '127.0.0.1 localhost kali\n::1 localhost ip6-localhost ip6-loopback\n' > /etc/hosts.lab \
 && echo '. /etc/profile.d/lab-banner.sh' >> /etc/zsh/zshrc \
 && mkdir -p /home/kali/labs && chown -R kali:kali /home/kali \
 && (su kali -c "MPLBACKEND=Agg python3 -c 'import matplotlib.pyplot'" && ls /home/kali/.cache/matplotlib || true) \
 && systemctl enable lab-setup.service serial-getty@hvc0.service serial-getty@ttyS0.service \
 && systemctl mask apt-daily.timer apt-daily-upgrade.timer man-db.timer e2scrub_all.timer \
      fstrim.timer dpkg-db-backup.timer logrotate.timer systemd-tmpfiles-clean.timer \
      systemd-random-seed.service systemd-update-utmp.service systemd-rfkill.socket \
      getty@tty1.service console-getty.service \
 && systemctl disable ssh.service apache2.service 2>/dev/null || true
