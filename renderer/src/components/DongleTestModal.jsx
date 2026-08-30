import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.jsx";
import { Procon2View } from "./Procon2View.jsx";

// A tester that reads the dongle (SInput / DualShock 4 / Switch / Pro Controller) directly
// over WebHID and shows the input and IMU data the host actually receives. Rumble is driven
// through an output report. The dongle is a USB device on the PC side, so neither the Pico
// link nor serial is involved. Buttons and sticks are displayed through Procon2View (hardware
// layout), so every identity is normalised to Pro Controller button codes.

const SINPUT = { vendorId: 0x2e8a, productId: 0x10c6 };
const DS4 = { vendorId: 0x054c, productId: 0x05c4 };
// The HORI-compatible Switch pad (usbmode=switch). The same VID/PID is presented by a Pico in
// bt/wifi mode — indistinguishable on USB — but grabbing one of those just shows no input,
// which is acceptable for a tester.
const SWITCH = { vendorId: 0x0f0d, productId: 0x0092 };
// usbmode=procon impersonates a real Pro Controller down to the protocol, so a genuine
// Pro Controller matches too — also acceptable for a tester (it simply shows its input).
const PROCON = { vendorId: 0x057e, productId: 0x2009 };

// SInput report 0x01: [byte index, mask, Pro Controller button code]
const SINPUT_BUTTON_BITS = [
    [0, 0x01, "B"], [0, 0x02, "A"], [0, 0x04, "Y"], [0, 0x08, "X"],
    [1, 0x01, "LSTICK"], [1, 0x02, "RSTICK"],
    [1, 0x04, "L"], [1, 0x08, "R"], [1, 0x10, "ZL"], [1, 0x20, "ZR"],
    [1, 0x40, "GL"], [1, 0x80, "GR"],
    [2, 0x01, "PLUS"], [2, 0x02, "MINUS"], [2, 0x04, "HOME"], [2, 0x08, "CAPTURE"],
    [3, 0x02, "C"],
];
const SINPUT_DPAD_BITS = [
    [0x10, "UP"], [0x20, "DOWN"], [0x40, "LEFT"], [0x80, "RIGHT"],
];

// DS4 -> Pro Controller physical positions (the hardware is a Pro Controller 2, so match by position)
const DS4_BUTTON_BITS = [
    [4, 0x10, "Y"],       // □ (west)
    [4, 0x20, "B"],       // ✕ (south)
    [4, 0x40, "A"],       // ○ (east)
    [4, 0x80, "X"],       // △ (north)
    [5, 0x01, "L"], [5, 0x02, "R"], [5, 0x04, "ZL"], [5, 0x08, "ZR"],
    [5, 0x10, "MINUS"], [5, 0x20, "PLUS"],
    [5, 0x40, "LSTICK"], [5, 0x80, "RSTICK"],
    [6, 0x01, "HOME"], [6, 0x02, "CAPTURE"],
];

// DS4 hat value -> a set of directions (8 = neutral)
const DS4_HAT_DIRS = [
    ["UP"], ["UP", "RIGHT"], ["RIGHT"], ["DOWN", "RIGHT"],
    ["DOWN"], ["DOWN", "LEFT"], ["LEFT"], ["UP", "LEFT"],
];

// NSGamepad (the HORI-compatible Switch pad) input report: no report ID, 8 bytes.
// byte0-1: 14 buttons (uint16 LE, bit order = the NSButton enum in switch_tinyusb.h)
// byte2: hat (0-7, neutral otherwise) / byte3-6: LX LY RX RY (0-255, y positive downwards)
const SWITCH_BUTTON_BITS = [
    [0x0001, "Y"], [0x0002, "B"], [0x0004, "A"], [0x0008, "X"],
    [0x0010, "L"], [0x0020, "R"], [0x0040, "ZL"], [0x0080, "ZR"],
    [0x0100, "MINUS"], [0x0200, "PLUS"], [0x0400, "LSTICK"], [0x0800, "RSTICK"],
    [0x1000, "HOME"], [0x2000, "CAPTURE"],
];

// Pro Controller input report 0x30 (the same layout a real Pro Controller streams):
// [0]=timer [1]=battery [2]=right buttons [3]=shared [4]=left buttons+dpad
// [5-10]=two 12-bit-packed sticks [12..47]=3 IMU frames of accel[3]+gyro[3] (s16 LE)
const PROCON_BUTTON_BITS = [
    [2, 0x01, "Y"], [2, 0x02, "X"], [2, 0x04, "B"], [2, 0x08, "A"],
    [2, 0x40, "R"], [2, 0x80, "ZR"],
    [3, 0x01, "MINUS"], [3, 0x02, "PLUS"], [3, 0x04, "RSTICK"], [3, 0x08, "LSTICK"],
    [3, 0x10, "HOME"], [3, 0x20, "CAPTURE"],
    [4, 0x40, "L"], [4, 0x80, "ZL"],
];
const PROCON_DPAD_BITS = [
    [0x01, "DOWN"], [0x02, "UP"], [0x04, "RIGHT"], [0x08, "LEFT"],
];

// switchmap token -> the button code it lands on. On the switch/procon identities C/GL/GR
// arrive as their assigned buttons, so this lights the C/GL/GR indicators up by reverse lookup
// (the assigned button lights up too, same accepted blur as the DS4 side).
const SWITCHMAP_TOKEN_CODE = {
    a: "A", b: "B", x: "X", y: "Y", l: "L", r: "R", zl: "ZL", zr: "ZR",
    plus: "PLUS", minus: "MINUS", home: "HOME", capture: "CAPTURE",
    lstick: "LSTICK", rstick: "RSTICK",
};
function applySwitchmapReverse(out, swMap) {
    if (!swMap) return;
    const target = SWITCHMAP_TOKEN_CODE[swMap.c];
    if (target && out.buttons.has(target)) out.buttons.add("C");
}

// GL/GR are not per-identity tokens but one button mask each (FW: glmap= / grmap=),
// and every parser above normalises to Pro Controller codes, so one reverse lookup
// covers all four identities. A paddle lights up only when its whole combination is
// down, since that is the only evidence the report carries.
function applyPaddleReverse(out, paddles) {
    if (!paddles) return;
    for (const [code, codes] of [["GL", paddles.gl], ["GR", paddles.gr]]) {
        if (!codes || codes.length === 0) continue;
        if (codes.every((c) => out.buttons.has(c) || out.dpad.has(c))) out.buttons.add(code);
    }
}

// ds4map token -> bit position in the DS4 report. Used to light up C/GL/GR by reverse lookup.
// Each bit is shared with a physical button (e.g. touchpad=capture), so pressing the physical
// button it was mapped from lights C/GL/GR up as well — acceptable for a tester
const DS4_TOKEN_BITS = {
    touchpad: [6, 0x02], ps: [6, 0x01],
    share: [5, 0x10], options: [5, 0x20],
    l1: [5, 0x01], r1: [5, 0x02], l2: [5, 0x04], r2: [5, 0x08],
    l3: [5, 0x40], r3: [5, 0x80],
    square: [4, 0x10], cross: [4, 0x20], circle: [4, 0x40], triangle: [4, 0x80],
};

function emptyInput() {
    return {
        buttons: new Set(),
        dpad: new Set(),
        // Procon2View's coordinate system (0-255, centre 128, y positive downwards)
        sticks: { L: { x: 128, y: 128 }, R: { x: 128, y: 128 } },
        accel: [0, 0, 0],
        gyro: [0, 0, 0],
    };
}

// s16 (negative is up) -> 0-255 (small is up)
function s16To255(v) {
    return 128 + (v / 32767) * 127;
}

function parseSInput(dv, out) {
    const b = [dv.getUint8(2), dv.getUint8(3), dv.getUint8(4), dv.getUint8(5)];
    out.buttons = new Set(
        SINPUT_BUTTON_BITS.filter(([bi, mask]) => b[bi] & mask).map(([, , code]) => code)
    );
    out.dpad = new Set(
        SINPUT_DPAD_BITS.filter(([mask]) => b[0] & mask).map(([, dir]) => dir)
    );
    out.sticks = {
        L: { x: s16To255(dv.getInt16(6, true)), y: s16To255(dv.getInt16(8, true)) },
        R: { x: s16To255(dv.getInt16(10, true)), y: s16To255(dv.getInt16(12, true)) },
    };
    for (let i = 0; i < 3; i++) {
        out.accel[i] = dv.getInt16(22 + i * 2, true) / 4096;      // → g
        out.gyro[i] = dv.getInt16(28 + i * 2, true) / 14.286;     // → dps
    }
}

function parseDS4(dv, out, ds4Map) {
    const bytes = [0, 0, 0, 0, dv.getUint8(4), dv.getUint8(5), dv.getUint8(6)];
    out.buttons = new Set(
        DS4_BUTTON_BITS.filter(([bi, mask]) => bytes[bi] & mask).map(([, , code]) => code)
    );
    // C is lit by reverse lookup from the bit it is mapped to (ds4map)
    if (ds4Map) {
        const bit = DS4_TOKEN_BITS[ds4Map.c];
        if (bit && (bytes[bit[0]] & bit[1])) out.buttons.add("C");
    }
    const hat = dv.getUint8(4) & 0x0f;
    out.dpad = new Set(hat < 8 ? DS4_HAT_DIRS[hat] : []);
    // DS4 is already 0-255 with y positive downwards
    out.sticks = {
        L: { x: dv.getUint8(0), y: dv.getUint8(1) },
        R: { x: dv.getUint8(2), y: dv.getUint8(3) },
    };
    for (let i = 0; i < 3; i++) {
        out.gyro[i] = dv.getInt16(12 + i * 2, true) / 16.384;     // → dps
        out.accel[i] = dv.getInt16(18 + i * 2, true) / 8192;      // → g
    }
}

function parseSwitch(dv, out, swMap) {
    const btns = dv.getUint16(0, true);
    out.buttons = new Set(SWITCH_BUTTON_BITS.filter(([mask]) => btns & mask).map(([, code]) => code));
    applySwitchmapReverse(out, swMap);
    const hat = dv.getUint8(2);
    out.dpad = new Set(hat < 8 ? DS4_HAT_DIRS[hat] : []);
    out.sticks = {
        L: { x: dv.getUint8(3), y: dv.getUint8(4) },
        R: { x: dv.getUint8(5), y: dv.getUint8(6) },
    };
    // This identity has no IMU; accel/gyro stay at zero
}

function parseProcon(dv, out, swMap) {
    const bytes = [0, 0, dv.getUint8(2), dv.getUint8(3), dv.getUint8(4)];
    out.buttons = new Set(PROCON_BUTTON_BITS.filter(([bi, mask]) => bytes[bi] & mask).map(([, , code]) => code));
    applySwitchmapReverse(out, swMap);
    out.dpad = new Set(PROCON_DPAD_BITS.filter(([mask]) => bytes[4] & mask).map(([, dir]) => dir));
    // Sticks are 12-bit with centre 2048, up and right larger -> scale to 0-255 and flip Y
    const lx = dv.getUint8(5) | ((dv.getUint8(6) & 0x0f) << 8);
    const ly = (dv.getUint8(6) >> 4) | (dv.getUint8(7) << 4);
    const rx = dv.getUint8(8) | ((dv.getUint8(9) & 0x0f) << 8);
    const ry = (dv.getUint8(9) >> 4) | (dv.getUint8(10) << 4);
    const to255 = (v) => Math.max(0, Math.min(255, v / 16.06));
    out.sticks = {
        L: { x: to255(lx), y: 255 - to255(ly) },
        R: { x: to255(rx), y: 255 - to255(ry) },
    };
    // First of the three IMU frames. Pro Controller scale: accel 4096 LSB/g, gyro 16.4 LSB/dps
    for (let i = 0; i < 3; i++) {
        out.accel[i] = dv.getInt16(12 + i * 2, true) / 4096;
        out.gyro[i] = dv.getInt16(18 + i * 2, true) / 16.4;
    }
}

// 0-255 -> -1..1 (positive is up), for the numeric display
function normStick(p) {
    return { x: (p.x - 128) / 127, y: -(p.y - 128) / 127 };
}

// Always show the sign and a fixed number of digits (so the width does not jump and collide with its neighbour)
function fmtStick(v) {
    return (v < 0 ? "" : "+") + v.toFixed(2);
}

function ImuRow({ label, values, unit, max, dominant }) {
    return (
        <div className="dongle-imu-row">
            <span className="dongle-imu-row__name">{label}</span>
            {["X", "Y", "Z"].map((axis, i) => {
                const v = values[i];
                const ratio = Math.max(-1, Math.min(1, v / max));
                return (
                    <span
                        key={axis}
                        className={`dongle-imu-cell${dominant === i ? " is-dominant" : ""}`}
                    >
                        <span className="dongle-imu-cell__axis">{axis}</span>
                        <span className="dongle-imu-cell__bar">
                            <span
                                className="dongle-imu-cell__fill"
                                style={
                                    ratio >= 0
                                        ? { left: "50%", width: `${ratio * 50}%` }
                                        : { left: `${50 + ratio * 50}%`, width: `${-ratio * 50}%` }
                                }
                            />
                        </span>
                        <span className="dongle-imu-cell__val">{v.toFixed(1)}{unit}</span>
                    </span>
                );
            })}
        </div>
    );
}

// The axis with the largest absolute value above the threshold (i.e. which axis dominates). -1 if there is none
function dominantAxis(values, threshold) {
    let idx = -1;
    let maxAbs = threshold;
    for (let i = 0; i < 3; i++) {
        if (Math.abs(values[i]) > maxAbs) {
            maxAbs = Math.abs(values[i]);
            idx = i;
        }
    }
    return idx;
}

// ds4Map / swMap: the C mapping from the settings screen ({ c }), for the reverse-lookup
// lighting under the DS4 and switch/procon identities respectively.
// paddles: the GL/GR assignments as arrays of Pro Controller codes ({ gl: [...], gr: [...] }),
// which are identity-independent and so light up the same way everywhere
export function DongleTestModal({ open, onClose, ds4Map, swMap, paddles }) {
    // Read through refs so changes made after connecting are picked up
    const ds4MapRef = React.useRef(ds4Map);
    React.useEffect(() => {
        ds4MapRef.current = ds4Map;
    }, [ds4Map]);
    const swMapRef = React.useRef(swMap);
    React.useEffect(() => {
        swMapRef.current = swMap;
    }, [swMap]);
    const paddlesRef = React.useRef(paddles);
    React.useEffect(() => {
        paddlesRef.current = paddles;
    }, [paddles]);
    const { t } = useTranslation();
    const [device, setDevice] = React.useState(null);
    const [identity, setIdentity] = React.useState(null);   // "sinput" | "ds4"
    const [searching, setSearching] = React.useState(false);
    const [error, setError] = React.useState("");
    const [input, setInput] = React.useState(emptyInput);
    const [rumbling, setRumbling] = React.useState(null);   // "left" | "right" | "both"

    // Calling setState for every report at 133Hz is expensive, so the latest value is kept in a
    // ref and pushed to the display at 30fps
    const latestRef = React.useRef(emptyInput());
    const deviceRef = React.useRef(null);

    const disconnect = React.useCallback(async () => {
        const dev = deviceRef.current;
        deviceRef.current = null;
        if (dev) {
            try {
                dev.oninputreport = null;
                await dev.close();
            } catch { /* already closed */ }
        }
        setDevice(null);
        setIdentity(null);
        setInput(emptyInput());
        setRumbling(null);
    }, []);

    const connect = React.useCallback(async () => {
        setSearching(true);
        setError("");
        try {
            if (!navigator.hid) throw new Error(t("dongleTest.webhidUnavailable"));
            // Look at already-permitted devices first. If there are none, request permission (main auto-selects)
            const matches = (d, id) => d.vendorId === id.vendorId && d.productId === id.productId;
            let devices = await navigator.hid.getDevices();
            let dev = devices.find((d) => matches(d, SINPUT) || matches(d, DS4) || matches(d, SWITCH) || matches(d, PROCON));
            if (!dev) {
                const granted = await navigator.hid.requestDevice({ filters: [SINPUT, DS4, SWITCH, PROCON] });
                dev = granted[0];
            }
            if (!dev) {
                setError(t("dongleTest.notFound"));
                return;
            }
            if (!dev.opened) await dev.open();

            const kind = matches(dev, SINPUT) ? "sinput" : matches(dev, DS4) ? "ds4"
                : matches(dev, PROCON) ? "procon" : "switch";
            latestRef.current = emptyInput();
            dev.oninputreport = (e) => {
                try {
                    if (kind === "switch") {
                        // NSGamepad declares no report ID, so reports arrive as id 0
                        if (e.reportId !== 0) return;
                        parseSwitch(e.data, latestRef.current, swMapRef.current);
                    } else if (kind === "procon") {
                        // 0x81/0x21 are handshake and subcommand replies; only 0x30 carries input
                        if (e.reportId !== 0x30) return;
                        parseProcon(e.data, latestRef.current, swMapRef.current);
                    } else if (e.reportId !== 0x01) {
                        return;
                    } else if (kind === "sinput") {
                        parseSInput(e.data, latestRef.current);
                    } else {
                        parseDS4(e.data, latestRef.current, ds4MapRef.current);
                    }
                    // Runs for every identity: the paddle assignment is one and the same
                    applyPaddleReverse(latestRef.current, paddlesRef.current);
                } catch { /* ignore partial reports */ }
            };
            deviceRef.current = dev;
            setDevice(dev);
            setIdentity(kind);

            if (kind === "procon") {
                // The Pro Controller protocol streams nothing until asked: 0x80 0x02 is the
                // handshake (replied as 0x81, ignored above) and 0x80 0x04 starts the 0x30 stream
                try {
                    await dev.sendReport(0x80, new Uint8Array([0x02]));
                    await dev.sendReport(0x80, new Uint8Array([0x04]));
                } catch (e) {
                    console.error("procon init failed", e);
                }
            }
        } catch (e) {
            console.error(e);
            setError(e?.message || String(e));
        } finally {
            setSearching(false);
        }
    }, [t]);

    // Connect and disconnect as the modal opens and closes
    React.useEffect(() => {
        if (open) {
            connect();
        } else {
            disconnect();
        }
        return () => { disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Display refresh (30fps). Sets and objects are copied each time so the reference changes
    React.useEffect(() => {
        if (!open || !device) return;
        const timer = setInterval(() => {
            const s = latestRef.current;
            setInput({
                buttons: new Set(s.buttons),
                dpad: new Set(s.dpad),
                sticks: { L: { ...s.sticks.L }, R: { ...s.sticks.R } },
                accel: [...s.accel],
                gyro: [...s.gyro],
            });
        }, 33);
        return () => clearInterval(timer);
    }, [open, device]);

    // Cleanup for when the USB device is unplugged
    React.useEffect(() => {
        if (!navigator.hid) return undefined;
        const onDisconnect = (e) => {
            if (e.device === deviceRef.current) disconnect();
        };
        navigator.hid.addEventListener("disconnect", onDisconnect);
        return () => navigator.hid.removeEventListener("disconnect", onDisconnect);
    }, [disconnect]);

    // Rumble: runs for 600ms and stops automatically
    const rumbleTimerRef = React.useRef(null);
    const sendRumble = React.useCallback(async (left, right) => {
        const dev = deviceRef.current;
        if (!dev) return;
        // The Switch identity has no rumble (the section is hidden, this is just a guard)
        if (dev.vendorId === SWITCH.vendorId) return;
        try {
            if (dev.vendorId === SINPUT.vendorId) {
                // CMD_HAPTIC (0x01), type 2 = ERM: [cmd, type, left amplitude, -, right amplitude, -]
                await dev.sendReport(0x03, new Uint8Array([0x01, 0x02, left, 0, right, 0]));
            } else if (dev.vendorId === PROCON.vendorId) {
                // Output 0x10 = rumble only: [timer, left hf/hfamp/lf/lfamp, right ...].
                // The firmware plays an hf amplitude of <0x40 as its weak pattern and >=0x40 as
                // strong, so the 0-255 amplitudes are mapped onto that split.
                const side = (amp) => [0x00, amp === 0 ? 0x00 : amp < 129 ? 0x30 : 0xc8, 0x00, 0x40];
                await dev.sendReport(0x10, new Uint8Array([0x00, ...side(left), ...side(right)]));
            } else {
                // DS4 Output 0x05: [flags, -, -, weak (right), strong (left), R, G, B, ...]
                const p = new Uint8Array(31);
                p[0] = 0x07;
                p[3] = right;
                p[4] = left;
                await dev.sendReport(0x05, p);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    // The firmware plays amplitudes of 1-128 as the weak pattern and 129 and above as the strong
    // one, so make every combination of left/right x weak/strong testable
    const testRumble = React.useCallback((which, strength) => {
        const amp = strength === "weak" ? 100 : 255;
        const left = which !== "right" ? amp : 0;
        const right = which !== "left" ? amp : 0;
        setRumbling(`${which}-${strength}`);
        sendRumble(left, right);
        clearTimeout(rumbleTimerRef.current);
        rumbleTimerRef.current = setTimeout(() => {
            sendRumble(0, 0);
            setRumbling(null);
        }, 600);
    }, [sendRumble]);

    React.useEffect(() => () => clearTimeout(rumbleTimerRef.current), []);

    const nl = normStick(input.sticks.L);
    const nr = normStick(input.sticks.R);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={t("dongleTest.title")}
            footer={(
                <button className="btn btn--md" onClick={onClose}>
                    {t("common.close")}
                </button>
            )}
        >
            {!device ? (
                <div className="dongle-test-empty">
                    <p>{error ? error : searching ? t("dongleTest.searching") : t("dongleTest.notFound")}</p>
                    <p className="dongle-test-empty__hint">{t("dongleTest.hint")}</p>
                    <button className="btn btn--md" onClick={connect} disabled={searching}>
                        {searching ? t("common.scanning") : t("common.rescan")}
                    </button>
                </div>
            ) : (
                <div className="dongle-test-grid">
                    <div className="dongle-test-grid__left">
                        <div className="dongle-test-identity">
                            {t("dongleTest.connectedAs", {
                                mode: identity === "ds4" ? "DualShock 4"
                                    : identity === "switch" ? "Switch"
                                    : identity === "procon" ? "Pro Controller"
                                    : "SInput",
                            })}
                        </div>
                        {/* The hardware is a Pro Controller 2, so use its layout. Under the DS4
                            identity, C/GL/GR light up as the buttons they are mapped to */}
                        <Procon2View
                            buttons={input.buttons}
                            dpad={input.dpad}
                            sticks={input.sticks}
                        />
                        <div className="dongle-test-stickvals">
                            <span>L: {fmtStick(nl.x)} / {fmtStick(nl.y)}</span>
                            <span>R: {fmtStick(nr.x)} / {fmtStick(nr.y)}</span>
                        </div>
                    </div>
                    {identity === "switch" ? (
                        <div className="dongle-test-grid__right">
                            {/* The HORI-compatible identity carries no IMU, no rumble and no C/GL/GR */}
                            <div className="dongle-test-imu-hint" style={{ marginTop: 8 }}>
                                {t("dongleTest.switchNoExtras")}
                            </div>
                        </div>
                    ) : (
                    <div className="dongle-test-grid__right">
                        <div className="dongle-test-section-title">{t("dongleTest.imuTitle")}</div>
                        <ImuRow
                            label={t("dongleTest.gyro")}
                            values={input.gyro}
                            unit="°/s"
                            max={500}
                            dominant={dominantAxis(input.gyro, 60)}
                        />
                        <ImuRow
                            label={t("dongleTest.accel")}
                            values={input.accel}
                            unit="g"
                            max={2}
                            dominant={dominantAxis(input.accel, 0.5)}
                        />
                        <div className="dongle-test-imu-hint">{t("dongleTest.imuHint")}</div>
                        <div className="dongle-test-imu-hint">{t("dongleTest.macroPauseNote")}</div>
                        <div className="dongle-test-section-title" style={{ marginTop: 40 }}>{t("dongleTest.rumbleTitle")}</div>
                        {/* Six combinations of left/right x weak/strong (weak and strong are different firmware rumble patterns) */}
                        <div className="dongle-test-rumble">
                            {["weak", "strong"].map((strength) => (
                                <div key={strength} className="dongle-test-rumble__row">
                                    <span className="dongle-test-rumble__label">
                                        {t(strength === "weak" ? "dongleTest.rumbleWeak" : "dongleTest.rumbleStrong")}
                                    </span>
                                    {["left", "right", "both"].map((which) => (
                                        <button
                                            key={which}
                                            className="btn btn--sm"
                                            disabled={!!rumbling}
                                            onClick={() => testRumble(which, strength)}
                                        >
                                            {t(
                                                which === "left" ? "dongleTest.rumbleLeft"
                                                : which === "right" ? "dongleTest.rumbleRight"
                                                : "dongleTest.rumbleBoth"
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
