/*
  Site settings. Edit this file to change courses, machines and wording.
  Nothing else needs to change for routine updates.
*/
window.LAB_CONFIG = {
  siteName: "Cyber Labs",
  college: "LaGuardia Community College",
  maintainer: "Devharsh Trivedi, MEC Department, LaGuardia Community College (CUNY)",

  /*
    Where the dev container files live. Leave both empty when the site is
    served from GitHub Pages: the page reads the owner and repository from its
    own address (OWNER.github.io/REPO). Fill them in only for a custom domain.
  */
  owner: "",
  repo: "",

  /* Codespaces machine names: basicLinux32gb is 2 cores, standardLinux32gb is 4 cores. */
  machines: {
    basicLinux32gb: { cores: 2, label: "2 cores, 8 GB memory" },
    standardLinux32gb: { cores: 4, label: "4 cores, 16 GB memory" }
  },

  /* Monthly Codespaces allowance in core hours: free personal account, and verified student. */
  freeCoreHours: 120,
  studentCoreHours: 180,

  /*
    status: "ready" shows no tag. "beta" shows a Beta tag that asks students to
    report problems. Switch a machine to "ready" after you have tested it.
  */
  environments: [
    {
      id: "kali-desktop",
      family: "kali",
      name: "Kali Linux desktop",
      summary: "The full Kali desktop in a browser tab, with Firefox, Wireshark and Zenmap. Kali Rolling 2026.",
      devcontainerPath: ".devcontainer/kali-desktop/devcontainer.json",
      machine: "basicLinux32gb",
      firstStart: "First start takes about 7 to 10 minutes. Later starts take about a minute.",
      signIn: "User kali, password kali",
      opens: "The desktop opens in a new tab.",
      status: "ready"
    },
    {
      id: "kali-terminal",
      family: "kali",
      name: "Kali Linux terminal",
      summary: "Kali command line tools only: nmap, hydra, john, hashcat, sqlmap, tshark and more. The fastest machine to start.",
      devcontainerPath: ".devcontainer/devcontainer.json",
      machine: "basicLinux32gb",
      firstStart: "First start takes about 4 to 6 minutes. Later starts take under a minute.",
      signIn: "User kali, no password needed",
      opens: "A Kali terminal opens in the page.",
      status: "ready"
    },
    {
      id: "win2019",
      family: "windows",
      name: "Windows Server 2019",
      summary: "Windows Server 2019 with the desktop, in a browser tab. The lightest Windows choice and the version MAC 233 teaches.",
      devcontainerPath: ".devcontainer/windows-server-2019/devcontainer.json",
      machine: "standardLinux32gb",
      altMachine: "basicLinux32gb",
      firstStart: "The first start downloads Windows (about 5 GB) and installs it by itself. Keep the tab open and plan for a long wait.",
      signIn: "User Docker, password admin",
      opens: "The Windows screen opens in a new tab.",
      status: "beta"
    },
    {
      id: "win2022",
      family: "windows",
      name: "Windows Server 2022",
      summary: "Windows Server 2022 with the desktop, in a browser tab.",
      devcontainerPath: ".devcontainer/windows-server-2022/devcontainer.json",
      machine: "standardLinux32gb",
      altMachine: "basicLinux32gb",
      firstStart: "The first start downloads Windows (about 6 GB) and installs it by itself. Keep the tab open and plan for a long wait.",
      signIn: "User Docker, password admin",
      opens: "The Windows screen opens in a new tab.",
      status: "beta"
    },
    {
      id: "win2025",
      family: "windows",
      name: "Windows Server 2025",
      summary: "The newest Windows Server. It is the largest download and needs the most disk space, so it is the most likely to run out of room.",
      devcontainerPath: ".devcontainer/windows-server-2025/devcontainer.json",
      machine: "standardLinux32gb",
      firstStart: "The first start downloads Windows (about 8 GB) and installs it by itself. Keep the tab open and plan for a long wait.",
      signIn: "User Docker, password admin",
      opens: "The Windows screen opens in a new tab.",
      status: "beta"
    }
  ],

  /*
    Courses. Titles come from the CUNY catalog. The environments list is the
    order in which machines are suggested for that course. Add a course by
    copying one block.
  */
  courses: [
    {
      id: "mac233",
      code: "MAC 233",
      title: "Windows NT Network Operating System",
      environments: ["win2019", "win2022", "win2025"]
    },
    {
      id: "mac237",
      code: "MAC 237",
      title: "Computer Security",
      environments: ["kali-desktop", "kali-terminal"]
    },
    {
      id: "mac246",
      code: "MAC 246",
      title: "Advanced Network Security",
      environments: ["kali-desktop", "kali-terminal", "win2019"]
    },
    {
      id: "mac247",
      code: "MAC 247",
      title: "Advanced Systems Security",
      environments: ["kali-desktop", "kali-terminal", "win2019"]
    }
  ]
};
