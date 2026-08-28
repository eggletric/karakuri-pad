# Karakuri Pad

An Electron app that turns a Raspberry Pi Pico W / Pico 2 W into a Nintendo Switch
controller, driving **button input, macros and controller passthrough over Bluetooth
(BLE) or Wi-Fi**.

- Drive the console directly from the on-screen controller UI
- Build macros by drag & drop and loop them (for idle farming)
- **Record Pro Controller input** and turn it into a macro (timing is reproduced too)
- **Switch 2 Pro Controller (BLE) support** — both recording and passthrough
- Passthrough: forward your own controller input straight to the console
- Connect to the Pico over Bluetooth (default, no router needed) or Wi-Fi (TCP)
- **Dongle mode**: turn a Pro Controller 2 into a USB gamepad for PC / Mac or the
  Switch itself (SInput / DualShock 4 / Switch / Pro Controller). Once flashed no app
  is needed. Gyro and rumble keep working in every identity except Switch, C/GL/GR are
  supported everywhere (assignable where the identity lacks them), and a standalone
  macro recorder records and replays input on the controller alone
- Firmware flashing and connection setup are done inside the app
- The UI is available in Japanese and English (toggle at the bottom left; defaults to
  the OS language)

The firmware lives in a separate repository:
[karakuri-firmware](https://github.com/eggletric/karakuri-firmware)

## Requirements

| | |
|---|---|
| Raspberry Pi Pico W or Pico 2 W | Required. Connects to the console over USB |
| 2.4GHz Wi-Fi | Optional. Only for Wi-Fi connections (PC and Pico on the same LAN). Not needed over Bluetooth |
| Switch Pro Controller (USB) / Switch 2 Pro Controller (BLE) | Optional. Used for recording and passthrough |
| HDMI capture device | Optional. Used for the screen preview |

## Setup

1. **Install tab**: connect the Pico in BOOTSEL mode and flash the firmware
   (Pico W / Pico 2 W are detected automatically)
2. **Config tab**: set the mode over USB serial (Bluetooth by default; the device name
   can be changed too. For Wi-Fi, set the SSID / password / static IP; for dongle mode,
   set the USB identity, the C/GL/GR mapping and the standalone macro recorder)
3. Connect the Pico to the Switch and connect from the bar at the top right (over
   Bluetooth, just pick the device from the scan results)
4. Drive it from the Controller / Macro tabs

## Installation

Grab the build for your platform from the
[latest release](https://github.com/eggletric/karakuri-pad/releases/latest). The app checks
for updates on startup and offers them in the header; the download itself only starts when you
click it.

| | Download |
|---|---|
| macOS (Apple Silicon) | [`karakuri-pad-mac-arm64.dmg`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-mac-arm64.dmg) — signed and notarized |
| macOS (Intel) | [`karakuri-pad-mac-x64.dmg`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-mac-x64.dmg) |
| Windows (x64) | [`karakuri-pad-setup-x64.exe`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-setup-x64.exe) |
| Windows (arm64) | [`karakuri-pad-setup-arm64.exe`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-setup-arm64.exe) |
| Linux (AppImage) | [`x86_64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-x86_64.AppImage) / [`arm64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-arm64.AppImage) |
| Linux (deb) | [`amd64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-amd64.deb) / [`arm64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-arm64.deb) |
| Linux (rpm) | [`x86_64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-x86_64.rpm) / [`aarch64`](https://github.com/eggletric/karakuri-pad/releases/latest/download/karakuri-pad-linux-aarch64.rpm) |

These links always resolve to the latest release, because the file names carry no version
number. The Linux arch suffixes differ per package format — that is electron-builder following
each ecosystem's own naming convention.

**Windows builds are unsigned**, so SmartScreen shows a warning on first run. Choose "More
info" and then "Run anyway" if you are happy to. There is no code signing certificate behind
this project.

On **Linux**, talking to the hardware needs a few permissions. The **deb and rpm packages set
everything up automatically on install**: udev rules for the serial port and the HID devices,
and `CAP_NET_RAW` on the binary for Bluetooth (plus the `ld.so.conf.d` entry that capability
requires, since secure-execution mode disables the binary's `$ORIGIN` RUNPATH).

The **AppImage** cannot run install scripts, so there:

- Serial and HID: save the rules below as `/etc/udev/rules.d/70-karakuri-pad.rules`, then run
  `sudo udevadm control --reload-rules && sudo udevadm trigger`. (For serial alone, membership
  in the `dialout` group also works.)
- Bluetooth (the Pico link and Pro Controller 2 recording) needs `CAP_NET_RAW`, which an
  AppImage cannot carry across its FUSE mount — use the deb or rpm package if you need the
  Bluetooth features.

```
# Karakuri Pad - device access for unprivileged users
SUBSYSTEM=="tty", ATTRS{idVendor}=="2e8a", MODE="0666", TAG+="uaccess"
SUBSYSTEM=="tty", ATTRS{idVendor}=="057e", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="054c", ATTRS{idProduct}=="05c4", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="0f0d", ATTRS{idProduct}=="0092", MODE="0666", TAG+="uaccess"
```

## Development

```bash
yarn install
yarn dev            # Vite + Electron
yarn dist           # build and package for the current platform (no publishing)
yarn dist:mac       # a single platform: dist:mac / dist:win / dist:linux
yarn build:icons    # regenerate build/icon*.png from design/icon.png (macOS only)
```

Releases are built by CI and published from a tag. See [docs/RELEASE.md](docs/RELEASE.md).

If `yarn dev` fails with `Could not locate the bindings file` for node-hid, its compiled
binary was lost to a dependency reinstall — `npm rebuild node-hid` restores it (or
`yarn prebuilds:restore` when downloading is not an option).

## Notes

- This is an **unofficial tool** and is not affiliated with Nintendo
- **Automation in online play risks having your account suspended.** Please keep usage
  to offline, solo play
- Use at your own risk

## License

MIT

## Author

Developed by [Eggletric](https://github.com/eggletric) — the team behind
[DiffyPick](https://diffy-pick.com/), a visual diff & pick tool for database schemas.
