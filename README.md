# Cyber Labs

Kali Linux 2026 and Windows Server in a browser tab, for MAC courses at LaGuardia Community College.

Site: https://cuny-devharsh.github.io/cyber-labs/

Students open the site, pick a machine, and press Launch. The machine starts in GitHub Codespaces and shows up in their browser. They need a free GitHub account and nothing else.

Student guide for the Kali machines: [START-HERE.md](START-HERE.md). The rest of this file is for the instructor.

## How it works

| Part | Where it lives | What it does |
| --- | --- | --- |
| Launcher site | `docs/` served by GitHub Pages | Lists the machines and builds the launch links |
| Machines | `.devcontainer/` run by GitHub Codespaces | Kali terminal, Kali desktop, Windows Server 2019, 2022, 2025 |

GitHub Pages only serves files. It cannot run an operating system. Running Kali 2026 or Windows Server inside the browser itself (WebAssembly emulators such as v86) is not possible today: those emulators are 32-bit, Kali stopped shipping 32-bit kernels and images in 2024, Windows Server is 64-bit only, and a Pages site is capped at 1 GB. So the site launches real machines on GitHub's servers, and each student's free Codespaces allowance pays for them.

## Machines

| Machine | Dev container file | Default size | Screen |
| --- | --- | --- | --- |
| Kali Linux terminal | `.devcontainer/devcontainer.json` | 2 cores | Terminal in the editor page |
| Kali Linux desktop | `.devcontainer/kali-desktop/devcontainer.json` | 2 cores | XFCE desktop through noVNC on port 6080 |
| Windows Server 2019 | `.devcontainer/windows-server-2019/devcontainer.json` | 2 cores | Web viewer on port 8006 |
| Windows Server 2022 | `.devcontainer/windows-server-2022/devcontainer.json` | 2 cores | Web viewer on port 8006 |
| Windows Server 2025 | `.devcontainer/windows-server-2025/devcontainer.json` | 2 cores | Web viewer on port 8006 |

Kali is built from the official `kalilinux/kali-rolling` image (version 2026.3 on the build date, November 20, 2026). User `kali`, password `kali`, sudo without a password, time zone America/New_York.

Both Kali machines expose `/dev/net/tun`, so OpenVPN can join a lab network such as TryHackMe. The student steps are in START-HERE.md.

Windows Server uses the open source [dockur/windows](https://github.com/dockur/windows) container and follows that project's own Codespaces setup. On first start it downloads the evaluation ISO from Microsoft and installs it without input. User `Docker`, password `admin`. No Microsoft files are stored in this repository.

Every machine starts on 2 cores, the smallest size. GitHub ignores a machine size in a launch link that offers to resume a machine. A student who wants 4 cores stops the machine and picks Change machine type at https://github.com/codespaces. To force 4 cores for one machine, add `"hostRequirements": { "cpus": 4 }` to its dev container file.

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

## Files

```
.devcontainer/
  devcontainer.json            Kali terminal (default)
  kali/Dockerfile              Kali image, targets: terminal and desktop
  kali/scripts/                lab-info, lab-install, start-desktop and helpers
  kali/desktop-config/         XFCE settings for the browser desktop
  kali-desktop/                Kali desktop dev container
  windows/compose.yml          Windows container, shared by the three versions
  windows-server-2019/         Dev container, VERSION 2019
  windows-server-2022/         Dev container, VERSION 2022
  windows-server-2025/         Dev container, VERSION 2025
docs/                          The GitHub Pages site
labs/                          Empty folder for student work inside a Kali machine
START-HERE.md                  Student quick guide, opens inside Kali machines
```

## Credits

- Kali Linux images by the Kali team: https://www.kali.org/docs/containers/official-kalilinux-docker-images/
- Windows in a container by the dockur/windows project (MIT license): https://github.com/dockur/windows
- Browser desktop by noVNC and TigerVNC.

Kali Linux is a trademark of OffSec. Windows Server is a trademark of Microsoft. GitHub and Codespaces are trademarks of GitHub. This project is a course resource. It is not an official website of LaGuardia Community College or CUNY, and it is not affiliated with or endorsed by OffSec, Microsoft or GitHub.
