# The 64-bit machine that runs inside the browser tab (Kali in this tab, 64-bit).
#
# It runs on QEMU compiled to WebAssembly. The 32-bit machine in browser-vm/
# runs on v86, which is faster but has no 64-bit mode.
#
#   Programs  Kali rolling, amd64, the official kalilinux/kali-rolling image
#   Kernel    the Kali amd64 kernel (linux-image-amd64)
#   Start     a small init and bash, not systemd and zsh, so the machine is light
#   Disk      this image becomes one read-only disk (squashfs) that the page
#             downloads in pieces. Changes go to memory and are gone when the
#             tab closes, except the folder ~/labs, which the page can save.
#
# build.sh in this folder turns the image into the files the page loads.
FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive
ARG LAB_TZ=America/New_York

# Keep the image small: no manuals, no translations.
RUN printf '%s\n' \
      'path-exclude=/usr/share/doc/*' 'path-include=/usr/share/doc/*/copyright' \
      'path-exclude=/usr/share/man/*' 'path-exclude=/usr/share/locale/*' \
      'path-include=/usr/share/locale/en*' 'path-exclude=/usr/share/info/*' \
      > /etc/dpkg/dpkg.cfg.d/lab-slim \
 && printf 'APT::Install-Recommends "false";\nAPT::Install-Suggests "false";\n' \
      > /etc/apt/apt.conf.d/90lab

# Base system, the kernel, and the boot image.
COPY rootfs/etc/initramfs-tools/scripts/lab64 /etc/initramfs-tools/scripts/lab64
COPY rootfs/usr/local/sbin/lab-prune-modules /usr/local/sbin/lab-prune-modules
RUN apt-get update \
 && apt-get install -y kmod initramfs-tools busybox-static zstd sudo bash-completion \
      util-linux util-linux-extra iproute2 procps psmisc locales tzdata ca-certificates \
 && sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen \
 && echo 'LANG=en_US.UTF-8' > /etc/default/locale \
 && ln -snf "/usr/share/zoneinfo/${LAB_TZ}" /etc/localtime && echo "${LAB_TZ}" > /etc/timezone \
 && chmod +x /etc/initramfs-tools/scripts/lab64 /usr/local/sbin/lab-prune-modules \
 && printf '%s\n' virtio virtio_ring virtio_pci virtio_blk squashfs overlay 9pnet 9pnet_virtio 9p \
      >> /etc/initramfs-tools/modules \
 && echo 'BOOT=lab64' >> /etc/initramfs-tools/initramfs.conf \
 && sed -i 's/^MODULES=.*/MODULES=list/' /etc/initramfs-tools/initramfs.conf \
 && sed -i 's/^COMPRESS=.*/COMPRESS=zstd/' /etc/initramfs-tools/initramfs.conf \
 && apt-get install -y linux-image-amd64 \
 && lab-prune-modules \
 && update-initramfs -u -k all \
 && cp "$(ls /boot/vmlinuz-* | sort -V | tail -1)" /boot/lab-vmlinuz \
 && cp "$(ls /boot/initrd.img-* | sort -V | tail -1)" /boot/lab-initrd \
 && ls -la /boot \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Reverse engineering tools (COSC 332) and a few everyday ones.
# gdb-minimal is gdb without the Python layer, which keeps the disk small.
# On this emulated processor gdb still takes about half a minute to start.
ARG LAB_TOOLS="gdb-minimal strace ltrace binutils file xxd bsdextrautils gcc libc6-dev make \
  python3 upx-ucl yara readpe radare2 patchelf hexedit nano vim-tiny less tmux \
  unzip zip openssl"
RUN apt-get update \
 && apt-get install -y ${LAB_TOOLS} \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /var/cache/apt/*.bin /var/log/*.log \
 && rm -f /usr/libexec/gcc/*/*/lto1 /usr/libexec/gcc/*/*/lto-wrapper /usr/bin/*-lto-dump-* \
      /usr/lib/x86_64-linux-gnu/libasan.so* /usr/lib/x86_64-linux-gnu/libtsan.so* \
      /usr/lib/x86_64-linux-gnu/libhwasan.so* /usr/lib/x86_64-linux-gnu/liblsan.so* \
      /usr/lib/x86_64-linux-gnu/libubsan.so* \
 && find /usr/share/locale -mindepth 1 -maxdepth 1 ! -name 'en*' -exec rm -rf {} + \
 && find /usr/share/i18n/locales -type f ! -name 'en_US' ! -name 'en_GB' ! -name 'C' ! -name 'POSIX' \
      ! -name 'i18n*' ! -name 'iso14651*' ! -name 'translit_*' -delete

# The student account. sudo runs commands on the terminal itself (no use_pty):
# lab-start reads its one line from the serial terminal, and a second terminal
# in between would swallow that line. It also makes sudo quicker here.
RUN useradd -m -s /bin/bash -G sudo kali \
 && echo 'kali:kali' | chpasswd \
 && printf '%s\n' 'kali ALL=(ALL) NOPASSWD:ALL' \
      'Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' \
      'Defaults !use_pty' \
      > /etc/sudoers.d/kali && chmod 0440 /etc/sudoers.d/kali \
 && touch /home/kali/.hushlogin && mkdir -p /home/kali/labs \
 && chown -R kali:kali /home/kali \
 && echo kali > /etc/hostname \
 && printf '127.0.0.1 localhost kali\n::1 localhost ip6-localhost ip6-loopback\n' > /etc/hosts.lab

COPY rootfs/ /
RUN chmod +x /usr/local/sbin/* /usr/local/bin/* \
 && echo 'HISTCONTROL=ignoreboth' >> /etc/bash.bashrc \
 && echo '. /etc/lab-bashrc' >> /home/kali/.bashrc \
 && rm -f /etc/profile.d/80-systemd-osc-context.sh
