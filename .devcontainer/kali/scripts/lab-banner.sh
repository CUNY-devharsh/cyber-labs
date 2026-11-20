# Printed once per interactive shell. Keep it short.
case "$-" in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
[ -n "${LAB_BANNER_SHOWN:-}" ] && return 0 2>/dev/null
export LAB_BANNER_SHOWN=1
_lab_ver="$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-rolling}")"
printf '\n  Kali Linux %s lab environment\n' "$_lab_ver"
printf '  lab-info      show what this machine is and what is installed\n'
printf '  lab-install   add bigger tool sets (Metasploit, Burp Suite, ZAP, ...)\n'
[ -x /usr/local/bin/start-desktop ] && printf '  start-desktop restart the browser desktop on port 6080\n'
printf '  Stop the codespace when you finish. Free hours are limited.\n\n'
unset _lab_ver
