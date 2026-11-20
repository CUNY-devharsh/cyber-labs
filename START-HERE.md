# You are in Kali Linux

This machine runs Kali Linux Rolling 2026 on GitHub's servers. It is yours until you delete it.

## Use the terminal

The panel at the bottom of this page is a Kali terminal. If you do not see it, open the menu at the top left and choose Terminal, then New Terminal.

You are the user `kali`. The password is `kali`. `sudo` does not ask for a password.

| Command | What it does |
| --- | --- |
| `lab-info` | Shows the Kali version and which tools are installed |
| `lab-install` | Lists bigger tool sets you can add, such as Metasploit and Burp Suite |
| `sudo apt update && sudo apt install NAME` | Installs any other Kali package |

## Use the desktop

If you launched the desktop machine, the Kali desktop opens in a new browser tab.

If the tab did not open: click Ports in the bottom panel, hover over port 6080, and click the globe icon.

If the desktop is black or frozen: run `start-desktop --restart` in the terminal, then reload the desktop tab.

## Save your work

Keep lab files in the `labs` folder. Files stay when you stop the machine. Files are gone when you delete the machine, so download or commit anything you need first.

## Connect to TryHackMe (optional)

Use this only if your instructor asks for it. The Kali machine can join the TryHackMe lab network with your personal OpenVPN file.

1. On TryHackMe, download your OpenVPN configuration file. Its name ends in `.ovpn`.
2. Drag the file onto the `labs` folder in the Explorer panel of this page.
3. Move it to your home folder, then connect:

   ```
   mv labs/*.ovpn ~/
   sudo openvpn --config ~/*.ovpn
   ```

4. Leave that terminal open while you work, and open a second terminal for your tools. Press Ctrl+C in the first terminal to disconnect.

The file holds your personal TryHackMe login. Keep it in your home folder. Never commit it and never share it.

## Stop the machine when you finish

A running machine uses your free hours.

1. Go to https://github.com/codespaces
2. Open the menu at the end of this machine's row.
3. Choose Stop codespace.

Delete the machine after you submit the lab. Stored machines use your free storage.

## Rules

Scan and attack only the targets your instructor assigns, or machines you own. Never point these tools at college systems, GitHub, or other sites on the internet without written permission.
