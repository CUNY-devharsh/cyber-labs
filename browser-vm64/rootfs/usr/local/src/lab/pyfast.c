/*
 * python3 for the 64-bit tab machine: the client of the warm Python server
 * (/usr/local/lib/lab/pywarm.py, which explains why this exists).
 *
 * It hands the server this process's terminal (standard input, output and
 * error), arguments, folder and environment. The server runs the program in a
 * copy of itself that already has the libraries loaded, and reports the exit
 * status. Signals such as Ctrl-C are passed on to that copy.
 *
 * It starts the real /usr/bin/python3 instead when the server is not running,
 * when LAB_PY=cold is set, and for command lines other than
 *   python3 [-u] [-B] [-q] [script | -c command | -m module | -] [arguments]
 *
 * Built in the Dockerfile:  gcc -O2 -o /usr/local/bin/python3 pyfast.c
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#define REAL "/usr/bin/python3"
#define SERVER "/run/lab-pywarm.sock"

extern char **environ;
static volatile sig_atomic_t pending[65];
static int wake[2];

static void cold(char **argv)
{
    execv(REAL, argv);
    perror(REAL);
    _exit(127);
}

static void on_signal(int number)
{
    int saved = errno;

    if (number > 0 && number < 65)
        pending[number] = 1;
    if (write(wake[1], "s", 1) < 0) { /* the pipe is full, a wake-up is already waiting */ }
    errno = saved;
}

/* Is this a command line the server handles? */
static int warm_form(int argc, char **argv)
{
    int i = 1;

    while (i < argc && (!strcmp(argv[i], "-u") || !strcmp(argv[i], "-B") || !strcmp(argv[i], "-q")))
        i++;
    if (i == argc)
        return 1;                               /* interactive, or a program on standard input */
    if (!strcmp(argv[i], "-c") || !strcmp(argv[i], "-m"))
        return i + 1 < argc;
    if (!strcmp(argv[i], "-"))
        return 1;
    return argv[i][0] != '-';                   /* a script. Any other option goes to the real one */
}

static void add(char **buffer, size_t *used, size_t *room, const char *text)
{
    size_t length = strlen(text) + 1;

    if (*used + length > *room) {
        *room = (*used + length) * 2;
        *buffer = realloc(*buffer, *room);
        if (!*buffer)
            _exit(127);
    }
    memcpy(*buffer + *used, text, length);
    *used += length;
}

int main(int argc, char **argv)
{
    static const int forwarded[] = { SIGINT, SIGTERM, SIGHUP, SIGQUIT, SIGUSR1, SIGUSR2 };
    struct sockaddr_un address = { .sun_family = AF_UNIX, .sun_path = SERVER };
    const char *mode = getenv("LAB_PY");
    char *body = NULL, number[32], cwd[4096], head[64], line[64];
    size_t used = 0, room = 0, got = 0, sent;
    int fd, i, count, fds[3] = { 0, 1, 2 }, child = 0;
    mode_t mask;
    struct msghdr message = { 0 };
    struct iovec part[2];
    union { struct cmsghdr header; char space[CMSG_SPACE(sizeof(fds))]; } control;
    struct cmsghdr *cmsg;

    if ((mode && !strcmp(mode, "cold")) || !warm_form(argc, argv) || !getcwd(cwd, sizeof(cwd)))
        cold(argv);
    for (i = 0; i < 3; i++)                     /* all three standard files must be open */
        if (fcntl(i, F_GETFD) < 0)
            cold(argv);
    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    if (fd < 0 || connect(fd, (struct sockaddr *)&address, sizeof(address)) < 0)
        cold(argv);

    mask = umask(0);
    umask(mask);
    snprintf(number, sizeof(number), "%o", (unsigned)mask);
    add(&body, &used, &room, number);
    add(&body, &used, &room, cwd);
    snprintf(number, sizeof(number), "%d", argc);
    add(&body, &used, &room, number);
    for (i = 0; i < argc; i++)
        add(&body, &used, &room, argv[i]);
    for (count = 0; environ[count]; count++)
        ;
    snprintf(number, sizeof(number), "%d", count);
    add(&body, &used, &room, number);
    for (i = 0; i < count; i++)
        add(&body, &used, &room, environ[i]);

    if (pipe2(wake, O_CLOEXEC | O_NONBLOCK) < 0)
        cold(argv);
    for (i = 0; i < (int)(sizeof(forwarded) / sizeof(forwarded[0])); i++) {
        struct sigaction action = { 0 };

        action.sa_handler = on_signal;
        sigemptyset(&action.sa_mask);
        sigaction(forwarded[i], &action, NULL);
    }

    snprintf(head, sizeof(head), "LABPY1 %zu\n", used);
    part[0].iov_base = head;
    part[0].iov_len = strlen(head);
    part[1].iov_base = body;
    part[1].iov_len = used;
    message.msg_iov = part;
    message.msg_iovlen = 2;
    message.msg_control = control.space;
    message.msg_controllen = sizeof(control.space);
    cmsg = CMSG_FIRSTHDR(&message);
    cmsg->cmsg_level = SOL_SOCKET;
    cmsg->cmsg_type = SCM_RIGHTS;
    cmsg->cmsg_len = CMSG_LEN(sizeof(fds));
    memcpy(CMSG_DATA(cmsg), fds, sizeof(fds));
    {
        ssize_t n = sendmsg(fd, &message, MSG_NOSIGNAL);

        if (n < 0)
            cold(argv);
        sent = (size_t)n;
    }
    while (sent < part[0].iov_len + used) {     /* the rest of a long request */
        size_t offset = sent - part[0].iov_len;
        ssize_t n = send(fd, body + offset, used - offset, MSG_NOSIGNAL);

        if (n < 0) {
            if (errno == EINTR)
                continue;
            return 1;
        }
        sent += (size_t)n;
    }

    for (;;) {
        struct pollfd watch[2] = { { fd, POLLIN, 0 }, { wake[0], POLLIN, 0 } };
        char *end;

        if (poll(watch, 2, -1) < 0 && errno != EINTR)
            return 1;
        if (watch[1].revents & POLLIN) {
            char drain[64];

            while (read(wake[0], drain, sizeof(drain)) > 0)
                ;
        }
        for (i = 1; i < 65; i++) {
            if (pending[i] && child > 0) {
                pending[i] = 0;
                kill(child, i);
            }
        }
        if (!(watch[0].revents & (POLLIN | POLLHUP)))
            continue;
        {
            ssize_t n = read(fd, line + got, sizeof(line) - 1 - got);

            if (n < 0 && errno == EINTR)
                continue;
            if (n <= 0)
                return 1;                       /* the server went away */
            got += (size_t)n;
            line[got] = 0;
        }
        while ((end = strchr(line, '\n')) != NULL) {
            int value = atoi(line + 2);

            if (line[0] == 'P') {
                child = value;
            } else if (line[0] == 'X') {
                return value;
            } else if (line[0] == 'S') {        /* it died from a signal: end the same way */
                signal(value, SIG_DFL);
                kill(getpid(), value);
                return 128 + value;
            }
            got -= (size_t)(end + 1 - line);
            memmove(line, end + 1, got + 1);
        }
    }
}
