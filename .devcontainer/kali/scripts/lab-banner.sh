# Printed at the top of each new terminal. Keep it short.
case "$-" in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
# Only in a real terminal. The editor also starts hidden shells to read the
# environment, and those must stay quiet.
[ -t 1 ] || return 0 2>/dev/null
# This marker is not exported on purpose. The editor copies exported variables
# into every terminal it opens, which would hide the banner everywhere.
[ -n "${_lab_banner_done:-}" ] && return 0 2>/dev/null
_lab_banner_done=1
_lab_ver="$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-rolling}")"
printf '\n  Kali Linux %s lab environment\n' "$_lab_ver"
printf '  lab-info      show what this machine is and what is installed\n'
printf '  lab-install   add bigger tool sets (Metasploit, Burp Suite, ZAP, ...)\n'
[ -x /usr/local/bin/start-desktop ] && printf '  start-desktop restart the browser desktop on port 6080\n'
printf '  Stop the codespace when you finish. Free hours are limited.\n\n'
unset _lab_ver
