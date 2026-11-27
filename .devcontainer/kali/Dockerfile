# syntax=docker/dockerfile:1
#
# Kali Linux lab images for GitHub Codespaces.
# Base: the official Kali rolling image published by the Kali team.
#   https://www.kali.org/docs/containers/official-kalilinux-docker-images/
#
# Two build targets:
#   terminal  command line tools only (default dev container)
#   desktop   terminal + XFCE desktop served to the browser with noVNC

# ---------------------------------------------------------------- terminal
FROM docker.io/kalilinux/kali-rolling:latest AS terminal

ARG DEBIAN_FRONTEND=noninteractive
ARG LAB_TZ=America/New_York

# Step 1: the small pieces later steps depend on (adduser is needed by the
# Wireshark setup script, locales and tzdata give a clean UTF-8 shell).
RUN apt-get update \
 && apt-get install -y --no-install-recommends adduser locales tzdata ca-certificates \
 && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
 && locale-gen \
 && ln -snf "/usr/share/zoneinfo/${LAB_TZ}" /etc/localtime \
 && echo "${LAB_TZ}" > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TZ=${LAB_TZ}

# Let non-root users capture packets with tshark and Wireshark.
RUN echo "wireshark-common wireshark-common/install-setuid boolean true" | debconf-set-selections

# Step 2: the course tool set. Everything else in Kali is one apt install away.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      kali-defaults zsh sudo \
      curl wget git vim nano less man-db procps tmux jq unzip zip tree htop file xxd \
      iproute2 iputils-ping net-tools bind9-dnsutils whois traceroute \
      netcat-traditional ncat socat tcpdump tshark nmap \
      hydra john hashcat pocl-opencl-icd hashid crunch cewl wordlists \
      sqlmap nikto gobuster dirb ffuf whatweb \
      smbclient enum4linux nbtscan snmp \
      openssl gnupg openssh-client openvpn wireguard-tools \
      iptables nftables ufw lynis chkrootkit \
      python3 python3-pip python3-venv python3-scapy \
      gcc gdb make binutils binwalk libimage-exiftool-perl steghide \
      sqlite3 default-mysql-client \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# The standard Kali account: user kali, password kali, sudo without a password.
# The .hushlogin files hide Kali's notice about a minimal install. The lab
# banner takes its place.
RUN useradd --create-home --shell /usr/bin/zsh --groups sudo,wireshark kali \
 && echo "kali:kali" | chpasswd \
 && echo "kali ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/kali \
 && chmod 0440 /etc/sudoers.d/kali \
 && touch /home/kali/.hushlogin /root/.hushlogin \
 && chown kali:kali /home/kali/.hushlogin

COPY scripts/lab-info scripts/lab-install /usr/local/bin/
COPY scripts/lab-banner.sh /etc/profile.d/lab-banner.sh
RUN chmod 0755 /usr/local/bin/lab-info /usr/local/bin/lab-install \
 && echo '[ -r /etc/profile.d/lab-banner.sh ] && . /etc/profile.d/lab-banner.sh' >> /etc/zsh/zshrc

# Step 3: what the course labs need on top of the general tool set.
#   Reverse engineering (COSC 332): strace ltrace upx radare2 readpe yara
#   Python labs (MAC 246, MAC 247): pandas numpy matplotlib flask
#   System labs: an SSH server, at, a C++ compiler
#   Wireless captures (COSC 489): aircrack-ng hcxtools
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      strace ltrace upx-ucl radare2 readpe yara hexedit patchelf \
      python3-pandas python3-numpy python3-matplotlib python3-flask \
      openssh-server at g++ aircrack-ng hcxtools \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# GitHub's command line tool. Kali has no gh package, so it comes from
# GitHub's own package source (https://cli.github.com).
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# systemctl for containers. A dev container does not run systemd, so the real
# systemctl cannot start a service. This script reads the same unit files and
# starts the service itself, so "sudo systemctl start ssh" in a lab works.
#   https://github.com/gdraheim/docker-systemctl-replacement (EUPL license)
# It takes the place of /usr/bin/systemctl (the original is kept beside it as
# systemctl.systemd), because sudo only looks in /usr/sbin and /usr/bin.
# scripts/systemctl is a small front end: status questions work without sudo.
ARG SYSTEMCTL_TAG=v1.7.1097
ARG SYSTEMCTL_SHA256=5f5a47f321c7a8881dfd01f774106dc4012d664bee238eada86a7112674fea93
COPY scripts/systemctl /tmp/systemctl-front
RUN mkdir -p /usr/lib/lab \
 && curl -fsSL "https://raw.githubusercontent.com/gdraheim/docker-systemctl-replacement/${SYSTEMCTL_TAG}/files/docker/systemctl3.py" \
      -o /usr/lib/lab/systemctl3.py \
 && echo "${SYSTEMCTL_SHA256}  /usr/lib/lab/systemctl3.py" | sha256sum -c - \
 && chmod 0755 /usr/lib/lab/systemctl3.py \
 && dpkg-divert --local --rename --divert /usr/bin/systemctl.systemd --add /usr/bin/systemctl \
 && install -m 0755 /tmp/systemctl-front /usr/bin/systemctl \
 && rm /tmp/systemctl-front \
 && mkdir -p /etc/systemd/system/ssh.service.d \
 && printf '[Unit]\nConditionPathExists=\n' > /etc/systemd/system/ssh.service.d/lab.conf

USER kali
WORKDIR /home/kali
CMD ["/usr/bin/zsh"]

# ----------------------------------------------------------------- desktop
FROM terminal AS desktop

ARG DEBIAN_FRONTEND=noninteractive
USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      kali-desktop-xfce dbus-x11 xfce4-terminal fonts-nanum \
      tigervnc-standalone-server tigervnc-tools novnc python3-websockify \
      firefox-esr wireshark zenmap \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

COPY scripts/start-desktop scripts/kali-xstartup /usr/local/bin/
COPY scripts/novnc-index.html /usr/share/novnc/index.html
COPY --chown=kali:kali desktop-config/ /home/kali/.config/xfce4/xfconf/xfce-perchannel-xml/
RUN chmod 0755 /usr/local/bin/start-desktop /usr/local/bin/kali-xstartup \
 && chown -R kali:kali /home/kali/.config

USER kali
WORKDIR /home/kali
EXPOSE 6080
CMD ["/usr/bin/zsh"]
