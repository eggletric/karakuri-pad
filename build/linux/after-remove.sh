#!/bin/bash

# The first half of this script is a verbatim copy of electron-builder's default
# after-remove template (app-builder-lib/templates/linux/after-remove.tpl); a
# custom afterRemove replaces the default script, so its behaviour is kept here.
# Re-check the template after an electron-builder upgrade.

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

# Remove and unload apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi

# ---------------------------------------------------------------------------
# Karakuri Pad: remove the device-permission configuration.
#
# This script also runs while UPGRADING (deb passes "upgrade"; rpm passes "1",
# and rpm runs the OLD package's postun AFTER the new package's post), so the
# cleanup only runs on a real removal - otherwise it would strip the files the
# new version just installed. An unknown argument leaves the files behind,
# which is harmless: rules for absent devices, and ldconfig tolerates a conf
# entry pointing at a deleted directory.
case "$1" in
    remove|purge|0)
        rm -f /etc/udev/rules.d/70-karakuri-pad.rules
        if hash udevadm 2>/dev/null; then
            udevadm control --reload-rules || true
        fi
        rm -f /etc/ld.so.conf.d/karakuri-pad.conf
        if hash ldconfig 2>/dev/null; then ldconfig || true; fi
        ;;
esac
