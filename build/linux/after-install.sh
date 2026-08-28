#!/bin/bash

# The first half of this script is a verbatim copy of electron-builder's default
# after-install template (app-builder-lib/templates/linux/after-install.tpl).
# Passing a custom afterInstall REPLACES the default script rather than extending
# it, so everything the default did (binary symlink, chrome-sandbox permissions,
# AppArmor profile) has to be kept here. Re-check the template after an
# electron-builder upgrade.

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install apparmor profile. (Ubuntu 24+)
# First check if the version of AppArmor running on the device supports our profile.
# This is in order to keep backwards compatibility with Ubuntu 22.04 which does not support abi/4.0.
# In that case, we just skip installing the profile since the app runs fine without it on 22.04.
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# ---------------------------------------------------------------------------
# Karakuri Pad: device permissions.
#
# udev rules so unprivileged users can open the devices the app talks to:
# the Pico's serial port, a USB Pro Controller and the dongle identities
# (hidraw). TAG+="uaccess" grants the active seat on systemd systems; the
# 0666 mode is the fallback for everything else (the same approach Steam
# uses for its controller rules). The file number must stay below 73 so the
# uaccess tag is processed before 73-seat-late.rules.
mkdir -p /etc/udev/rules.d
cat > /etc/udev/rules.d/70-karakuri-pad.rules <<'KARAKURI_RULES'
# Karakuri Pad - device access for unprivileged users
# Raspberry Pi Pico: USB serial (settings transfer)
SUBSYSTEM=="tty", ATTRS{idVendor}=="2e8a", MODE="0666", TAG+="uaccess"
# Dongle in Pro Controller emulation: USB serial identity
SUBSYSTEM=="tty", ATTRS{idVendor}=="057e", MODE="0666", TAG+="uaccess"
# Pro Controller over USB (macro recording) and Pro Controller emulation
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", MODE="0666", TAG+="uaccess"
# Pico HID identities (SInput dongle etc.)
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", MODE="0666", TAG+="uaccess"
# Dongle in DualShock 4 emulation
KERNEL=="hidraw*", ATTRS{idVendor}=="054c", ATTRS{idProduct}=="05c4", MODE="0666", TAG+="uaccess"
# Dongle in Switch pad emulation (HORI-compatible identity)
KERNEL=="hidraw*", ATTRS{idVendor}=="0f0d", ATTRS{idProduct}=="0092", MODE="0666", TAG+="uaccess"
KARAKURI_RULES
if hash udevadm 2>/dev/null; then
    udevadm control --reload-rules || true
    udevadm trigger --subsystem-match=tty --subsystem-match=hidraw || true
fi

# BLE recording (noble) opens a raw HCI socket, which needs CAP_NET_RAW.
# Granting a file capability puts the binary into secure-execution mode, in
# which the loader ignores its $ORIGIN RUNPATH and libffmpeg.so no longer
# resolves - so the app directory is registered with ldconfig first. A path
# containing a space is handled correctly by ld.so.conf.d.
if hash setcap 2>/dev/null; then
    echo '/opt/${sanitizedProductName}' > /etc/ld.so.conf.d/karakuri-pad.conf
    if hash ldconfig 2>/dev/null; then ldconfig || true; fi
    setcap 'cap_net_raw+eip' '/opt/${sanitizedProductName}/${executable}' || true
else
    echo "setcap not found; Bluetooth recording needs: sudo setcap 'cap_net_raw+eip' '/opt/${sanitizedProductName}/${executable}'"
fi
