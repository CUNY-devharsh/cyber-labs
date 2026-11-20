# Cyber Labs

Kali Linux 2026 and Windows Server in a browser tab, for MAC courses at LaGuardia Community College.

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
| Windows Server 2019 | `.devcontainer/windows-server-2019/devcontainer.json` | 4 cores | Web viewer on port 8006 |
| Windows Server 2022 | `.devcontainer/windows-server-2022/devcontainer.json` | 4 cores | Web viewer on port 8006 |
| Windows Server 2025 | `.devcontainer/windows-server-2025/devcontainer.json` | 4 cores | Web viewer on port 8006 |

Kali is built from the official `kalilinux/kali-rolling` image (version 2026.3 on the build date, November 20, 2026). User `kali`, password `kali`, sudo without a password, time zone America/New_York.

Windows Server uses the open source [dockur/windows](https://github.com/dockur/windows) container and follows that project's own Codespaces setup. On first start it downloads the evaluation ISO from Microsoft and installs it without input. User `Docker`, password `admin`. No Microsoft files are stored in this repository.

## Publish the site (one time)

1. Create a public repository on GitHub and push these files to the `main` branch.
2. In the repository, open Settings, then Pages.
3. Under Build and deployment, set Source to Deploy from a branch. Choose branch `main` and folder `/docs`. Save.
4. After a minute the site is at `https://OWNER.github.io/REPO/`.

The page reads the owner and repository name from its own address, so the launch links need no editing. For a custom domain, set `owner` and `repo` in `docs/config.js`.

The repository must stay public. Students cannot create codespaces from a private repository they cannot read.

## Test before you share the link

Run each machine once from the published site with your own account.

1. Kali Linux terminal. Run `lab-info`, then `sudo nmap -sS -p 80 127.0.0.1`.
2. Kali Linux desktop. Wait for the desktop tab, open a terminal and Firefox.
3. Windows Server 2019 on 4 cores. Watch the viewer tab until the Windows desktop appears. Note how long it takes and write that into `docs/config.js`.
4. Stop one machine, start it again, and check that it comes back.
5. Delete the test machines at https://github.com/codespaces.

The Windows machines are marked Beta on the site. After a machine passes, change its `status` from `"beta"` to `"ready"` in `docs/config.js`.

## What was tested

| Item | Result |
| --- | --- |
| Kali terminal image builds from scratch | Passed. About 3 minutes on a 2 core machine |
| Kali desktop image builds from scratch | Passed. About 5 minutes total on a 2 core machine |
| Both Kali dev containers start through the Dev Containers CLI | Passed, including sudo, raw socket scans, packet capture, hashcat on CPU |
| Kali desktop through the noVNC web client in Chrome | Passed. The screenshot on the site is from this test |
| Kali desktop after stop and start, and `start-desktop --restart` | Passed |
| Windows dev container files parse and the compose file matches upstream | Passed |
| Windows container starts and requests the Server 2019 evaluation ISO from Microsoft | Passed up to the download, which the build sandbox blocked |
| Windows Server install and desktop inside a real codespace | Not tested. The build sandbox has no KVM. Run step 3 above |
| Launcher site in Chrome at desktop and phone widths | Passed. No console errors, no sideways scrolling |
| Launch links opened on github.com | Not tested. They need the published repository |

## Change things

| To change | Edit |
| --- | --- |
| Courses, machine text, Beta tags, default sizes | `docs/config.js` |
| Page wording outside the machine list | `docs/index.html` |
| Colors and layout | `docs/styles.css` |
| Kali tools installed by default | The package list in `.devcontainer/kali/Dockerfile` |
| Optional tool sets shown by `lab-install` | `.devcontainer/kali/scripts/lab-install` |
| Kali time zone | `LAB_TZ` in `.devcontainer/kali/Dockerfile` |
| Windows memory, cores, disk, account | The `environment` list in `.devcontainer/windows/compose.yml`. See the dockur/windows readme for `USERNAME`, `PASSWORD`, `DISK2_SIZE` and others |

To add a course, copy a block in the `courses` list in `docs/config.js` and set its code, title and machines.

A change to anything under `.devcontainer/` reaches only new machines. Students with an existing machine keep the old one until they delete it or rebuild it.

## Costs and limits

- Each student uses their own allowance. A free personal account gets 120 core hours and 15 GB of storage a month: 60 hours on 2 cores or 30 hours on 4 cores. Verified students get 180 core hours and 20 GB through GitHub Education.
- Nothing is billed to you for student machines. Your own test machines use your own allowance.
- With no payment method on an account, GitHub blocks Codespaces when the allowance runs out and does not charge.
- A machine stops after 30 minutes without activity and is deleted after 30 days without use. These are GitHub's defaults.
- Codespaces machines of this size have a 32 GB disk. Windows uses most of it. Server 2019 is the smallest. Server 2025 is the most likely to run out of space.
- Windows Server is the evaluation edition and expires 180 days after install. Each new machine installs fresh, so this rarely matters.
- In a test run, when the Microsoft download failed, the dockur/windows container tried third party mirrors next. In a codespace the Microsoft download is the first choice.
- Kali runs in a container and shares the host kernel. Wi-Fi, USB and kernel module tools do not work.
- Hyper-V labs (MAC 233 week 9) most likely will not run. The Windows machine is already a virtual machine inside a virtual machine.
- Kali Rolling changes every week. If a package is renamed, the Kali build fails for new machines until the package list is fixed. Launch a new Kali machine at the start of each term to check.

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
