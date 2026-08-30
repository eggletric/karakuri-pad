// src/renderer/src/components/ConfigTab.jsx
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomSelect } from "./CustomSelect";
import SerialConsole from "./SerialConsole";
import { Card } from "./Card";
import { Modal } from "./Modal";
import { DongleTestModal } from "./DongleTestModal.jsx";
import { MacroManualModal } from "./MacroManualModal.jsx";
import { PaddleAssignModal, tokensToCodes, codeLabel, summariseCodes } from "./PaddleAssignModal.jsx";
import {
    IoEllipse,
    IoEllipseOutline,
    IoEye,
    IoEyeOff,
    IoSquareOutline,
    IoTriangleOutline,
} from "react-icons/io5";
import { showToast } from "./Toast.jsx";

const normalizeUsbId = (value) => (typeof value === "string" ? value.toLowerCase() : "");

// The DS4 face button symbols. As characters, the sizes of X, circle, square and triangle do
// not line up, so they are drawn with icons from one family (Ionicons outline) instead.
// Only X gets a hand-drawn SVG, because the IoClose family has a tight drawing area and looks
// small: it uses the same stroke width (viewBox 512 / stroke 32) and footprint as the others
const CrossIcon = () => (
    <svg
        width="1em"
        height="1em"
        viewBox="0 0 512 512"
        fill="none"
        stroke="currentColor"
        strokeWidth="32"
        strokeLinecap="round"
    >
        <line x1="80" y1="80" x2="432" y2="432" />
        <line x1="432" y1="80" x2="80" y2="432" />
    </svg>
);

const psFaceIcon = (Icon) => (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 15 }} aria-hidden>
        <Icon />
    </span>
);

// The candidates for the dongle's (DS4) C/GL/GR button mapping
const ds4MapOptions = (t) => [
    { value: "none", label: t("config.ds4MapNone") },
    { value: "touchpad", label: t("config.ds4MapTouchpad") },
    { value: "ps", label: "PS" },
    { value: "share", label: "SHARE" },
    { value: "options", label: "OPTIONS" },
    { value: "l1", label: "L1" },
    { value: "r1", label: "R1" },
    { value: "l2", label: "L2" },
    { value: "r2", label: "R2" },
    { value: "l3", label: "L3" },
    { value: "r3", label: "R3" },
    { value: "cross", label: psFaceIcon(CrossIcon) },
    { value: "circle", label: psFaceIcon(IoEllipseOutline) },
    { value: "square", label: psFaceIcon(IoSquareOutline) },
    { value: "triangle", label: psFaceIcon(IoTriangleOutline) },
];
// The list of valid values, used to validate an incoming ds4map (labels are not needed)
const DS4_MAP_VALUES = ds4MapOptions(() => "").map((o) => o.value);

// The candidates for the C/GL/GR mapping under usbmode=switch. The identity is a plain Switch
// pad, so the choices are exactly the buttons NSGamepad has (isValidSwitchToken in the firmware).
const switchMapOptions = (t) => [
    { value: "none", label: t("config.ds4MapNone") },
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "x", label: "X" },
    { value: "y", label: "Y" },
    { value: "l", label: "L" },
    { value: "r", label: "R" },
    { value: "zl", label: "ZL" },
    { value: "zr", label: "ZR" },
    { value: "plus", label: "+" },
    { value: "minus", label: "-" },
    { value: "home", label: "HOME" },
    { value: "capture", label: t("config.switchMapCapture") },
    { value: "lstick", label: "L3" },
    { value: "rstick", label: "R3" },
];
const SWITCH_MAP_VALUES = switchMapOptions(() => "").map((o) => o.value);
// The USB identities the firmware may present. It varies by mode, so accept all of them.
// (In dongle mode it enumerates as SInput / DS4 rather than as HORI.)
const FIRMWARE_USB_IDS = [
    { vid: "0f0d", pid: "0092" },   // HORI pad impersonation (bt / wifi mode)
    { vid: "2e8a", pid: "10c6" },   // SInput dongle
    { vid: "054c", pid: "05c4" },   // DualShock 4 dongle
    { vid: "057e", pid: "2009" },   // Pro Controller emulation dongle
];

const matchesFirmwareUsbIds = (port) => {
    const vid = normalizeUsbId(port.vendorId);
    const pid = normalizeUsbId(port.productId);
    return FIRMWARE_USB_IDS.some((e) => e.vid === vid && e.pid === pid);
};

export function ConfigTab() {
    const { t } = useTranslation();
    const bridge = typeof window !== "undefined" ? window.picoSerial : null;

    const [ports, setPorts] = useState([]);
    // A port that has only just appeared may not be openable yet, since the OS enumeration is
    // not settled, so the connect button stays disabled for 1.5 seconds after detection.
    // After a disconnect it is a slightly longer 2.5 seconds, to wait for the lock to be released
    const CONNECT_COOLDOWN_MS = 1500;
    const DISCONNECT_COOLDOWN_MS = 2500;
    const portFirstSeenRef = useRef(new Map());
    const portsPrimedRef = useRef(false);
    const [connectCooldownUntil, setConnectCooldownUntil] = useState(0);
    const [, setCooldownTick] = useState(0);
    const [selectedPath, setSelectedPath] = useState("");
    const [serialState, setSerialState] = useState({ open: false, path: "" });
    const serialStateRef = useRef(serialState);

    useEffect(() => {
        serialStateRef.current = serialState;
    }, [serialState]);

    // The mode. Bluetooth by default (it needs no Wi-Fi setup and is the easier one)
    const [mode, setMode] = useState("bt");
    const [btName, setBtName] = useState("");

    // The dongle's USB identity and, under DS4, the C/GL/GR mapping
    const [usbMode, setUsbMode] = useState("sinput");
    const [ds4MapC, setDs4MapC] = useState("touchpad");
    // The dongle macro recorder (FW: macro=on|off). While on, the C button is the recorder's
    // control button and is never forwarded to the host, so its DS4 mapping is meaningless.
    const [dongleMacro, setDongleMacro] = useState(false);
    // The same three assignments for usbmode=switch and usbmode=procon (FW: switchmap).
    // Kept separate from ds4map because the identities have entirely different button sets.
    const [swMapC, setSwMapC] = useState("none");
    // GL/GR are no longer per-identity tokens: the firmware stores one button mask per
    // paddle that applies in every usbmode (FW: glmap= / grmap=, "none" or "a+up" form).
    // The ds4map/switchmap GL/GR halves are written as none so an old value cannot
    // resurface if an assignment is later cleared.
    const [glMap, setGlMap] = useState("none");
    const [grMap, setGrMap] = useState("none");
    // Old firmware answers CFG GET without glmap=/grmap=; the paddle UI is hidden there
    const [paddleMapSupported, setPaddleMapSupported] = useState(false);
    const [paddleEditing, setPaddleEditing] = useState(null);   // "GL" | "GR" | null

    const [ssid, setSsid] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [ip, setIp] = useState("");
    const [port, setPort] = useState("5000");
    const [gateway, setGateway] = useState("");
    const [subnet, setSubnet] = useState("");

    const [busy, setBusy] = useState(false);
    // The mode the device is currently running in (read via CFG GET).
    // Writing settings that disagree with the form's mode prompts a restart and reconnect
    const [deviceMode, setDeviceMode] = useState(null);
    // Safety valve for the cover loading below: an old firmware that never answers
    // CFG GET would otherwise leave the settings panel covered forever
    const [cfgWaitExpired, setCfgWaitExpired] = useState(false);
    // True while handleOpen is in flight; pre-mounts the cover loading beneath the
    // disconnected overlay so their swap can never leave the panel exposed
    const [connecting, setConnecting] = useState(false);
    // The usbmode the device is currently running in. Tracked because changing the dongle's
    // gamepad flavour also changes the USB identity and therefore requires a restart
    const [deviceUsbMode, setDeviceUsbMode] = useState(null);
    // A counter used to clear SerialConsole's monitor
    const [serialClearSignal, setSerialClearSignal] = useState(0);
    const [showReconnectModal, setShowReconnectModal] = useState(false);
    const [showOpenFailedModal, setShowOpenFailedModal] = useState(false);
    const [showDongleTest, setShowDongleTest] = useState(false);
    const [showMacroManual, setShowMacroManual] = useState(false);
    const [openFailedMessage, setOpenFailedMessage] = useState("");

    const ds4MapSelectOptions = React.useMemo(() => ds4MapOptions(t), [t]);
    const switchMapSelectOptions = React.useMemo(() => switchMapOptions(t), [t]);

    // Port list and status polling
    useEffect(() => {
        if (!bridge) return;

        const fetchStatus = async () => {
            try {
                const [list, state] = await Promise.all([
                    bridge.listPorts(),
                    bridge.getState(),
                ]);

                const filteredPorts = (list || []).filter(matchesFirmwareUsbIds);

                // Record the detection time of newly appeared ports (ports in the very first
                // listing count as pre-existing and are not waited on). Ports that disappear are
                // forgotten, so a replug or restart counts as a fresh detection
                {
                    const seen = portFirstSeenRef.current;
                    const nowMs = Date.now();
                    for (const p of filteredPorts) {
                        if (!seen.has(p.path)) seen.set(p.path, portsPrimedRef.current ? nowMs : 0);
                    }
                    for (const key of [...seen.keys()]) {
                        if (!filteredPorts.some((p) => p.path === key)) seen.delete(key);
                    }
                    portsPrimedRef.current = true;
                }

                setPorts(filteredPorts);
                setSerialState(state || { open: false, path: "" });

                if (selectedPath && !filteredPorts.some((p) => p.path === selectedPath)) {
                    setSelectedPath(filteredPorts[0]?.path || "");
                }

                if (!selectedPath && filteredPorts && filteredPorts.length > 0) {
                    setSelectedPath(filteredPorts[0].path);
                }

                if (state?.path) {
                    const stillExists = filteredPorts.some((p) => p.path === state.path);
                    if (!stillExists && state.open) {
                        setSerialState({ open: false, path: "" });
                        // Same as onClosed: a stale deviceMode would defeat the cover loading
                        setDeviceMode(null);
                        setDeviceUsbMode(null);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };

        fetchStatus();
        const id = setInterval(fetchStatus, 2000);
        return () => clearInterval(id);
    }, [bridge, selectedPath]);

    useEffect(() => {
        if (!bridge) return;

        return () => {
            if (serialStateRef.current.open) {
                bridge.closePort().catch((e) => {
                    console.error("Failed to close the serial port (unmount):", e);
                });
            }
        };
    }, [bridge]);

    // Put the UI back to disconnected as soon as the serial port closes.
    // An unexpected close, e.g. the USB cable being pulled, is also announced with a toast.
    useEffect(() => {
        if (!bridge || typeof bridge.onClosed !== "function") return;
        const unsubscribe = bridge.onClosed((payload) => {
            setSerialState({ open: false, path: "" });
            setConnectCooldownUntil(Date.now() + DISCONNECT_COOLDOWN_MS);
            // Also forget the device state: leaving a stale deviceMode around would let the
            // next connect skip the cover loading and expose the form for a moment
            setDeviceMode(null);
            setDeviceUsbMode(null);
            if (!payload?.expected) {
                showToast(t("config.serialClosedUnexpected"), "error");
            }
        });
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, [bridge]);

    // The cover loading over the settings panel: shown from serial open until the
    // CFG GET reply fills the form (deviceMode). Gives up after 10s (see cfgWaitExpired)
    useEffect(() => {
        if (!(serialState.open && deviceMode === null)) {
            setCfgWaitExpired(false);
            return;
        }
        const timer = setTimeout(() => setCfgWaitExpired(true), 10000);
        return () => clearTimeout(timer);
    }, [serialState.open, deviceMode]);
    const cfgLoading =
        (connecting || serialState.open) && deviceMode === null && !cfgWaitExpired;

    // Serial input -> parse only the Wi-Fi config CURRENT line
    useEffect(() => {
        if (!bridge || typeof bridge.onData !== "function") return;

        let buffer = "";
        let collecting = false;
        let tmp = null; // { mode, btname, ssid, pass, ip, port, gateway, subnet }

        const handleLinesForConfig = (chunk) => {
            buffer += chunk;
            let idx;
            while ((idx = buffer.indexOf("\n")) !== -1) {
                let line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);

                if (line.endsWith("\r")) {
                    line = line.slice(0, -1);
                }

                const trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed === "[CFG] CURRENT") {
                    collecting = true;
                    tmp = {
                        mode: "bt", btname: "", usbmode: "sinput", ds4map: "", switchmap: "", macro: "off",
                        glmap: null, grmap: null,
                        ssid: "", pass: "", ip: "", port: "", gateway: "", subnet: "",
                    };
                    continue;
                }

                if (trimmed === "[CFG] CURRENT END") {
                    if (collecting && tmp) {
                        const parsedMode = tmp.mode === "wifi" ? "wifi" : tmp.mode === "dongle" ? "dongle" : "bt";
                        const parsedUsbMode =
                            tmp.usbmode === "ds4" ? "ds4"
                                : tmp.usbmode === "switch" ? "switch"
                                : tmp.usbmode === "procon" ? "procon"
                                : "sinput";
                        setDeviceMode(parsedMode);
                        setDeviceUsbMode(parsedUsbMode);
                        setMode(parsedMode);
                        setBtName(tmp.btname || "");
                        setUsbMode(parsedUsbMode);
                        {
                            const [c = "touchpad"] = (tmp.ds4map || "").split(",");
                            const valid = (v, fb) => DS4_MAP_VALUES.some((value) => value === v) ? v : fb;
                            setDs4MapC(valid(c, "touchpad"));
                        }
                        {
                            const [c = "none"] = (tmp.switchmap || "").split(",");
                            const valid = (v, fb) => SWITCH_MAP_VALUES.some((value) => value === v) ? v : fb;
                            setSwMapC(valid(c, "none"));
                        }
                        {
                            // Absent (null) means the firmware predates the feature. The
                            // device is also the other writer here -- the C+GL+GR gesture
                            // saves straight to flash -- so this re-read is what keeps the
                            // form in step with assignments made on the controller.
                            const supported = tmp.glmap !== null || tmp.grmap !== null;
                            setPaddleMapSupported(supported);
                            setGlMap(supported ? (tmp.glmap || "none") : "none");
                            setGrMap(supported ? (tmp.grmap || "none") : "none");
                        }
                        setDongleMacro(tmp.macro === "on");
                        setSsid(tmp.ssid || "");
                        setPassword(tmp.pass || "");
                        setIp(tmp.ip || "");
                        setPort(tmp.port || "5000");
                        setGateway(tmp.gateway || "");
                        setSubnet(tmp.subnet || "");
                    }
                    collecting = false;
                    tmp = null;
                    continue;
                }

                if (collecting && tmp) {
                    if (trimmed === "none") {
                        // When the Wi-Fi settings are unsaved. mode/btname arrive before this line
                        tmp.ssid = "";
                        tmp.pass = "";
                        tmp.ip = "";
                        tmp.port = "5000";
                        tmp.gateway = "";
                        tmp.subnet = "";
                    } else if (trimmed.startsWith("mode=")) {
                        tmp.mode = trimmed.substring(5).toLowerCase();
                    } else if (trimmed.startsWith("btname=")) {
                        tmp.btname = trimmed.substring(7);
                    } else if (trimmed.startsWith("usbmode=")) {
                        tmp.usbmode = trimmed.substring(8).toLowerCase();
                    } else if (trimmed.startsWith("ds4map=")) {
                        tmp.ds4map = trimmed.substring(7).toLowerCase();
                    } else if (trimmed.startsWith("switchmap=")) {
                        tmp.switchmap = trimmed.substring(10).toLowerCase();
                    } else if (trimmed.startsWith("glmap=")) {
                        tmp.glmap = trimmed.substring(6).toLowerCase();
                    } else if (trimmed.startsWith("grmap=")) {
                        tmp.grmap = trimmed.substring(6).toLowerCase();
                    } else if (trimmed.startsWith("macro=")) {
                        tmp.macro = trimmed.substring(6).toLowerCase();
                    } else if (trimmed.startsWith("ssid=")) {
                        tmp.ssid = trimmed.substring(5);
                    } else if (trimmed.startsWith("pass=")) {
                        tmp.pass = trimmed.substring(5);
                    } else if (trimmed.startsWith("ip=")) {
                        tmp.ip = trimmed.substring(3);
                    } else if (trimmed.startsWith("port=")) {
                        tmp.port = trimmed.substring(5);
                    } else if (trimmed.startsWith("gw=")) {
                        tmp.gateway = trimmed.substring(3);
                    } else if (trimmed.startsWith("sn=")) {
                        tmp.subnet = trimmed.substring(3);
                    }
                }
            }
        };

        const unsubscribe = bridge.onData((data) => {
            // On the Config side this is parsed purely for the IP settings
            handleLinesForConfig(data);
        });

        return () => {
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, [bridge]);

    useEffect(() => {
        if (!bridge || typeof bridge.onError !== "function") return;

        const unsubscribe = bridge.onError((message) => {
            showToast(message || t("config.serialError"), "error");
        });

        return () => {
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, [bridge]);

    const sendResetCommand = async () => {
        if (!bridge) return;
        try {
            await bridge.sendLine("RESET");
        } catch (e) {
            console.error(e);
            showToast(t("config.resetSendFailed", { error: e?.message || String(e) }), "error");
        }
    };

    const handleOpen = async () => {
        if (!bridge) {
            showToast(t("config.preloadMissing"), "error");
            return;
        }
        if (!selectedPath) {
            showToast(t("config.selectPortFirst"), "warning");
            return;
        }
        setBusy(true);
        // Lay the cover loading under the disconnected overlay right now, so the settings
        // panel is never exposed between that overlay lifting and the cover appearing
        setConnecting(true);
        try {
            await bridge.openPort(selectedPath);
            const state = await bridge.getState();
            setSerialState(state || { open: true, path: selectedPath });
            showToast(t("config.serialConnected", { path: selectedPath }), "success");
        } catch (e) {
            console.error(e);
            showToast(t("config.serialOpenFailed", { error: e?.message || String(e) }), "error");
            if (typeof e?.message === "string") {
                const lower = e.message.toLowerCase();
                if (lower.includes("cannot lock port") || lower.includes("resource temporarily unavailable")) {
                    setShowReconnectModal(true);
                } else if (lower.includes("resource busy") || lower.includes("cannot open")) {
                    setOpenFailedMessage(e.message);
                    setShowOpenFailedModal(true);
                }
            }
            setBusy(false);
            setConnecting(false);
            return;
        }

        // The open itself already succeeded. A failing RESET + CFG GET right after connecting
        // does not make it an "open failure" (it only warrants a warning toast)
        try {
            await sendResetCommand();
            await bridge.sendLine("CFG GET");
        } catch (e) {
            console.error(e);
            showToast(t("config.postOpenInitFailed", { error: e?.message || String(e) }), "warning");
        } finally {
            setBusy(false);
            // serialState.open keeps the cover up from here until the CFG GET reply lands
            setConnecting(false);
        }
    };

    const handleClose = async () => {
        if (!bridge) return;
        setBusy(true);
        try {
            await bridge.closePort();
            const state = await bridge.getState();
            setSerialState(state || { open: false, path: "" });
            showToast(t("config.serialDisconnected"), "info");
            setConnectCooldownUntil(Date.now() + DISCONNECT_COOLDOWN_MS);
            setDeviceMode(null);
            setDeviceUsbMode(null);
            setMode("bt");
            setBtName("");
            setUsbMode("sinput");
            setDs4MapC("touchpad");
            setDs4MapGL("none");
            setDs4MapGR("none");
            setSsid("");
            setPassword("");
            setIp("");
            setPort("5000");
            setGateway("");
            setSubnet("");
        } catch (e) {
            console.error(e);
            showToast(t("config.serialCloseFailed", { error: e?.message || String(e) }), "error");
        } finally {
            setBusy(false);
        }
    };

    const handleSendConfig = async () => {
        if (!bridge) {
            showToast(t("config.preloadMissing"), "error");
            return;
        }
        if (!serialState.open) {
            showToast(t("config.connectSerialFirst"), "warning");
            return;
        }

        if (mode === "wifi" && (!ssid.trim() || !ip.trim() || !gateway.trim() || !subnet.trim())) {
            showToast(t("config.wifiFieldsRequired"), "warning");
            return;
        }

        setBusy(true);
        // Clear the monitor as the write starts, so only this write's log is visible
        setSerialClearSignal((n) => n + 1);
        try {
            await bridge.sendWifiConfig({
                mode,
                btname: btName,
                usbmode: usbMode,
                // GL/GR are forced to none in the legacy tokens: glmap/grmap own the
                // paddles now, and a leftover token would come back the moment an
                // assignment is cleared
                ds4map: `${ds4MapC},none,none`,
                switchmap: `${swMapC},none,none`,
                ...(paddleMapSupported ? { glmap: glMap, grmap: grMap } : {}),
                macro: dongleMacro ? "on" : "off",
                ssid,
                password,
                ip,
                port,
                gateway,
                subnet,
            });
            // Besides a mode change, changing the dongle's gamepad flavour (usbmode) also changes
            // the USB identity, which means a restart and the end of this serial connection.
            // Both cases restart and disconnect automatically
            const identityChanged =
                (deviceMode && mode !== deviceMode) ||
                (mode === "dongle" && deviceUsbMode && usbMode !== deviceUsbMode);
            if (identityChanged) {
                await applyModeChange();
            } else {
                showToast(t("config.configSent"), "success");
            }
        } catch (e) {
            console.error(e);
            showToast(t("config.configSendFailed", { error: e?.message || String(e) }), "error");
        } finally {
            setBusy(false);
        }
    };

    // Apply a mode change: send RESET to restart the device, then disconnect cleanly from our
    // side and clear the monitor. After the restart the USB identity (VID/PID) changes and the
    // device comes back as a different one, so the port has to be picked again
    // (that is explained permanently just below the connection bar)
    const applyModeChange = async () => {
        try {
            await bridge.sendLine("RESET");
        } catch (e) {
            console.error("Failed to send RESET:", e);
        }
        try {
            await bridge.closePort();
        } catch (e) {
            console.error(e);
        }
        setSerialState({ open: false, path: "" });
        setSelectedPath("");
        setConnectCooldownUntil(Date.now() + DISCONNECT_COOLDOWN_MS);
        setDeviceMode(null);
        setDeviceUsbMode(null);
        setSerialClearSignal((n) => n + 1);
        showToast(t("config.configWrittenRebooted"), "success");
    };

    // Connect button cooldown: unavailable right after the selected port is detected, and right
    // after a disconnect. A tick re-renders to lift it once it expires
    const selectedFirstSeen = portFirstSeenRef.current.get(selectedPath) || 0;
    const connectBlockedUntil = Math.max(
        connectCooldownUntil,
        selectedFirstSeen > 0 ? selectedFirstSeen + CONNECT_COOLDOWN_MS : 0
    );
    const connectBlocked = Date.now() < connectBlockedUntil;
    useEffect(() => {
        const remain = connectBlockedUntil - Date.now();
        if (remain <= 0) return undefined;
        const timer = setTimeout(() => setCooldownTick((n) => n + 1), remain + 50);
        return () => clearTimeout(timer);
    }, [connectBlockedUntil]);

    if (!bridge) {
        return (
            <div className="config-root">
                <h3>Config</h3>
                <p>{t("config.electronOnly")}</p>
            </div>
        );
    }

    const statusLabel = serialState.open
        ? t("config.statusConnected")
        : t("config.statusDisconnected");

    const status = serialState.open
        ? "connected"
        : "disconnected";

    const statusDot = {
        connected: <IoEllipse />,
        disconnected: <IoEllipseOutline />,
    }[status];

    const selectedPortInfo = ports.find((p) => p.path === selectedPath);
    const selectedPortMeta = selectedPortInfo
        ? [
            selectedPortInfo.manufacturer,
            selectedPortInfo.serialNumber,
            selectedPortInfo.vendorId && selectedPortInfo.productId
                ? `VID:PID ${selectedPortInfo.vendorId}:${selectedPortInfo.productId}`
                : "",
        ]
            .filter(Boolean)
            .join(" / ")
        : "";

    return (
        <div className="config-root">
            <DongleTestModal
                open={showDongleTest}
                onClose={() => setShowDongleTest(false)}
                ds4Map={{ c: ds4MapC }}
                swMap={{ c: swMapC }}
                paddles={{ gl: tokensToCodes(glMap), gr: tokensToCodes(grMap) }}
            />
            <PaddleAssignModal
                open={paddleEditing !== null}
                paddle={paddleEditing || "GL"}
                value={paddleEditing === "GR" ? grMap : glMap}
                onCancel={() => setPaddleEditing(null)}
                onApply={(tokens) => {
                    if (paddleEditing === "GR") setGrMap(tokens);
                    else setGlMap(tokens);
                    setPaddleEditing(null);
                }}
            />
            <MacroManualModal
                open={showMacroManual}
                onClose={() => setShowMacroManual(false)}
            />
            {/* Left: connection settings (BT / Wi-Fi / dongle) */}
            <Modal
                open={showOpenFailedModal}
                onClose={() => setShowOpenFailedModal(false)}
                size="md"
                title={t("config.openFailedTitle")}
                footer={(
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            className="btn btn-primary btn--md"
                            onClick={() => setShowOpenFailedModal(false)}
                        >
                            {t("common.close")}
                        </button>
                    </div>
                )}
            >
                <p style={{ lineHeight: 1.6, margin: "12px 0 10px" }}>
                    {t("config.openFailedDesc")}
                </p>
                <div className="cfg-error-checks">
                    <div className="cfg-error-checks__item">{t("config.openFailedTip1")}</div>
                    <div className="cfg-error-checks__item">{t("config.openFailedTip2")}</div>
                </div>
                {openFailedMessage && (
                    <div className="cfg-error-detail">{openFailedMessage}</div>
                )}
            </Modal>
            <Modal
                open={showReconnectModal}
                onClose={() => setShowReconnectModal(false)}
                size="md"
                title={t("config.reconnectTitle")}
                footer={(
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            className="btn btn-primary btn--md"
                            onClick={() => setShowReconnectModal(false)}
                        >
                            {t("common.close")}
                        </button>
                    </div>
                )}
            >
                <p style={{ lineHeight: 1.6, margin: "12px 0 8px" }}>
                    {t("config.reconnectDesc")}
                </p>
            </Modal>

            <div className="config-header">
                {/* Connection bar (reuses the existing conn-bar-one / conn-status classes as-is) */}
                <div className="config-conn-bar">
                    <div className="conn-status">
                        <span style={{ marginTop: -5 }}>USB: {status} </span>
                        <span className={"status " + status}>{statusDot}</span>
                    </div>
                    <CustomSelect
                        disabled={status === 'connected'}
                        style={{ width: '100%', flexShrink: 1 }}
                        className="cfg-select"
                        value={selectedPath}
                        onChange={(next) => setSelectedPath(next)}
                        placeholder={t("config.portPlaceholder")}
                        options={ports.map((p) => ({
                            value: p.path,
                            label:
                                p.displayName ||
                                `${p.path} ${p.manufacturer ? `(${p.manufacturer})` : ""}`.trim(),
                        }))}
                        aria-label="Serial port select"
                    />

                    {(() => {
                        if (status === 'disconnected') {
                            return (
                                <button
                                    className="btn btn-primary btn--md"
                                    onClick={handleOpen}
                                    disabled={busy || !selectedPath || connectBlocked}
                                >
                                    {t("common.connect")}
                                </button>
                            )
                        }
                        return (
                            <button
                                className="btn btn-secondary btn--md"
                                onClick={handleClose}
                                disabled={busy || !serialState.open}
                            >
                                {t("common.disconnect")}
                            </button>
                        )
                    })()}
                </div>
                {/* What happens on a mode change is explained permanently (a write restarts the device automatically) */}
                <div className="config-conn-note">
                    {t("config.modeChangeNote")}
                </div>
            </div>
            <div className="config-container">
                {/* While disconnected, the settings panel and the serial monitor are disabled behind a translucent overlay */}
                {!serialState.open && (
                    <div className="config-disabled-overlay">
                        <span className="config-disabled-overlay__text">
                            {t("config.overlayConnectFirst")}
                        </span>
                    </div>
                )}
                <div className="config-left">
                    {/* The connection settings panel (BT / Wi-Fi / dongle switch).
                        A cover loading sits on top until the CFG GET reply fills the form */}
                    <div className="config-cover-host">
                    {cfgLoading && (
                        <div className="config-cover-loading">
                            <span className="spinner" />
                            <span>{t("config.waitingDeviceModeTitle")}</span>
                        </div>
                    )}
                    <Card
                        title={t("config.connectionSettings")}
                        headerStyle={{
                            padding: '12.5px 16px'
                        }}
                        footer={
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    height: 32,
                                    justifyContent: "center",
                                }}
                            >
                                <button
                                    className="btn btn--md"
                                    onClick={handleSendConfig}
                                    disabled={busy || !serialState.open || deviceMode === null}
                                    title={
                                        serialState.open && deviceMode === null
                                            ? t("config.waitingDeviceModeTitle")
                                            : undefined
                                    }
                                >
                                    {t("config.writeButton")}
                                </button>
                            </div>
                        }
                    >
                        <div className="cfg-field">
                            <label className="cfg-label">
                                {t("config.modeLabel")}
                            </label>
                            <div style={{ display: "flex", gap: 14, padding: "9px 0 4px 12px", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                                <label className="cfg-radio-label">
                                    <input
                                        type="radio"
                                        name="cfg-transport-mode"
                                        checked={mode === "bt"}
                                        onChange={() => setMode("bt")}
                                    />
                                    Bluetooth
                                </label>
                                <label className="cfg-radio-label">
                                    <input
                                        type="radio"
                                        name="cfg-transport-mode"
                                        checked={mode === "wifi"}
                                        onChange={() => setMode("wifi")}
                                    />
                                    Wi-Fi (TCP)
                                </label>
                                <label className="cfg-radio-label">
                                    <input
                                        type="radio"
                                        name="cfg-transport-mode"
                                        checked={mode === "dongle"}
                                        onChange={() => setMode("dongle")}
                                    />
                                    {t("config.modeDongle")}
                                </label>
                            </div>
                        </div>

                        {mode === "bt" ? (
                            <div className="cfg-field" style={{ marginBottom: 15 }}>
                                <label className="cfg-label">
                                    {t("config.deviceNameLabel")}
                                </label>
                                <input
                                    maxLength={29}
                                    className="form-control form-control--md cfg-input"
                                    value={btName}
                                    onChange={(e) => setBtName(e.target.value)}
                                    placeholder={t("config.deviceNamePlaceholder")}
                                />
                            </div>
                        ) : mode === "dongle" ? (
                            <>
                                <div className="cfg-field">
                                    <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                                        {t("config.dongleDesc")}
                                    </div>
                                </div>
                                <div className="cfg-field">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                        <label className="cfg-label" style={{ margin: 0 }}>
                                            {t("config.usbModeLabel")}
                                        </label>
                                        {/* The dongle is a USB device on the PC side, so it can be tested directly over WebHID */}
                                        <button
                                            className="btn btn--sm"
                                            onClick={() => setShowDongleTest(true)}
                                        >
                                            {t("config.dongleTestButton")}
                                        </button>
                                    </div>
                                    {/* Short labels on one row; only the selected flavour's detail is shown below,
                                        which keeps the panel from growing a line per choice */}
                                    <div style={{ display: "flex", gap: 16, padding: "9px 0 4px 12px", flexWrap: "wrap" }}>
                                        {[
                                            ["sinput", t("config.usbModeSinput")],
                                            ["ds4", t("config.usbModeDs4")],
                                            ["switch", t("config.usbModeSwitch")],
                                            ["procon", t("config.usbModeProcon")],
                                        ].map(([value, label]) => (
                                            <label key={value} className="cfg-radio-label">
                                                <input
                                                    type="radio"
                                                    name="cfg-usb-mode"
                                                    checked={usbMode === value}
                                                    onChange={() => setUsbMode(value)}
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                                        {t(usbMode === "ds4" ? "config.usbModeDs4Desc"
                                            : usbMode === "switch" ? "config.usbModeSwitchDesc"
                                            : usbMode === "procon" ? "config.usbModeProconDesc"
                                            : "config.usbModeSinputDesc")}<br />
                                        {t("config.dongleCalibrationNote")}
                                    </div>
                                </div>
                                <div className="cfg-field">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                        <label className="cfg-radio-label">
                                            <input
                                                type="checkbox"
                                                checked={dongleMacro}
                                                onChange={(e) => setDongleMacro(e.target.checked)}
                                            />
                                            {t("config.dongleMacroToggle")}
                                        </label>
                                        <button
                                            className="btn btn--sm"
                                            onClick={() => setShowMacroManual(true)}
                                        >
                                            {t("macroManual.button")}
                                        </button>
                                    </div>
                                </div>
                                {(usbMode === "switch" || usbMode === "procon") && (
                                    <div className="cfg-field" style={{ marginBottom: 15 }}>
                                        {/* Same rule as under DS4: while the macro recorder is on, C is its control
                                            button and never reaches the host, so only the note is shown */}
                                        {dongleMacro ? (
                                            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                                                {t("config.dongleMacroDs4Note")}
                                            </div>
                                        ) : (
                                            <div style={{ maxWidth: 180 }}>
                                                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>
                                                    {t("config.cMapLabel")}
                                                </div>
                                                <CustomSelect
                                                    dense
                                                    dropUp
                                                    value={swMapC}
                                                    onChange={setSwMapC}
                                                    options={switchMapSelectOptions}
                                                    aria-label="C button mapping"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {usbMode === "ds4" && (
                                    <div className="cfg-field" style={{ marginBottom: 15 }}>
                                        {/* While the macro recorder is on, C is the recorder's control button and
                                            its mapping would never take effect, so only the note is shown */}
                                        {dongleMacro ? (
                                            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                                                {t("config.dongleMacroDs4Note")}
                                            </div>
                                        ) : (
                                            <div style={{ maxWidth: 180 }}>
                                                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>
                                                    {t("config.cMapLabel")}
                                                </div>
                                                <CustomSelect
                                                    dense
                                                    dropUp
                                                    value={ds4MapC}
                                                    onChange={setDs4MapC}
                                                    options={ds4MapSelectOptions}
                                                    aria-label="C button mapping"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* GL/GR: one assignment per paddle, shared by every usbmode
                                    (the firmware stores a button mask, not a per-identity token),
                                    so this sits outside the ds4 / switch blocks above and shows
                                    for sinput too. Hidden on firmware that has no glmap/grmap. */}
                                {paddleMapSupported && (
                                    <div className="cfg-field" style={{ marginBottom: 15 }}>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            {[
                                                { key: "GL", value: glMap },
                                                { key: "GR", value: grMap },
                                            ].map(({ key, value }) => {
                                                const codes = tokensToCodes(value);
                                                // Only a fixed number of slots, so the row cannot grow past one line.
                                                // The full list is on the button's tooltip and in the modal.
                                                const { shown, overflow } = summariseCodes(codes);
                                                return (
                                                    <div key={key} className="paddle-field">
                                                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>
                                                            {t("paddleAssign.current", { paddle: key })}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="btn btn--sm paddle-btn"
                                                            onClick={() => setPaddleEditing(key)}
                                                            aria-label={`${key} button assignment`}
                                                            title={codes.length ? codes.map(codeLabel).join(" + ") : undefined}
                                                        >
                                                            {codes.length === 0 ? (
                                                                <span className="paddle-btn__none">
                                                                    {t("paddleAssign.none")}
                                                                </span>
                                                            ) : (
                                                                <span className="paddle-btn__chips">
                                                                    {shown.map((code) => (
                                                                        <span key={code} className="paddle-btn__chip">
                                                                            {codeLabel(code)}
                                                                        </span>
                                                                    ))}
                                                                    {overflow > 0 && (
                                                                        <span className="paddle-btn__chip paddle-btn__chip--more">
                                                                            {`+${overflow}`}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="cfg-field">
                                    <label className="cfg-label">
                                        SSID
                                    </label>
                                    <input
                                        className="form-control form-control--md cfg-input"
                                        value={ssid}
                                        onChange={(e) => setSsid(e.target.value)}
                                    />
                                </div>

                                <div className="cfg-field">
                                    <label className="cfg-label">
                                        Password
                                    </label>
                                    <div className="password-field">
                                        <input
                                            className="form-control form-control--md cfg-input"
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() => setShowPassword((v) => !v)}
                                            aria-label={showPassword ? t("config.hidePassword") : t("config.showPassword")}
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <IoEyeOff /> : <IoEye />}
                                        </button>
                                    </div>
                                </div>

                                <div className="cfg-field">
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <div style={{ flex: 2, minWidth: 0 }}>
                                            <label className="cfg-label">
                                                IP
                                            </label>
                                            <input
                                                className="form-control form-control--md cfg-input"
                                                value={ip}
                                                onChange={(e) => setIp(e.target.value)}
                                                placeholder="192.168.1.190"
                                            />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <label className="cfg-label">
                                                {t("config.portLabel")}
                                            </label>
                                            <input
                                                className="form-control form-control--md cfg-input"
                                                value={port}
                                                onChange={(e) => setPort(e.target.value)}
                                                placeholder="5000"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="cfg-field" style={{ marginBottom: 15 }}>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <label className="cfg-label">
                                                Gateway
                                            </label>
                                            <input
                                                className="form-control form-control--md cfg-input"
                                                value={gateway}
                                                onChange={(e) => setGateway(e.target.value)}
                                                placeholder="192.168.1.1"
                                            />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <label className="cfg-label">
                                                Subnet
                                            </label>
                                            <input
                                                className="form-control form-control--md cfg-input"
                                                value={subnet}
                                                onChange={(e) => setSubnet(e.target.value)}
                                                placeholder="255.255.255.0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                    </Card>
                    </div>
                </div>

                {/* Right: the serial monitor (xterm) */}
                <div className="config-right">
                    <SerialConsole
                        bridge={bridge}
                        serialState={serialState}
                        onReset={sendResetCommand}
                        clearSignal={serialClearSignal}
                    />
                </div>
            </div>
        </div>
    );
}

