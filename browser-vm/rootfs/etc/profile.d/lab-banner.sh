# Printed at the top of each new terminal. Keep it short.
case "$-" in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
[ -t 1 ] || return 0 2>/dev/null
[ -n "${_lab_banner_done:-}" ] && return 0 2>/dev/null
_lab_banner_done=1
printf '\n  Kali tools on a real Linux kernel, running inside this browser tab\n'
printf '  lab-info      show what this machine is and what is installed\n'
printf '  lab-targets   start practice targets on this machine (web and SSH)\n'
printf '  This machine has no internet. Closing the tab erases it unless you save.\n\n'
