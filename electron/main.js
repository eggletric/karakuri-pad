const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");
const cp = require("child_process");
const util = require("util");
const { SerialPort } = require("serialport");
const HID = require("node-hid");

const isDev = !app.isPackaged;

// External commands are always run asynchronously. execSync would stall the main process,
// freezing both the UI and the timers (such as passthrough stick sending) along with it.
const execFileAsync = util.promisify(cp.execFile);

// Keeps an unexpected exception from taking the whole app down (i.e. forcing a restart).
// The cause is still logged.
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});

// ===== i18n for messages originating in the main process =====
// Kept in sync from the renderer via app-set-language. Only text that reaches the UI is
// covered; console logs are for developers and are always in English.
let appLanguage = "ja";

const MAIN_MESSAGES = {
    ja: {
        hidLinkZadig: "Windows での WinUSB 設定 (Zadig)",
        hidLinkUdev: "Linux での udev ルール設定",
        hidOpenFailed: "HID デバイスを開けません。ドライバ設定が必要な場合があります。",
        nobleLoadFailed: "Bluetooth モジュールを読み込めませんでした。",
        btUnauthorized: "Bluetooth が許可されていません。設定で権限を確認してください。",
        btUnavailable: "Bluetooth を利用できません。システム設定で Bluetooth と、このアプリの Bluetooth 権限を確認してください。",
        bleConnectTimeout: "BLE 接続がタイムアウトしました (15秒)",
        bleInputCharMissing: "入力 characteristic が見つかりません",
        picoBleConnectTimeout: "Pico (BLE) への接続がタイムアウトしました (15秒)",
        picoBleCharMissing: "Pico の characteristic が見つかりません (ファームが古い可能性)",
        connectCancelled: "接続がキャンセルされました",
        connectSuperseded: "新しい接続要求により中断されました",
        picoBleNotFound: "Pico (BLE) が見つかりません (15秒)。",
        picoBleNotFoundNamed: "デバイス名「{name}」と電源を確認してください。",
        picoBleNotFoundGeneric: "デバイスの電源を確認してください。",
        unknownDeviceName: "(名称不明)",
        tcpConnectTimeout: "接続がタイムアウトしました (10秒)",
        connectFirst: "先に Pico へ接続してください。",
        uf2VolumeNotFound: "RPI-RP2 / RP2350 と一致するボリュームが見つかりませんでした。\nUSB接続とマウント状態を確認してください。",
        uf2SignatureMissing: "RPI-RP2 / RP2350 のラベルを持つボリュームは見つかりましたが、UF2 署名ファイルがありません。\nBOOTSEL モードか確認してください。",
        uf2LabelMissing: "UF2 らしきドライブは見つかりましたが、RPI-RP2 / RP2350 ラベルが確認できません。\nデバイスを差し直してください。",
        usbDetectedSuffix: " (USB デバイスは検出されました)",
        latestReleaseNotFound: "最新リリースを特定できませんでした",
        downloadUrlMissing: "ダウンロード URL がありません",
        firmwareDownloadFailed: "ファームウェアのダウンロードに失敗しました (status={status})",
        uf2DialogTitle: "UF2 ファイルを選択",
        uf2Invalid: "UF2 として認識できないファイルです",
        uf2UnsupportedBoard: "対応していないボード向けの UF2 です",
        bootselDriveMissing: "BOOTSEL のドライブが見つかりません (RPI-RP2 / RP2350 ラベルのストレージをマウントしてください)",
        firmwareDataEmpty: "ファームウェアデータが空です",
        uf2InvalidData: "UF2 として認識できないデータです",
        uf2BoardMismatch: "ボードと UF2 が一致しません（接続中: {board} / UF2: {uf2}）。\nダウンロードしたファイルが対象ボード向けか確認してください。",
        writeTimeout: "書き込みがタイムアウトしました。デバイスを差し直してください。",
        uf2FileNameInvalid: "UF2 のファイル名が不正です",
        uf2MountNotAllowed: "指定された書き込み先が BOOTSEL ドライブとして検出されていません。\nデバイスを差し直してから再検出してください。",
        downloadUrlNotAllowed: "許可されていないダウンロード URL です",
        firmwareWriteBusy: "ファームウェアの書き込み中です",
        bleScanBusy: "スキャンを実行中です",
        bleWriteAborted: "BLE への送信が中断されました: {reason}",
        bleWriteQueueOverflow: "BLE の送信キューが上限を超えたため、送信中のデータを破棄しました。",
        tcpPortInvalid: "ポート番号が不正です (1〜65535)",
        menuAbout: "Karakuri Pad について",
        menuHelp: "ヘルプ",
        menuWebsite: "公式サイト",
        menuManual: "マニュアル",
        menuIssues: "不具合を報告",
        menuReleases: "リリースノート",
    },
    en: {
        hidLinkZadig: "WinUSB setup on Windows (Zadig)",
        hidLinkUdev: "udev rules setup on Linux",
        hidOpenFailed: "Can't open the HID device. Driver setup may be required.",
        nobleLoadFailed: "Could not load the Bluetooth module.",
        btUnauthorized: "Bluetooth access denied. Check system permissions.",
        btUnavailable: "Bluetooth is unavailable. Check that Bluetooth is on and this app has Bluetooth permission.",
        bleConnectTimeout: "BLE connection timed out (15 s)",
        bleInputCharMissing: "Input characteristic not found",
        picoBleConnectTimeout: "Connection to the Pico (BLE) timed out (15 s)",
        picoBleCharMissing: "Pico characteristic not found (firmware may be outdated)",
        connectCancelled: "Connection cancelled",
        connectSuperseded: "Interrupted by a newer connection request",
        picoBleNotFound: "Pico (BLE) not found (15 s). ",
        picoBleNotFoundNamed: "Check the device name “{name}” and that it is powered on.",
        picoBleNotFoundGeneric: "Check that the device is powered on.",
        unknownDeviceName: "(unknown)",
        tcpConnectTimeout: "Connection timed out (10 s)",
        connectFirst: "Connect to the Pico first.",
        uf2VolumeNotFound: "No volume matching RPI-RP2 / RP2350 was found.\nCheck the USB connection and that the drive is mounted.",
        uf2SignatureMissing: "A volume labeled RPI-RP2 / RP2350 was found, but the UF2 signature files are missing.\nMake sure the board is in BOOTSEL mode.",
        uf2LabelMissing: "A UF2-like drive was found, but the RPI-RP2 / RP2350 label could not be confirmed.\nReplug the device.",
        usbDetectedSuffix: " (USB device detected)",
        latestReleaseNotFound: "Could not determine the latest release",
        downloadUrlMissing: "No download URL",
        firmwareDownloadFailed: "Firmware download failed (status={status})",
        uf2DialogTitle: "Select a UF2 file",
        uf2Invalid: "This file is not a valid UF2",
        uf2UnsupportedBoard: "This UF2 targets an unsupported board",
        bootselDriveMissing: "BOOTSEL drive not found (mount the storage labeled RPI-RP2 / RP2350)",
        firmwareDataEmpty: "Firmware data is empty",
        uf2InvalidData: "This data is not a valid UF2",
        uf2BoardMismatch: "Board and UF2 do not match (connected: {board} / UF2: {uf2}).\nMake sure the downloaded file targets this board.",
        writeTimeout: "Write timed out. Replug the device.",
        uf2FileNameInvalid: "Invalid UF2 file name",
        uf2MountNotAllowed: "The specified destination was not detected as a BOOTSEL drive.\nReplug the device and detect it again.",
        downloadUrlNotAllowed: "This download URL is not allowed",
        firmwareWriteBusy: "A firmware write is already in progress",
        bleScanBusy: "A scan is already running",
        bleWriteAborted: "The BLE transfer was aborted: {reason}",
        bleWriteQueueOverflow: "The BLE send queue exceeded its limit, so the pending data was discarded.",
        tcpPortInvalid: "Invalid port number (1-65535)",
        menuAbout: "About Karakuri Pad",
        menuHelp: "Help",
        menuWebsite: "Official Website",
        menuManual: "Manuals",
        menuIssues: "Report an Issue",
        menuReleases: "Release Notes",
    },
};

function tr(key, vars = {}) {
    const dict = MAIN_MESSAGES[appLanguage] || MAIN_MESSAGES.ja;
    let s = dict[key] ?? MAIN_MESSAGES.ja[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
}

ipcMain.handle("app-set-language", (_event, lng) => {
    appLanguage = lng === "en" ? "en" : "ja";
    // The menu holds translated labels ("About Karakuri Pad"), so rebuild it
    installAppMenu();
    return appLanguage;
});

// ===== TCP (connecting to the Pico over Wi-Fi) =====
let picoClient = null;
let picoTcpConnecting = null;   // the socket of a connection attempt in flight (for cancelling)
let picoTcpTarget = null;       // the target of the link being established { host, port }

// ===== USB serial (for writing settings) =====
let picoSerial = null;
let picoSerialPath = "";

function broadcastSerialError(message) {
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
        try {
            w.webContents.send("pico-serial-error", message);
        } catch (e) {
            console.error("[SERIAL] send pico-serial-error error:", e);
        }
    }
}

// Forward responses and link state from the firmware (TCP) to the renderer
function broadcastPicoMessage(payload) {
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
        try {
            w.webContents.send("pico-message", payload);
        } catch (e) {
            console.error("[PICO] send pico-message error:", e);
        }
    }
}

// Normalises VID/PID spelling to 4 lowercase hex digits.
// system_profiler on macOS can return them with the vendor name attached, as in
// "0x2e8a  (Raspberry Pi Ltd)", so everything from the first space or bracket is dropped.
// Returns "" when there is no value (returning "0000" would break the "has no ID" check).
function normalizeHex(value = "") {
    if (typeof value === "number") return value.toString(16).padStart(4, "0");
    const head = String(value ?? "").trim().split(/[\s(]/)[0];
    const lowered = head.toLowerCase().replace(/^0x/, "");
    if (!lowered) return "";
    return lowered.padStart(4, "0");
}

// ===== RPI-RP2 (UF2) =====
// The volume label in BOOTSEL mode. RP2040 boards use RPI-RP2, RP2350 boards (Pico 2 / Pico 2 W) use RP2350.
const RPI_VOLUME_LABELS = ["RPI-RP2", "RP2350"];
const PICO_VENDOR_ID = "2e8a";
// 0003=RP2040 BOOTSEL / 000f=RP2350 BOOTSEL
const PICO_BOOTSEL_PRODUCT_IDS = new Set(["0003", "0004", "0005", "000f"]);

function isBootselVolumeLabel(name) {
    return RPI_VOLUME_LABELS.includes(String(name || "").toUpperCase());
}

// A UF2 carries a family ID in its header. The bootloader rejects the wrong generation, so
// catching it here prevents the "it succeeded but nothing changed" failure.
const UF2_FAMILY_IDS = {
    rp2040: new Set([0xe48bff56]),
    rp2350: new Set([0xe48bff59, 0xe48bff5a, 0xe48bff5b]), // arm-s / riscv / arm-ns
};

// Scans the blocks of a UF2 and returns the known board generation ("rp2040" | "rp2350" | null).
// An RP2350 UF2 starts with an absolute block (family 0xe48bff57) and the real family only
// appears from the second block on, so looking at the first block alone misidentifies it.
function detectUf2Family(buf) {
    if (!buf || buf.length < 512) return { family: null, valid: false };

    let valid = false;
    for (let off = 0; off + 512 <= buf.length; off += 512) {
        if (buf.readUInt32LE(off) !== 0x0a324655) continue;      // "UF2\n"
        if (buf.readUInt32LE(off + 4) !== 0x9e5d5157) continue;
        valid = true;
        const flags = buf.readUInt32LE(off + 8);
        if (!(flags & 0x00002000)) continue;                     // familyID present
        const familyId = buf.readUInt32LE(off + 28);
        for (const [name, ids] of Object.entries(UF2_FAMILY_IDS)) {
            if (ids.has(familyId)) return { family: name, valid: true };
        }
        // Skip families we do not know, such as the absolute block (0xe48bff57), and keep going
    }
    return { family: null, valid };
}
const FIRMWARE_REPO = "eggletric/karakuri-firmware";
const RELEASE_LATEST_URL = `https://github.com/${FIRMWARE_REPO}/releases/latest`;
// A downloadUrl coming from the renderer is only allowed if it starts with this prefix
const FIRMWARE_DOWNLOAD_PREFIX = `https://github.com/${FIRMWARE_REPO}/releases/download/`;
// The legacy-name assets are gone, so there is no fallback URL
const FIRMWARE_ASSET_NAMES = {
    rp2040: "karakuri-firmware-picow.uf2",
    rp2350: "karakuri-firmware-pico2w.uf2",
};

function firmwareAssetNameFor(family) {
    return FIRMWARE_ASSET_NAMES[family] || null;
}

// ===== Controller (node-hid) = the 1st gen Switch Pro Controller =====
const PRO_CONTROLLER_VENDOR_ID = 0x057e;
const PRO_CONTROLLER_PRODUCT_ID = 0x2009;
const CONTROLLER_SCAN_INTERVAL_MS = 2500;

// ===== Controller (BLE) = Switch 2 Pro Controller =====
// The Pro Controller 2 (PID 0x2069) uses a custom GATT service over Bluetooth LE, so it
// exposes no HID profile — node-hid cannot see it even in principle.
// See docs/controllers.md for the protocol details and the measured values.
const SWITCH2_PRO_PID_LE = Buffer.from([0x69, 0x20]);
const SWITCH2_COMPANY_IDS = [0x0553, 0x057e];
const SWITCH2_INPUT_CHAR = "7492866cec3e4619825832755ffcc0f9";
const SWITCH2_MIN_REPORT_LEN = 11;

// The sticks are 12 bits. The centre is 2048, but the measured travel is only 1450-1700 to
// either side, and dividing by 2048 tops out around 0.8 even at full tilt, so the measured
// range is used for normalisation instead.
const SWITCH2_STICK_CENTER = 2048;
const SWITCH2_STICK_RANGE = 1700;

// C / GL / GR are Switch 2 exclusives. The firmware impersonates a 1st gen Switch controller,
// so they cannot be sent. Recording them is pointless, so they are left out of the map.
const SWITCH2_BUTTON_MAP = [
    { byte: 2, mask: 0x02, name: "A" },
    { byte: 2, mask: 0x01, name: "B" },
    { byte: 2, mask: 0x08, name: "X" },
    { byte: 2, mask: 0x04, name: "Y" },
    { byte: 2, mask: 0x10, name: "R" },
    { byte: 2, mask: 0x20, name: "ZR" },
    { byte: 2, mask: 0x40, name: "PLUS" },
    { byte: 2, mask: 0x80, name: "RSTICK" },
    { byte: 3, mask: 0x10, name: "L" },
    { byte: 3, mask: 0x20, name: "ZL" },
    { byte: 3, mask: 0x40, name: "MINUS" },
    { byte: 3, mask: 0x80, name: "LSTICK" },
    { byte: 4, mask: 0x01, name: "HOME" },
    { byte: 4, mask: 0x10, name: "CAPTURE" },
];

let controllerDevice = null;
let controllerWatcher = null;
let controllerState = {
    connected: false,
    kind: "",           // "hid" = 1st gen Pro Controller / "ble" = Pro Controller 2
    devicePath: "",
    deviceName: "",
    serialNumber: "",
    lastButtons: new Map(),
    lastDpad: "",
    lastStickL: { x: 128, y: 128 },
    lastStickR: { x: 128, y: 128 },
    statusMessage: "",
    setupLinks: [],
};

const getHidSetupLinks = () => [
    {
        label: tr("hidLinkZadig"),
        url: "https://github.com/node-hid/node-hid#zadig",
    },
    {
        label: tr("hidLinkUdev"),
        url: "https://github.com/node-hid/node-hid#udev-rules",
    },
];

function updateControllerStatus(message = "", includeSetupLinks = false) {
    controllerState.statusMessage = message;
    controllerState.setupLinks = includeSetupLinks ? getHidSetupLinks() : [];
}

// ===== Creating the BrowserWindow =====
// A minimal menu for production.
// Electron's default menu carries Reload / Force Reload / Zoom / DevTools, which makes
// cmd+R and cmd+= work. Being able to reload the screen of a native app is a dead giveaway
// that it is a browser, so only App / Edit / Window are kept.
// (The Edit role is required for the copy & paste shortcuts.)
// "About Karakuri Pad" opens the same welcome modal as the first launch (app icon +
// notices), not the OS-native About panel. If every window is closed (macOS), one is
// recreated first and the request is delivered once it has loaded.
function openWelcomeFromMenu() {
    let win = BrowserWindow.getAllWindows()[0];
    if (!win) {
        createWindow();
        win = BrowserWindow.getAllWindows()[0];
        if (!win) return;
        win.webContents.once("did-finish-load", () => {
            win.webContents.send("app-open-welcome");
        });
        return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.webContents.send("app-open-welcome");
}

function installAppMenu() {
    // Electron's standard View menu (reload, DevTools, zoom) is not something to show as part
    // of the product, so the menu stays minimal at all times, development included. DevTools
    // and friends are reached through keyboard shortcuts (in createWindow) during development.

    // The LP serves ja under /ja/ and en at the root; the manual catalog is the
    // #manual section of the top page
    const lpBase = appLanguage === "ja"
        ? "https://karakuri-pad.com/ja/"
        : "https://karakuri-pad.com/";
    const helpMenu = {
        label: tr("menuHelp"),
        role: "help",
        submenu: [
            // macOS puts About in the app menu; everywhere else it leads the Help menu
            ...(process.platform === "darwin" ? [] : [
                { label: tr("menuAbout"), click: openWelcomeFromMenu },
                { type: "separator" },
            ]),
            { label: tr("menuWebsite"), click: () => shell.openExternal(lpBase) },
            { label: tr("menuManual"), click: () => shell.openExternal(`${lpBase}#manual`) },
            { type: "separator" },
            { label: tr("menuIssues"), click: () => shell.openExternal("https://github.com/eggletric/karakuri-pad/issues") },
            { label: tr("menuReleases"), click: () => shell.openExternal("https://github.com/eggletric/karakuri-pad/releases") },
        ],
    };

    if (process.platform === "darwin") {
        // On macOS the copy/paste shortcuts come from the menu, so Edit/Window are kept.
        // The app menu is spelled out instead of { role: "appMenu" } so that the About item
        // can open the welcome modal instead of the OS About panel
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            {
                label: app.name,
                submenu: [
                    { label: tr("menuAbout"), click: openWelcomeFromMenu },
                    { type: "separator" },
                    { role: "services" },
                    { type: "separator" },
                    { role: "hide" },
                    { role: "hideOthers" },
                    { role: "unhide" },
                    { type: "separator" },
                    { role: "quit" },
                ],
            },
            { role: "editMenu" },
            { role: "windowMenu" },
            helpMenu,
        ]));
    } else {
        // Windows/Linux run a normal title bar, so the menu bar has a home. The same
        // minimal set as macOS: Edit for the shortcuts, Window, and Help (About + links)
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { role: "editMenu" },
            { role: "windowMenu" },
            helpMenu,
        ]));
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1130,
        minWidth: 1130,
        height: 810,
        minHeight: 810,
        // macOS: fold the title bar into the app's own drag strip (only the traffic light
        // buttons remain). Windows/Linux keep the normal title bar — a native menu bar
        // (help links etc.) has nowhere to live under a hidden title bar
        ...(process.platform === "darwin"
            ? {
                  titleBarStyle: "hiddenInset",
                  trafficLightPosition: { x: 14, y: 11 },
              }
            : {}),
        // The native background exposed while resizing. Unless it matches the body background
        // (--bg-surface: #0d1220), the area rendering cannot keep up with flickers in another colour
        backgroundColor: "#0d1220",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            spellcheck: false,   // the red squiggles in input fields look like the web, so they go
        },
    });

    // WebHID: for the dongle tester. Only the dongle's four identities (SInput / DS4 /
    // the HORI-compatible Switch pad / the Pro Controller emulation) are eligible; access to
    // any other HID device is denied.
    const isSinputOrDs4 = (d) =>
        d &&
        ((d.vendorId === 0x2e8a && d.productId === 0x10c6) ||
         (d.vendorId === 0x054c && d.productId === 0x05c4));
    // Ambiguous identities come last: the Switch pad VID/PID is also a Pico in bt/wifi mode,
    // and the Pro Controller VID/PID is also a genuine Pro Controller. With several candidates
    // plugged in, the unambiguous dongle identities win.
    const isSwitchPad = (d) => d && d.vendorId === 0x0f0d && d.productId === 0x0092;
    const isProconPad = (d) => d && d.vendorId === 0x057e && d.productId === 0x2009;
    const isDongleHid = (d) => isSinputOrDs4(d) || isSwitchPad(d) || isProconPad(d);
    win.webContents.session.on("select-hid-device", (event, details, callback) => {
        event.preventDefault();
        const list = details.deviceList || [];
        const dev = list.find(isSinputOrDs4) || list.find(isProconPad) || list.find(isSwitchPad);
        callback(dev ? dev.deviceId : "");
    });
    win.webContents.session.setDevicePermissionHandler(
        (details) => details.deviceType === "hid" && isDongleHid(details.device)
    );

    // Disable pinch zoom and double-tap zoom (suppressing browser-like behaviour)
    win.webContents.on("did-finish-load", () => {
        win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    });

    // External links open in the OS browser rather than navigating inside the app.
    // Navigating within the window would turn the whole app into a browser view.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
        const current = win.webContents.getURL();
        if (url === current) return;
        // Reloads from the dev server (same origin) are allowed
        if (isDev && url.startsWith("http://localhost:5173")) return;
        e.preventDefault();
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
    });

    if (isDev) {
        win.loadURL("http://localhost:5173");
        win.webContents.openDevTools({ mode: "detach" });
        // View was removed from the menu, so during development the keyboard stands in for it:
        // F12 / Cmd(Ctrl)+Alt+I = DevTools, Cmd(Ctrl)+R = reload
        win.webContents.on("before-input-event", (e, input) => {
            if (input.type !== "keyDown") return;
            const key = String(input.key || "").toLowerCase();
            const mod = input.meta || input.control;
            if (key === "f12" || (key === "i" && mod && input.alt)) {
                win.webContents.toggleDevTools();
                e.preventDefault();
            } else if (key === "r" && mod && !input.alt && !input.shift) {
                win.webContents.reload();
                e.preventDefault();
            }
        });
    } else {
        win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
}

// ===== Passthrough =====
// Sends controller input straight to the Pico without going through the renderer.
// Skipping the IPC round trip keeps the latency to a minimum.
let passthroughEnabled = false;

// How the sticks are handled matters:
// Sending every event over TCP leaves the unsent ones piling up in the socket buffer whenever
// Wi-Fi stalls for a moment, after which "past input" is replayed in order and the lag keeps
// accumulating. Nothing but the latest stick value has any worth, so only that is kept and
// sent at a fixed interval. Buttons and the D-Pad cannot afford to be dropped, so every one
// of their events is sent immediately.
const PT_STICK_INTERVAL_MS = 33;              // ≒30Hz
const PT_BACKPRESSURE_LIMIT = 512;            // skip the sticks while more than this is unsent

let ptStickLatest = { L: null, R: null };
let ptStickTimer = null;

function passthroughCommand(p) {
    if (p.type === "button") {
        return `BTN ${p.button} ${p.action === "down" ? "DOWN" : "UP"}`;
    }
    if (p.type === "dpad") {
        return p.dir === "CENTER" || p.action === "up" ? "DPAD CENTER" : `DPAD ${p.dir}`;
    }
    if (p.type === "stick") {
        return `${p.stick}STICK ${p.x} ${p.y}`;
    }
    return null;
}

function ptFlushSticks() {
    if (!passthroughEnabled || !picoLinkConnected()) return;
    // Skip while the send backlog is piling up (the next round sends the latest value anyway)
    if (picoLinkPendingBytes() > PT_BACKPRESSURE_LIMIT) return;

    for (const side of ["L", "R"]) {
        const p = ptStickLatest[side];
        if (!p) continue;
        ptStickLatest[side] = null;
        picoLinkWrite(`${side}STICK ${p.x} ${p.y}\n`);
    }
}

function ptStartStickPump() {
    if (ptStickTimer) return;
    ptStickTimer = setInterval(ptFlushSticks, PT_STICK_INTERVAL_MS);
}

function ptStopStickPump() {
    if (ptStickTimer) {
        clearInterval(ptStickTimer);
        ptStickTimer = null;
    }
    ptStickLatest = { L: null, R: null };
}

// Teardown shared by both transports (TCP / BLE).
// If passthrough outlives the link, it holds on to the BLE controller and keeps pushing events
// that have nowhere to go, so every disconnect on every path comes through here.
// Returns whether passthrough was actually stopped (reported to the renderer with the closed notice).
// sendCenter: true only when stopping while the link is still alive.
// Sends neutral so no held button or tilted stick is left behind on the firmware side.
function teardownPassthroughForLink({ sendCenter = false } = {}) {
    macroRunning = false;
    if (!passthroughEnabled) return false;

    passthroughEnabled = false;
    ptStopStickPump();
    releaseBle("passthrough").catch(() => {});

    if (sendCenter && picoLinkConnected()) {
        picoLinkWrite("BTN ALL UP\n");
        picoLinkWrite("LSTICK 128 128\n");
        picoLinkWrite("RSTICK 128 128\n");
    }
    return true;
}

function passthroughSend(payload) {
    if (!passthroughEnabled || !picoLinkConnected()) return;

    if (payload.type === "stick") {
        ptStickLatest[payload.stick] = payload;   // keep only the latest value
        return;
    }

    const cmd = passthroughCommand(payload);
    if (cmd) picoLinkWrite(cmd + "\n");
}

function broadcastControllerPayload(payload) {
    passthroughSend(payload);
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
        try {
            w.webContents.send("pico-controller-input", payload);
        } catch (e) {
            console.error("[HID] failed to forward controller payload:", e);
        }
    }
}

function closeControllerDevice({ resetStatus = true } = {}) {
    // stopBleController() takes care of the BLE side, so only HID is closed here
    if (controllerDevice) {
        try {
            controllerDevice.close();
        } catch (e) {
            console.error("[HID] close error:", e);
        }
    }
    controllerDevice = null;
    controllerState.connected = false;
    controllerState.kind = "";
    controllerState.devicePath = "";
    controllerState.deviceName = "";
    controllerState.serialNumber = "";
    controllerState.lastButtons.clear();
    controllerState.lastDpad = "";
    controllerState.lastStickL = { x: 128, y: 128 };
    controllerState.lastStickR = { x: 128, y: 128 };
    if (resetStatus) {
        updateControllerStatus("", false);
    }
    broadcastControllerPayload({
        type: "status",
        connected: false,
        deviceName: "",
        message: controllerState.statusMessage,
        setupLinks: controllerState.setupLinks,
    });
}

// ---- Parsing the Switch 2 Pro Controller report ----
// byte0: counter / byte1: always 0x20 / byte2-4: buttons / byte5-10: sticks
function scaleSwitch2Axis(raw, invert) {
    const v = (raw - SWITCH2_STICK_CENTER) / SWITCH2_STICK_RANGE;
    const scaled = (invert ? -v : v) * 127 + 128;
    return Math.max(0, Math.min(255, Math.round(scaled)));
}

function parseSwitch2Sticks(buf) {
    const lx = buf[5] | ((buf[6] & 0x0f) << 8);
    const ly = ((buf[6] & 0xf0) >> 4) | (buf[7] << 4);
    const rx = buf[8] | ((buf[9] & 0x0f) << 8);
    const ry = ((buf[9] & 0xf0) >> 4) | (buf[10] << 4);
    // Raw values grow towards up and right. The firmware treats y=0 as up, so only Y is inverted.
    return {
        L: { x: scaleSwitch2Axis(lx, false), y: scaleSwitch2Axis(ly, true) },
        R: { x: scaleSwitch2Axis(rx, false), y: scaleSwitch2Axis(ry, true) },
    };
}

function parseSwitch2Dpad(buf) {
    const b3 = buf[3];
    const down = !!(b3 & 0x01);
    const right = !!(b3 & 0x02);
    const left = !!(b3 & 0x04);
    const up = !!(b3 & 0x08);

    if (up && !left && !right) return "UP";
    if (down && !left && !right) return "DOWN";
    if (left && !up && !down) return "LEFT";
    if (right && !up && !down) return "RIGHT";
    return "";
}

function parseSwitch2Buttons(buf) {
    const events = [];
    for (const item of SWITCH2_BUTTON_MAP) {
        const isDown = !!(buf[item.byte] & item.mask);
        const wasDown = !!controllerState.lastButtons.get(item.name);
        if (isDown !== wasDown) {
            events.push({
                type: "button",
                button: item.name,
                action: isDown ? "down" : "up",
            });
        }
        controllerState.lastButtons.set(item.name, isDown);
    }
    return events;
}

function parseSwitch2Input(buf) {
    if (!buf || buf.length < SWITCH2_MIN_REPORT_LEN) return [];
    const events = [];
    events.push(...parseSwitch2Buttons(buf));
    events.push(...detectDpadEvent(parseSwitch2Dpad(buf)));
    events.push(...detectStickEvents(parseSwitch2Sticks(buf)));
    return events;
}

// For the 1st gen Pro Controller. It uses report 0x30, and its bit layout differs completely from the Pro Controller 2.
function parseStickValues(buf) {
    const lx = buf[4] | ((buf[5] & 0x0f) << 8);
    const ly = (buf[5] >> 4) | (buf[6] << 4);
    const rx = buf[7] | ((buf[8] & 0x0f) << 8);
    const ry = (buf[8] >> 4) | (buf[9] << 4);

    const scale = (v) => Math.max(0, Math.min(255, Math.round((v / 4095) * 255)));

    return {
        L: { x: scale(lx), y: scale(ly) },
        R: { x: scale(rx), y: scale(ry) },
    };
}

// The stick threshold. Too small and simply tilting smoothly produces hundreds of steps,
// burning through the firmware's 1800-step budget in no time.
const STICK_RECORD_THRESHOLD = 12;

function detectStickEvents(parsedSticks) {
    const events = [];
    // Recording stays coarse to respect the 1800-step budget, while passthrough (real-time
    // control) favours smoothness and samples finely
    const threshold = passthroughEnabled ? 4 : STICK_RECORD_THRESHOLD;

    for (const key of ["L", "R"]) {
        const prev = key === "L" ? controllerState.lastStickL : controllerState.lastStickR;
        const cur = parsedSticks[key];

        if (!cur) continue;
        const dx = Math.abs((prev?.x ?? 0) - cur.x);
        const dy = Math.abs((prev?.y ?? 0) - cur.y);
        if (dx >= threshold || dy >= threshold) {
            events.push({ type: "stick", stick: key, x: cur.x, y: cur.y });
            if (key === "L") controllerState.lastStickL = cur;
            else controllerState.lastStickR = cur;
        }
    }

    return events;
}

function parseDpad(buf) {
    const down = !!(buf[3] & 0x01);
    const up = !!(buf[3] & 0x02);
    const right = !!(buf[3] & 0x04);
    const left = !!(buf[3] & 0x08);

    if (up && !left && !right) return "UP";
    if (down && !left && !right) return "DOWN";
    if (left && !up && !down) return "LEFT";
    if (right && !up && !down) return "RIGHT";
    return "";
}

function detectDpadEvent(dir) {
    // Returning early on neutral ("") used to leave lastDpad unchanged, so pressing the same
    // direction a second time produced no event.
    if (dir === controllerState.lastDpad) return [];
    controllerState.lastDpad = dir;

    if (!dir) return [{ type: "dpad", dir: "CENTER", action: "up" }];
    return [{ type: "dpad", dir, action: "down" }];
}

function parseButtons(buf) {
    const map = [
        { byte: 1, mask: 0x08, name: "A" },
        { byte: 1, mask: 0x04, name: "B" },
        { byte: 1, mask: 0x02, name: "X" },
        { byte: 1, mask: 0x01, name: "Y" },
        { byte: 1, mask: 0x10, name: "R" },
        { byte: 1, mask: 0x20, name: "ZR" },
        { byte: 2, mask: 0x10, name: "L" },
        { byte: 2, mask: 0x20, name: "ZL" },
        { byte: 1, mask: 0x40, name: "MINUS" },
        { byte: 1, mask: 0x80, name: "PLUS" },
        { byte: 2, mask: 0x01, name: "RSTICK" },
        { byte: 2, mask: 0x02, name: "LSTICK" },
        { byte: 2, mask: 0x04, name: "HOME" },
        { byte: 2, mask: 0x08, name: "CAPTURE" },
    ];

    const events = [];

    for (const item of map) {
        const isDown = !!(buf[item.byte] & item.mask);
        const wasDown = !!controllerState.lastButtons.get(item.name);
        // Downs alone would produce a macro that holds forever, so the release is emitted too
        if (isDown !== wasDown) {
            events.push({
                type: "button",
                button: item.name,
                action: isDown ? "down" : "up",
            });
        }
        controllerState.lastButtons.set(item.name, isDown);
    }

    return events;
}

function parseProControllerInput(buf) {
    if (!buf || buf.length < 10 || buf[0] !== 0x30) {
        return [];
    }

    const events = [];
    events.push(...parseButtons(buf));
    events.push(...detectDpadEvent(parseDpad(buf)));
    events.push(...detectStickEvents(parseStickValues(buf)));
    return events;
}

function handleControllerData(data) {
    const payloads = parseProControllerInput(data);
    if (!payloads.length) return;

    // Attach the arrival time so the recorder can turn the gaps into SLEEPs
    const at = Date.now();
    for (const p of payloads) {
        broadcastControllerPayload({ ...p, at });
    }
}

function openController(deviceInfo) {
    try {
        controllerDevice = new HID.HID(deviceInfo.path);
        controllerDevice.on("data", handleControllerData);
        controllerDevice.on("error", (err) => {
            console.error("[HID] runtime error:", err);
            closeControllerDevice();
        });
        controllerState.connected = true;
        controllerState.kind = "hid";
        controllerState.devicePath = deviceInfo.path || "";
        controllerState.deviceName = deviceInfo.product || "";
        controllerState.serialNumber = deviceInfo.serialNumber || "";
        updateControllerStatus("", false);
        broadcastControllerPayload({
            type: "status",
            connected: true,
            deviceName: controllerState.deviceName,
            message: controllerState.statusMessage,
            setupLinks: controllerState.setupLinks,
        });
        console.log("[HID] connected:", deviceInfo.product || deviceInfo.path);
    } catch (e) {
        console.error("[HID] failed to open device:", e);
        console.info(
            "[HID] Guidance: on Windows, setting up the WinUSB driver (with Zadig or similar) may be required.",
            "On Linux, permissions have to be granted through a udev rule."
        );
        updateControllerStatus(tr("hidOpenFailed"), true);
        closeControllerDevice({ resetStatus: false });
    }
}

// ============================================================
// Connection management for BLE (the Switch 2 Pro Controller)
//   noble initialises CoreBluetooth as soon as it is required, which asks for the Bluetooth
//   permission on macOS. Prompting people who never use the recording feature would be rude,
//   so it is not loaded until something explicitly starts it.
// ============================================================
let noble = null;
let bleReady = false;
let bleWanted = false;          // whether we are in the "please look for the Pro Controller 2" state
let blePeripheral = null;
let bleChar = null;
let bleScanning = false;

function bleLog(...args) {
    console.log("[BLE]", ...args);
}

// Whether scanning is needed (discovering the Pro Controller 2 / connecting to or listing the Pico over BLE).
// noble has a single scan per process, so users are counted and it is shared.
function bleScanNeeded() {
    if (bleWanted && !blePeripheral) return true;
    if (picoBlePending && !picoBlePending.connecting) return true;
    if (picoScanCollector) return true;
    return false;
}

// Starting and stopping noble's scan is serialised through a single Promise chain.
// Throwing a start and a stop concurrently produces mismatches such as "start ran before stop
// finished, so bleScanning is true while nothing is actually scanning".
let bleScanOpChain = Promise.resolve();

function bleScanOp(fn) {
    const run = bleScanOpChain.then(fn);
    bleScanOpChain = run.catch(() => {});
    return run;
}

async function bleStartScanningInner() {
    if (!noble || !bleReady) return false;
    try {
        bleScanning = true;
        // allowDuplicates=true is required. Windows (WinRT) delivers the advertisement itself
        // and the scan response as separate events, so with false only the first one (the
        // 8-character short name) arrives and the full name is never seen.
        await noble.startScanningAsync([], true);
        bleLog("scan started");
        return true;
    } catch (e) {
        bleScanning = false;
        bleLog("failed to start scanning:", e?.message || e);
        return false;
    }
}

async function bleStopScanningInner() {
    if (!noble || !bleScanning) {
        bleScanning = false;
        return;
    }
    try {
        await noble.stopScanningAsync();
    } catch (e) {
        bleLog("failed to stop scanning:", e?.message || e);
    }
    bleScanning = false;
}

// Demand (bleScanNeeded) can change while an operation is in flight, so this converges on the
// demand over a handful of attempts.
async function bleSettleScanning() {
    for (let i = 0; i < 3; i++) {
        const need = bleScanNeeded();
        if (need === bleScanning) return;
        if (need) {
            const started = await bleStartScanningInner();
            if (!started) return;   // give up on failure (the next call retries)
        } else {
            await bleStopScanningInner();
        }
    }
}

function bleUpdateScanning() {
    return bleScanOp(bleSettleScanning);
}

function bleStartScanning() {
    return bleScanOp(bleSettleScanning);
}

// Stops for certain regardless of demand (for restarting a scan so already-discovered devices are reported again)
function bleStopScanning() {
    return bleScanOp(bleStopScanningInner);
}

function isSwitch2Advertisement(peripheral) {
    const adv = peripheral?.advertisement;
    const md = adv?.manufacturerData;
    if (md && md.length >= 4) {
        const companyId = md.readUInt16LE(0);
        if (SWITCH2_COMPANY_IDS.includes(companyId) && md.indexOf(SWITCH2_PRO_PID_LE) >= 0) {
            return true;
        }
    }
    // In some states no manufacturer data is attached and only the name comes through
    return !!(adv?.localName && adv.localName.includes("Pro Controller"));
}

function handleSwitch2Data(data) {
    bleLastDataAt = Date.now();
    const payloads = parseSwitch2Input(data);
    if (!payloads.length) return;
    const at = Date.now();
    for (const p of payloads) {
        broadcastControllerPayload({ ...p, at });
    }
}

// ===== Watchdog for a stalled BLE controller =====
// The Pro Controller 2 notifies more or less constantly while connected (60Hz and up), so a
// gap of BLE_STALL_TIMEOUT_MS without a report means the radio link dropped or it went to
// sleep. The OS disconnect decision (the supervision timeout) takes seconds to tens of
// seconds and cannot be shortened from the app, so neutral is sent and discovery restarted
// without waiting for it (the same approach as stalled() in the FW dongle).
const BLE_STALL_TIMEOUT_MS = 2000;
const BLE_STALL_CHECK_MS = 500;
let bleLastDataAt = 0;
let bleStallTimer = null;

// When the controller goes away, send neutral so no held button or tilted stick is left behind
// on the Pico. Passthrough itself is not stopped (it resumes as soon as the controller is back).
function ptSendNeutralToPico() {
    if (!passthroughEnabled || !picoLinkConnected()) return;
    ptStickLatest = { L: null, R: null };
    picoLinkWrite("BTN ALL UP\n");
    picoLinkWrite("DPAD CENTER\n");
    picoLinkWrite("LSTICK 128 128\n");
    picoLinkWrite("RSTICK 128 128\n");
}

function bleStopStallWatchdog() {
    if (bleStallTimer) {
        clearInterval(bleStallTimer);
        bleStallTimer = null;
    }
}

function bleStartStallWatchdog() {
    bleLastDataAt = Date.now();
    if (bleStallTimer) return;
    bleStallTimer = setInterval(() => {
        if (!blePeripheral || !bleChar) return;
        if (Date.now() - bleLastDataAt < BLE_STALL_TIMEOUT_MS) return;
        bleHandleStall();
    }, BLE_STALL_CHECK_MS);
}

function bleHandleStall() {
    const peripheral = blePeripheral;
    if (!peripheral) return;
    bleLog(`no input for ${BLE_STALL_TIMEOUT_MS}ms. Treating it as a disconnect and restarting discovery`);
    bleStopStallWatchdog();
    // Detach first, so the real disconnect event that arrives later is a no-op
    blePeripheral = null;
    bleChar = null;
    ptSendNeutralToPico();
    if (controllerState.kind === "ble") {
        closeControllerDevice();
    }
    try {
        peripheral.disconnectAsync().catch(() => {});
    } catch (e) { /* already disconnected */ }
    if (bleWanted) setTimeout(() => { bleStartScanning(); }, 1000);
}

async function bleConnect(peripheral) {
    // Set this first so onBleDiscover's duplicate guard takes effect immediately (with
    // allowDuplicates=true, discover fires repeatedly for the same device, so a second
    // connection could start while we are awaiting)
    blePeripheral = peripheral;
    await bleStopScanning();

    peripheral.once("disconnect", () => {
        // If we have already moved to a different peripheral, do not let the old one's
        // disconnect tear down the current connection
        if (blePeripheral !== peripheral) return;
        bleLog("disconnected");
        bleStopStallWatchdog();
        blePeripheral = null;
        bleChar = null;
        // Send neutral so nothing stays held on the Pico (the Pico link survives on its own path)
        ptSendNeutralToPico();
        if (controllerState.kind === "ble") {
            closeControllerDevice();
        }
        // Keep trying to reconnect automatically as long as the "please look for it" state holds
        if (bleWanted) setTimeout(() => { bleStartScanning(); }, 1000);
    });

    bleLog("connecting:", peripheral.advertisement?.localName || peripheral.id);
    // noble's connectAsync can stay pending forever if the peer disappears
    await Promise.race([
        peripheral.connectAsync(),
        new Promise((_, rej) =>
            setTimeout(() => rej(new Error(tr("bleConnectTimeout"))), 15000)
        ),
    ]);

    const found = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [], [SWITCH2_INPUT_CHAR]
    );
    const char = found?.characteristics?.[0];
    if (!char) {
        throw new Error(tr("bleInputCharMissing"));
    }

    bleChar = char;
    char.on("data", handleSwitch2Data);
    await char.subscribeAsync();
    bleStartStallWatchdog();

    controllerState.connected = true;
    controllerState.kind = "ble";
    controllerState.deviceName = peripheral.advertisement?.localName || "Nintendo Switch 2 Pro Controller";
    controllerState.devicePath = peripheral.id || "";
    controllerState.serialNumber = "";
    controllerState.lastButtons.clear();
    controllerState.lastDpad = "";
    controllerState.lastStickL = { x: 128, y: 128 };
    controllerState.lastStickR = { x: 128, y: 128 };
    updateControllerStatus("", false);

    bleLog("connected:", controllerState.deviceName);
    broadcastControllerPayload({
        type: "status",
        connected: true,
        deviceName: controllerState.deviceName,
        message: "",
        setupLinks: [],
    });

    // Resume scanning if the Pico (BLE) side is still discovering
    bleUpdateScanning();
}

async function onBleDiscover(peripheral) {
    if (blePeripheral || !bleWanted) return;
    if (controllerState.kind === "hid" && controllerState.connected) return;
    if (!isSwitch2Advertisement(peripheral)) return;

    try {
        await bleConnect(peripheral);
    } catch (e) {
        bleLog("failed to connect:", e?.message || e);
        if (blePeripheral === peripheral) blePeripheral = null;
        bleChar = null;
        // It may be partway connected, so always detach (without waiting for completion)
        try {
            peripheral.disconnectAsync().catch(() => {});
        } catch (e2) { /* already disconnected */ }
        // No failure message is shown. It retries automatically anyway, and it would duplicate
        // the guidance permanently displayed in the recording modal's connection frame (connectHint)
        updateControllerStatus("", false);
        if (bleWanted) setTimeout(() => { bleStartScanning(); }, 1500);
    }
}

function initNoble() {
    if (noble) return true;
    try {
        noble = require("@stoprocent/noble");
    } catch (e) {
        bleLog("cannot load noble:", e?.message || e);
        updateControllerStatus(tr("nobleLoadFailed"), false);
        return false;
    }

    noble.on("stateChange", (state) => {
        bleLog("state:", state);
        bleReady = state === "poweredOn";
        if (!bleReady) {
            // If it stopped because Bluetooth was turned off or similar, a stale flag would
            // keep the scan from resuming once it is back on
            bleScanning = false;
        }
        if (bleReady) {
            bleStartScanning();
        } else if (state === "unauthorized") {
            updateControllerStatus(tr("btUnauthorized"), false);
        }
    });
    noble.on("discover", onBleDiscover);
    noble.on("discover", onPicoBleDiscover);
    noble.on("scanStop", () => { bleScanning = false; });
    return true;
}

// Counts who wants BLE. If the recording modal and passthrough use it at the same time, one
// of them stopping must not take the other's connection down with it.
const bleUsers = new Set();

function acquireBle(user) {
    bleUsers.add(user);
    return startBleController();
}

async function releaseBle(user) {
    bleUsers.delete(user);
    if (bleUsers.size === 0) {
        await stopBleController();
    }
}

function startBleController() {
    bleWanted = true;
    if (!initNoble()) return false;
    if (bleReady) bleStartScanning();
    return true;
}

async function stopBleController() {
    bleWanted = false;
    bleStopStallWatchdog();
    await bleUpdateScanning();   // scanning is kept alive if the Pico (BLE) side is still discovering
    if (blePeripheral) {
        try {
            await blePeripheral.disconnectAsync();
        } catch (e) {
            bleLog("failed to disconnect:", e?.message || e);
        }
    }
    blePeripheral = null;
    bleChar = null;
}

// ============================================================
// BLE (the command path to the Pico itself)
//   The firmware advertises a GATT service compatible with NUS (Nordic UART Service).
//   It shares the same noble instance as the Pro Controller 2, and both can be connected at
//   once (multiple connections are a standard feature of a BLE central).
// ============================================================
const PICO_BLE_SERVICE_UUID = "6e400001b5a3f393e0a9e50e24dcca9e";
const PICO_BLE_RX_UUID = "6e400002b5a3f393e0a9e50e24dcca9e";
const PICO_BLE_TX_UUID = "6e400003b5a3f393e0a9e50e24dcca9e";

// The maximum number of bytes per write. Kept below the effective MTU on macOS (185 and up).
const PICO_BLE_CHUNK = 150;
// A write with a response is inserted every this many bytes, as rudimentary flow control that
// keeps us from outrunning the Pico's receive queue (4KB).
const PICO_BLE_ACK_INTERVAL = 1024;
// The cap on the send queue. Piling up beyond BLE's effective throughput eats memory while
// sending input from minutes ago.
const PICO_BLE_QUEUE_LIMIT = 64 * 1024;

let picoBle = null;           // { peripheral, rx, name, id } the established link
let picoBlePending = null;    // the state of a connection request (still discovering)
let picoScanCollector = null; // Map(id => device), where a scan listing is collected

let picoBleWriteQueue = [];   // Buffer[]
let picoBleWriteQueuedBytes = 0;
let picoBleUnackedBytes = 0;
let picoBleWriting = false;

function picoBleLog(...args) {
    console.log("[PICO-BLE]", ...args);
}

function normalizeBleUuid(u) {
    return String(u || "").toLowerCase().replace(/-/g, "");
}

function advertisesPicoService(peripheral) {
    const uuids = peripheral?.advertisement?.serviceUuids || [];
    return uuids.some((u) => normalizeBleUuid(u) === PICO_BLE_SERVICE_UUID);
}

function waitForBleReady(timeoutMs) {
    if (bleReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const timer = setInterval(() => {
            if (bleReady) {
                clearInterval(timer);
                resolve();
            } else if (Date.now() - t0 > timeoutMs) {
                clearInterval(timer);
                reject(new Error(tr("btUnavailable")));
            }
        }, 100);
    });
}

function resetPicoBleWriteState() {
    picoBleWriteQueue = [];
    picoBleWriteQueuedBytes = 0;
    picoBleUnackedBytes = 0;
}

// Take up to PICO_BLE_CHUNK bytes from the head of the queue (cutting mid-line is fine,
// since the firmware assembles lines out of a character stream)
function takePicoBleChunk() {
    const parts = [];
    let size = 0;
    while (picoBleWriteQueue.length && size < PICO_BLE_CHUNK) {
        const head = picoBleWriteQueue[0];
        const need = PICO_BLE_CHUNK - size;
        if (head.length <= need) {
            parts.push(head);
            size += head.length;
            picoBleWriteQueue.shift();
        } else {
            parts.push(head.subarray(0, need));
            picoBleWriteQueue[0] = head.subarray(need);
            size += need;
        }
    }
    picoBleWriteQueuedBytes -= size;
    return Buffer.concat(parts, size);
}

async function drainPicoBleQueue() {
    if (picoBleWriting) return;
    picoBleWriting = true;
    try {
        while (picoBle && picoBleWriteQueue.length) {
            const link = picoBle;
            const chunk = takePicoBleChunk();
            picoBleUnackedBytes += chunk.length;
            const withResponse = picoBleUnackedBytes >= PICO_BLE_ACK_INTERVAL;
            if (withResponse) picoBleUnackedBytes = 0;
            // writeAsync(data, withoutResponse)
            await link.rx.writeAsync(chunk, !withResponse);
        }
    } catch (e) {
        picoBleLog("write error:", e?.message || e);
        // Having failed partway, sending the rest would resume from the middle of a line and
        // leave the firmware reading a corrupted command. Drop the whole queue.
        resetPicoBleWriteState();
        macroRunning = false;
        broadcastPicoMessage({
            type: "error",
            message: tr("bleWriteAborted", { reason: e?.message || String(e) }),
            aborted: true,
        });
    } finally {
        picoBleWriting = false;
    }
}

function picoBleQueueWrite(str) {
    if (!picoBle) return;
    const buf = Buffer.from(str, "utf8");
    if (picoBleWriteQueuedBytes + buf.length > PICO_BLE_QUEUE_LIMIT) {
        picoBleLog("send queue exceeded its cap, dropping:", picoBleWriteQueuedBytes + buf.length);
        resetPicoBleWriteState();
        macroRunning = false;
        broadcastPicoMessage({
            type: "error",
            message: tr("bleWriteQueueOverflow"),
            aborted: true,
        });
        return;
    }
    picoBleWriteQueue.push(buf);
    picoBleWriteQueuedBytes += buf.length;
    drainPicoBleQueue();
}

// An unexpected disconnect (power loss, out of range, ...). A user-initiated disconnect never
// reaches here, because cleanupPicoBle() detaches picoBle first.
function handlePicoBleDisconnect(peripheral) {
    if (!picoBle || picoBle.peripheral !== peripheral) return;
    picoBleLog("disconnected:", picoBle.name);
    picoBle = null;
    resetPicoBleWriteState();
    // The link is already gone, so no neutral is sent (there is nowhere to send it)
    const passthroughStopped = teardownPassthroughForLink();
    broadcastPicoMessage({ type: "closed", expected: false, passthroughStopped });
    bleUpdateScanning();
}

async function connectPicoBlePeripheral(peripheral, pending) {
    try {
        await bleStopScanning();

        picoBleLog("connecting:", peripheral.advertisement?.localName || peripheral.id);
        await Promise.race([
            peripheral.connectAsync(),
            new Promise((_, rej) =>
                setTimeout(() => rej(new Error(tr("picoBleConnectTimeout"))), 15000)
            ),
        ]);

        const found = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [PICO_BLE_SERVICE_UUID], [PICO_BLE_RX_UUID, PICO_BLE_TX_UUID]
        );
        const chars = found?.characteristics || [];
        const rx = chars.find((c) => normalizeBleUuid(c.uuid) === PICO_BLE_RX_UUID);
        const tx = chars.find((c) => normalizeBleUuid(c.uuid) === PICO_BLE_TX_UUID);
        if (!rx || !tx) {
            throw new Error(tr("picoBleCharMissing"));
        }


        // Responses (MACRO LOADED / ERR / the version) arrive line by line over notify
        let rxBuffer = "";
        tx.on("data", (chunk) => {
            rxBuffer += chunk.toString("utf8");
            let nl;
            while ((nl = rxBuffer.indexOf("\n")) >= 0) {
                const line = rxBuffer.slice(0, nl).replace(/\r$/, "").trim();
                rxBuffer = rxBuffer.slice(nl + 1);
                if (!line) continue;
                console.log("[PICO] recv:", line);
                broadcastPicoMessage({ type: "line", line });
            }
            if (rxBuffer.length > 4096) rxBuffer = "";
        });
        await tx.subscribeAsync();

        // Do not complete if a cancel, a disconnect or a reconnect happened while connecting.
        // This point (just before the assignment to picoBle) is after the last await, so
        // nothing can interleave between the check and the assignment
        if (pending.cancelled) {
            throw new Error(tr("connectCancelled"));
        }

        const name = peripheral.advertisement?.localName || pending.name || "Karakuri";
        picoBle = { peripheral, rx, name, id: peripheral.id };
        resetPicoBleWriteState();
        peripheral.once("disconnect", () => handlePicoBleDisconnect(peripheral));

        picoBleLog("connected:", name);
        broadcastPicoMessage({ type: "connected", transport: "ble", name });
        pending.finish();
        pending.resolve("OK");
    } catch (e) {
        picoBleLog("failed to connect:", e?.message || e);
        // Return the result to the caller first. disconnectAsync can hang forever when the peer
        // is gone, and awaiting it would freeze the connect button.
        pending.finish();
        pending.reject(e instanceof Error ? e : new Error(String(e)));
        try {
            peripheral.disconnectAsync().catch(() => {});
        } catch (e2) { /* already disconnected */ }
    } finally {
        bleUpdateScanning();
    }
}

function onPicoBleDiscover(peripheral) {
    if (!advertisesPicoService(peripheral)) return;
    const name = peripheral.advertisement?.localName || "";

    if (picoScanCollector) {
        picoScanCollector.set(peripheral.id, {
            id: peripheral.id,
            name: name || tr("unknownDeviceName"),
            rssi: peripheral.rssi ?? 0,
        });
    }

    if (picoBlePending && !picoBlePending.connecting) {
        const t = picoBlePending;
        const matches = t.id ? peripheral.id === t.id : (t.name ? name === t.name : true);
        if (!matches) return;
        t.connecting = true;
        connectPicoBlePeripheral(peripheral, t);
    }
}

function connectPicoBle({ name = "", id = "" } = {}) {
    if (!initNoble()) {
        return Promise.reject(new Error(tr("nobleLoadFailed")));
    }
    if (picoBlePending) {
        picoBlePending.cancel(tr("connectSuperseded"));
    }

    return new Promise((resolve, reject) => {
        const pending = {
            name: String(name || "").trim(),
            id: String(id || "").trim(),
            connecting: false,
            cancelled: false,
            resolve,
            reject,
            timer: null,
            finish() {
                if (pending.timer) clearTimeout(pending.timer);
                pending.timer = null;
                if (picoBlePending === pending) picoBlePending = null;
            },
            cancel(msg) {
                pending.cancelled = true;
                pending.finish();
                reject(new Error(msg));
                bleUpdateScanning();
            },
        };

        waitForBleReady(10000).then(async () => {
            if (picoBlePending !== pending) return;   // already cancelled
            pending.timer = setTimeout(() => {
                if (pending.connecting) return;       // the connect path will settle it
                pending.cancel(
                    tr("picoBleNotFound") +
                    (pending.name ? tr("picoBleNotFoundNamed", { name: pending.name })
                                  : tr("picoBleNotFoundGeneric"))
                );
            }, 15000);
            // Scanning may have been stopped by a connection attempt, so restart it
            await bleStopScanning();
            await bleUpdateScanning();
        }).catch((e) => {
            if (picoBlePending === pending) pending.cancel(e?.message || String(e));
        });

        picoBlePending = pending;
    });
}

// A BLE disconnect triggered by the user (the disconnect button, or reconnecting).
// Returns whether passthrough was actually stopped.
function cleanupPicoBle() {
    if (picoBlePending) {
        picoBlePending.cancel(tr("connectCancelled"));
    }
    if (!picoBle) return false;
    const p = picoBle.peripheral;
    picoBleLog("disconnecting:", picoBle.name);
    // Send neutral while the link is still alive, then detach it
    const passthroughStopped = teardownPassthroughForLink({ sendCenter: true });
    picoBle = null;
    resetPicoBleWriteState();
    try {
        p.disconnectAsync().catch(() => {});
    } catch (e) {
        picoBleLog("failed to disconnect:", e?.message || e);
    }
    return passthroughStopped;
}

// ===== Shared helpers for the Pico link (papering over TCP / BLE) =====
function picoLinkConnected() {
    return !!picoClient || !!picoBle;
}

function picoLinkPendingBytes() {
    if (picoClient) return picoClient.writableLength;
    if (picoBle) return picoBleWriteQueuedBytes;
    return 0;
}

function picoLinkWrite(str) {
    if (picoClient) picoClient.write(str);
    else if (picoBle) picoBleQueueWrite(str);
}

function scanForController() {
    // Leave the HID side alone while the BLE controller (Pro Controller 2) is connected
    if (controllerState.kind === "ble" && controllerState.connected) return;

    // A broken node-hid binding (e.g. build/Release lost to a yarn add/remove reinstall) would
    // otherwise throw here on every 2.5s tick and flood the log with FATALs. It cannot recover
    // without a reinstall, so report it once and stop the watcher.
    let all;
    try {
        all = HID.devices();
    } catch (e) {
        console.error("[HID] enumeration failed, stopping the controller watcher:", e?.message || e);
        console.error("[HID] to repair the binding: npm rebuild node-hid (or yarn prebuilds:restore)");
        if (controllerWatcher) {
            clearInterval(controllerWatcher);
            controllerWatcher = null;
        }
        return;
    }

    const devices = all.filter(
        (d) =>
            d.vendorId === PRO_CONTROLLER_VENDOR_ID &&
            d.productId === PRO_CONTROLLER_PRODUCT_ID &&
            // Our own usbmode=procon dongle presents the same VID/PID but is not a recording
            // source (it goes into the console; on a PC it belongs to the WebHID tester).
            // Grabbing it also misparses: its standard 0x30 stream is offset by two bytes
            // (timer/battery) from the layout this parser expects, which made half the
            // buttons and both sticks flail. The manufacturer string tells it apart.
            (d.manufacturer || "") !== "Karakuri"
    );

    const preferred = controllerState.serialNumber
        ? devices.find((d) => d.serialNumber === controllerState.serialNumber)
        : null;
    const target = preferred || devices[0];

    if (!target && controllerDevice) {
        console.log("[HID] controller removed");
        closeControllerDevice();
        return;
    }

    if (target) {
        const needsReconnect =
            !controllerDevice ||
            controllerState.devicePath !== (target.path || "") ||
            controllerState.serialNumber !== (target.serialNumber || "");

        if (needsReconnect) {
            closeControllerDevice();
            openController(target);
        }
    }
}

function startControllerWatcher() {
    if (controllerWatcher) return;
    controllerWatcher = setInterval(scanForController, CONTROLLER_SCAN_INTERVAL_MS);
    scanForController();
}

app.whenReady().then(() => {
    installAppMenu();
    createWindow();
    startControllerWatcher();
    initAutoUpdater();
});

// On macOS the process survives closing every window. When it is called back from the Dock,
// the window and the controller watcher are re-established (without which recording is dead).
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    createWindow();
    startControllerWatcher();
});

app.on("window-all-closed", () => {
    if (controllerWatcher) {
        clearInterval(controllerWatcher);
        controllerWatcher = null;
    }
    closeControllerDevice();
    if (process.platform !== "darwin") app.quit();
});

// Release the resources still open at exit.
// Serial and BLE in particular can leave the next launch facing a "device in use" error and
// force a reboot if the process disappears while still holding them.
let quitCleanupDone = false;
app.on("before-quit", () => {
    if (quitCleanupDone) return;
    quitCleanupDone = true;
    console.log("[APP] before-quit: releasing resources");

    try { cleanupLink(); } catch (e) { console.error("[APP] cleanupLink error:", e); }
    try { cleanupSerial(); } catch (e) { console.error("[APP] cleanupSerial error:", e); }
    ptStopStickPump();

    if (controllerWatcher) {
        clearInterval(controllerWatcher);
        controllerWatcher = null;
    }
    try { closeControllerDevice(); } catch (e) { console.error("[APP] closeControllerDevice error:", e); }
    stopBleController().catch(() => {});
});

// ===== Auto update (electron-updater) =====
// The UX is "notify only, download on demand": autoDownload is off, so startup only runs a
// check and reports an available update to the renderer (the chip in the title bar). The
// download starts on a user action (update-download), and it is applied with "restart and
// install" (update-quit-and-install). An update that was downloaded and then left alone is
// applied on the next normal quit, through autoInstallOnAppQuit.
// The feed comes from the app-update.yml that electron-builder bakes in from the publish
// settings in package.json (the eggletric/karakuri-pad releases, readable without auth).
// Development and unpackaged runs are out of scope (electron-updater does not support them).
// For checking the UI: KARAKURI_FAKE_UPDATE=available|downloaded|error (unpackaged only)
// injects a state, update-download replays fake progress, and quit-and-install is a no-op.
let autoUpdater = null;
let updateState = { status: "idle", version: null };   // idle | available | downloading | downloaded | error

const isFakeUpdate = () => !app.isPackaged && !!process.env.KARAKURI_FAKE_UPDATE;

function setUpdateState(patch) {
    updateState = { ...updateState, ...patch };
    for (const w of BrowserWindow.getAllWindows()) {
        try {
            w.webContents.send("update-state-changed", updateState);
        } catch (e) {
            console.error("[updater] send update-state-changed error:", e);
        }
    }
}

function initAutoUpdater() {
    if (isFakeUpdate()) {
        const status = process.env.KARAKURI_FAKE_UPDATE;
        if (["available", "downloaded", "error"].includes(status)) {
            setUpdateState({ status, version: "9.9.9" });
        }
        return;
    }
    if (!app.isPackaged) return;
    try {
        ({ autoUpdater } = require("electron-updater"));
    } catch (err) {
        console.warn("[updater] failed to load electron-updater:", err?.message || err);
        return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-available", (info) => setUpdateState({ status: "available", version: info?.version || null }));
    autoUpdater.on("download-progress", (p) => setUpdateState({ status: "downloading", percent: Math.round(p?.percent || 0) }));
    autoUpdater.on("update-downloaded", (info) => setUpdateState({ status: "downloaded", version: info?.version || updateState.version }));
    autoUpdater.on("error", (err) => {
        // Errors during the check (being offline and the like) are everyday events, so they are
        // only logged. Only a failure mid-download is reported back to the UI.
        console.warn("[updater]", err?.message || err);
        if (updateState.status === "downloading") setUpdateState({ status: "error", message: err?.message || String(err) });
    });
    autoUpdater.checkForUpdates().catch((err) => console.warn("[updater] check failed:", err?.message || err));
}

ipcMain.handle("update-get-state", async () => updateState);

ipcMain.handle("update-download", async () => {
    if (updateState.status !== "available" && updateState.status !== "error") return { ok: false, reason: "no_update" };
    if (isFakeUpdate()) {
        // Fake progress: replays 0 -> 100% in 20% steps before moving to downloaded
        let pct = 0;
        setUpdateState({ status: "downloading", percent: 0 });
        const timer = setInterval(() => {
            pct += 20;
            if (pct >= 100) {
                clearInterval(timer);
                setUpdateState({ status: "downloaded" });
            } else {
                setUpdateState({ status: "downloading", percent: pct });
            }
        }, 400);
        return { ok: true };
    }
    if (!autoUpdater) return { ok: false, reason: "unavailable" };
    setUpdateState({ status: "downloading", percent: 0 });
    autoUpdater.downloadUpdate().catch((err) => {
        console.warn("[updater] download failed:", err?.message || err);
        setUpdateState({ status: "error", message: err?.message || String(err) });
    });
    return { ok: true };
});

ipcMain.handle("update-quit-and-install", async () => {
    if (updateState.status !== "downloaded") return { ok: false, reason: "not_downloaded" };
    // Restarting mid-macro would leave the firmware running a macro with nothing driving it,
    // so it is refused here in main rather than relying on the renderer to hide the button.
    // Passthrough is not a blocker: it is self-sufficient and simply ends with the restart.
    if (macroRunning && picoLinkConnected()) return { ok: false, reason: "busy" };
    if (isFakeUpdate()) {
        console.log("[updater] fake quitAndInstall (no-op)");
        return { ok: true };
    }
    if (!autoUpdater) return { ok: false, reason: "not_downloaded" };
    setImmediate(() => autoUpdater.quitAndInstall());
    return { ok: true };
});

// The flag marking a macro as running (on the firmware side).
// Set when Play is sent, cleared by sending MACRO STOP or by a TCP disconnect.
let macroRunning = false;

// Whether the disconnect was triggered by the user (the disconnect button, or reconnecting).
// A close arriving while this is false is reported as an unexpected disconnect.
let picoCloseExpected = false;

// ===== TCP client management =====
// Returns whether passthrough was actually stopped.
function cleanupClient() {
    let passthroughStopped = false;

    if (picoClient) {
        picoCloseExpected = true;
        // Send neutral while the link is still alive, then take it down
        passthroughStopped = teardownPassthroughForLink({ sendCenter: true });
        try {
            picoClient.end();
            picoClient.destroy();
        } catch (e) {
            console.error("picoClient destroy error:", e);
        }
        picoClient = null;
        picoTcpTarget = null;
    }

    // The socket of a connection attempt in flight is destroyed too. Left alone, the OS keeps
    // retrying the SYN, and a late connect/close arrives and corrupts the state.
    if (picoTcpConnecting) {
        const sock = picoTcpConnecting;
        picoTcpConnecting = null;
        try {
            sock.destroy(new Error(tr("connectCancelled")));
        } catch (e) {
            console.error("[PICO] connecting socket destroy error:", e);
        }
    }

    return passthroughStopped;
}

// Close both TCP and BLE (shared by reconnecting and the disconnect button)
// Returns whether passthrough was actually stopped.
function cleanupLink() {
    // Run both up front, so short-circuit evaluation cannot skip one of them
    const tcpStopped = cleanupClient();
    const bleStopped = cleanupPicoBle();
    return tcpStopped || bleStopped;
}

// Connect. payload is { type: "tcp", host, port } or { type: "ble", name, id }.
// With type omitted it is treated as TCP, as before.
ipcMain.handle("pico-connect", async (_event, payload = {}) => {
    if (payload.type === "ble") {
        cleanupLink();
        return connectPicoBle(payload);
    }

    const { host } = payload;
    const port = Number(payload.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(tr("tcpPortInvalid"));
    }

    return new Promise((resolve, reject) => {
        cleanupLink();

        const sock = new net.Socket();
        picoTcpConnecting = sock;   // tracked so it can be cancelled (pico-connect-cancel)
        sock.setNoDelay(true);

        // Keeps an unresponsive target from making us wait out the OS SYN retries (up to 75
        // seconds). On timeout the socket is destroyed and an error returned immediately.
        const connectTimer = setTimeout(() => {
            if (picoClient !== sock) {
                sock.destroy(new Error(tr("tcpConnectTimeout")));
            }
        }, 10000);

        // The firmware returns MACRO LOADED / ERR / the version, line by line.
        // Discarding them unread would hide dropped steps.
        let rxBuffer = "";
        sock.setEncoding("utf8");
        sock.on("data", (chunk) => {
            rxBuffer += chunk;
            let nl;
            while ((nl = rxBuffer.indexOf("\n")) >= 0) {
                const line = rxBuffer.slice(0, nl).replace(/\r$/, "").trim();
                rxBuffer = rxBuffer.slice(nl + 1);
                if (!line) continue;
                console.log("[PICO] recv:", line);
                broadcastPicoMessage({ type: "line", line });
            }
            // A safeguard against eating memory on a flood of malformed data with no newline
            if (rxBuffer.length > 4096) rxBuffer = "";
        });

        sock.on("connect", () => {
            clearTimeout(connectTimer);

            // Do not complete if a cancel or a newer connection request has already replaced it
            if (picoTcpConnecting !== sock) {
                try { sock.destroy(); } catch (e) { /* already destroyed */ }
                reject(new Error(tr("connectCancelled")));
                return;
            }
            // If another socket got established first, do not overwrite it last-one-wins
            if (picoClient && picoClient !== sock) {
                try { sock.destroy(); } catch (e) { /* already destroyed */ }
                picoTcpConnecting = null;
                reject(new Error(tr("connectSuperseded")));
                return;
            }

            console.log("[PICO] connected to", host, port);
            picoTcpConnecting = null;
            picoClient = sock;
            sock._picoEstablished = true;
            picoTcpTarget = { host: String(host || ""), port };
            broadcastPicoMessage({ type: "connected", host, port });
            resolve("OK");
        });

        sock.on("error", (err) => {
            clearTimeout(connectTimer);
            console.error("[PICO] socket error:", err);
            // The decision is made on "is this the socket I established".
            // Going by whether the global picoClient exists means a connection failure is never
            // rejected — and hangs — merely because another path (BLE or another socket) is up.
            if (picoClient !== sock) {
                reject(err);
            } else {
                broadcastPicoMessage({ type: "error", message: err?.message || String(err) });
            }
        });

        sock.on("close", () => {
            if (picoTcpConnecting === sock) picoTcpConnecting = null;
            // A close on a socket that was never established is not a disconnect.
            // Connection failures and cancels are reported by rejecting the connect Promise.
            if (!sock._picoEstablished) {
                console.log("[PICO] socket closed (never established)");
                return;
            }
            sock._picoEstablished = false;
            console.log("[PICO] disconnected");

            const expected = picoCloseExpected;
            picoCloseExpected = false;
            let passthroughStopped = false;
            if (picoClient === sock) {
                picoClient = null;
                picoTcpTarget = null;
                // The destination is gone, so passthrough stops too (never leave BLE held)
                passthroughStopped = teardownPassthroughForLink();
            }
            broadcastPicoMessage({ type: "closed", expected, passthroughStopped });
        });

        sock.connect(port, host);
    });
});

ipcMain.handle("pico-controller-status", async () => {
    return {
        bridgeAvailable: true,
        connected: controllerState.connected,
        kind: controllerState.kind,
        deviceName: controllerState.deviceName,
        message: controllerState.statusMessage,
        setupLinks: controllerState.setupLinks,
        bleSearching: bleWanted && !blePeripheral,
    };
});

// Start or stop discovery for the Pro Controller 2 (BLE).
// noble asks for the Bluetooth permission the moment it is loaded, so it is only woken up when recording is used.
ipcMain.handle("pico-controller-ble-start", async () => {
    const ok = acquireBle("record");
    return { started: ok, message: controllerState.statusMessage };
});

ipcMain.handle("pico-controller-ble-stop", async () => {
    await releaseBle("record");
    return { stopped: true };
});

// ===== Passthrough IPC =====
ipcMain.handle("pico-passthrough-start", async () => {
    if (!picoLinkConnected()) {
        return { ok: false, message: tr("connectFirst") };
    }
    passthroughEnabled = true;
    ptStartStickPump();
    acquireBle("passthrough");   // also wakes discovery for the Pro Controller 2 (the 1st gen HID one is always watched)
    return { ok: true };
});

ipcMain.handle("pico-passthrough-stop", async () => {
    // Send neutral so nothing is left held if it was stopped with a button or stick still engaged
    const stopped = teardownPassthroughForLink({ sendCenter: true });
    // Even if it was already stopped through another path, make sure the BLE reference is released
    if (!stopped) await releaseBle("passthrough");
    return { ok: true };
});

// Whether there is "work in progress" that should block a tab switch
ipcMain.handle("pico-activity-status", async () => {
    return {
        macroRunning: macroRunning && picoLinkConnected(),
        passthroughEnabled,
    };
});

ipcMain.handle("pico-passthrough-status", async () => {
    return {
        enabled: passthroughEnabled,
        picoConnected: picoLinkConnected(),
        controllerConnected: controllerState.connected,
        kind: controllerState.kind,
        deviceName: controllerState.deviceName,
        bleSearching: bleWanted && !blePeripheral,
        message: controllerState.statusMessage,
    };
});

// The current link state. Used by the renderer to re-read the truth at startup and on a redraw.
ipcMain.handle("pico-link-status", async () => {
    if (picoClient) {
        return {
            connected: true,
            type: "tcp",
            name: null,
            host: picoTcpTarget?.host || null,
            port: picoTcpTarget?.port ?? null,
        };
    }
    if (picoBle) {
        return {
            connected: true,
            type: "ble",
            name: picoBle.name || null,
            host: null,
            port: null,
        };
    }
    return { connected: false, type: null, name: null, host: null, port: null };
});

// Disconnect
ipcMain.handle("pico-disconnect", async () => {
    console.log("[PICO] disconnect requested");
    const passthroughStopped = cleanupLink();
    broadcastPicoMessage({ type: "closed", expected: true, passthroughStopped });
    return "DISCONNECTED";
});

// Cancelling a connection attempt. The pico-connect Promise in flight is rejected with a
// cancellation error (which the renderer uses to fall back to "not connected" rather than
// to "error").
ipcMain.handle("pico-connect-cancel", async () => {
    let cancelled = false;
    if (picoBlePending) {
        picoBlePending.cancel(tr("connectCancelled"));
        cancelled = true;
    }
    if (picoTcpConnecting) {
        const sock = picoTcpConnecting;
        picoTcpConnecting = null;
        try {
            sock.destroy(new Error(tr("connectCancelled")));
        } catch (e) {
            console.error("[PICO] cancel destroy error:", e);
        }
        cancelled = true;
    }
    console.log("[PICO] connect cancel requested, cancelled =", cancelled);
    return { cancelled };
});

// Scanning for the Pico (BLE). For the "Scan" button in the connection settings modal.
let picoScanRunning = false;

ipcMain.handle("pico-ble-scan", async (_event, payload = {}) => {
    // Running it twice means the second one touches picoScanCollector after the first has set
    // it to null, producing a TypeError. Return an error immediately while one is running.
    if (picoScanRunning) {
        return { devices: [], error: tr("bleScanBusy") };
    }

    const duration = Math.min(Math.max(Number(payload.durationMs) || 4000, 1000), 10000);
    if (!initNoble()) {
        return { devices: [], error: tr("nobleLoadFailed") };
    }

    picoScanRunning = true;
    let collector = null;
    try {
        try {
            await waitForBleReady(8000);
        } catch (e) {
            return { devices: [], error: e?.message || String(e) };
        }

        collector = new Map();
        picoScanCollector = collector;
        // A connected Pico stops advertising and never shows up in a scan, so add it to the candidates directly
        if (picoBle) {
            collector.set(picoBle.id, {
                id: picoBle.id,
                name: picoBle.name,
                rssi: 0,
                connected: true,
            });
        }
        // Scanning may have been stopped by a connection attempt, so restart it
        await bleStopScanning();
        await bleUpdateScanning();
        await new Promise((r) => setTimeout(r, duration));

        const devices = [...collector.values()]
            .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
        return { devices };
    } finally {
        // Only detach the collector we installed ourselves (never take a later scan's down with it)
        if (collector && picoScanCollector === collector) picoScanCollector = null;
        picoScanRunning = false;
        await bleUpdateScanning();
    }
});

// A one-off send
ipcMain.handle("pico-send", (_event, line) => {
    if (!picoLinkConnected()) {
        console.warn("[PICO] not connected, cannot send:", line);
        throw new Error("Not connected");
    }

    console.log("[PICO] send:", line);
    if (String(line).trim().toUpperCase() === "MACRO STOP") {
        macroRunning = false;
    }
    picoLinkWrite(line + "\n");
    return "SENT";
});

// Sending a macro
ipcMain.handle("pico-send-macro", (_event, steps) => {
    if (!picoLinkConnected()) {
        console.warn("[PICO] not connected, cannot send macro");
        throw new Error("Not connected");
    }
    if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error("No macro steps");
    }

    console.log("[PICO] macro start, steps =", steps.length);

    // Over BLE it is queued and sent in order, split into chunks with rudimentary flow control
    // (anything dropped is detectable from the MACRO LOADED response)
    picoLinkWrite("MACRO LOAD 100\n");
    let sent = 0;
    for (const s of steps) {
        if (typeof s === "string" && s.trim()) {
            picoLinkWrite(s.trim() + "\n");
            sent++;
        }
    }
    picoLinkWrite("MACRO END\n");
    picoLinkWrite("MACRO START\n");

    // Return the number sent, so it can be checked against the firmware's "MACRO LOADED <accepted> <dropped>"
    macroRunning = true;
    broadcastPicoMessage({ type: "macro-sent", sent });
    return { status: "MACRO_SENT", sent };
});

// =======================================
// ===== USB serial (for configuration) =====
// =======================================

// "Was this disconnect triggered by the user (the disconnect button, a port change, leaving
// the tab)?" is tracked per port (port._expectedClose). Held globally, the closes of an old
// port awaiting shutdown and of a new port would cross and be mistaken for each other.

function broadcastSerialClosed(expected) {
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
        try {
            w.webContents.send("pico-serial-closed", { expected });
        } catch (e) {
            console.error("[SERIAL] send pico-serial-closed error:", e);
        }
    }
}

// Makes it possible to wait for the close to complete. Opening the same (or another) port
// before it has fully closed can fail because the OS still holds it, or let the old port's
// close wipe out the new port's state.
const SERIAL_CLOSE_TIMEOUT_MS = 3000;

function cleanupSerial() {
    const port = picoSerial;
    picoSerial = null;
    picoSerialPath = "";
    if (!port) return Promise.resolve();

    port._expectedClose = true;
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        // Do not leave the caller hanging even when close never returns
        const timer = setTimeout(finish, SERIAL_CLOSE_TIMEOUT_MS);
        const settle = () => { clearTimeout(timer); finish(); };

        try {
            if (!port.isOpen) {
                settle();
                return;
            }
            port.close((err) => {
                if (err) console.error("[SERIAL] close error:", err);
                settle();
            });
        } catch (e) {
            console.error("[SERIAL] close error:", e);
            settle();
        }
    });
}

const PICO_VENDOR_IDS = ["2e8a"];
const PICO_PRODUCT_IDS = [
    "0003",
    "0004",
    "0005",
    "000a",
    "000b",
    "000c",
    "000d",
    "000e",
];
const PICO_KEYWORDS = ["raspberry pi pico", "pico w", "raspberry pi", "rp2040", "rpi-rp2", "gp2040-compat"];

function matchesPicoVendorProduct(port) {
    const vid = normalizeHex(port.vendorId);
    const pid = normalizeHex(port.productId);

    if (!vid) return false;
    if (!PICO_VENDOR_IDS.includes(vid)) return false;
    if (!pid) return true;
    if (PICO_PRODUCT_IDS.length === 0) return true;
    return PICO_PRODUCT_IDS.includes(pid);
}

// The USB identities the firmware presents (they vary by mode). CDC is alive under all of them.
// bt/wifi = HORI pad impersonation / dongle = SInput, DS4, Switch (the same HORI identity)
// or Pro Controller emulation, per usbmode
const FIRMWARE_USB_PAIRS = [
    ["0f0d", "0092"],   // HORI (it also matches on the manufacturer keyword, but be explicit)
    ["2e8a", "10c6"],   // SInput dongle
    ["054c", "05c4"],   // DualShock 4 dongle
    ["057e", "2009"],   // Pro Controller emulation dongle
];

function matchesFirmwareUsbPair(port) {
    const vid = normalizeHex(port.vendorId);
    const pid = normalizeHex(port.productId);
    return FIRMWARE_USB_PAIRS.some(([v, p]) => v === vid && p === pid);
}

function matchPathForPlatform(pathStr) {
    if (typeof pathStr !== "string") return false;

    const patternsByOs = {
        darwin: [/^\/dev\/(tty|cu)\.usbmodem/i],
        linux: [/^\/dev\/ttyACM/i, /^\/dev\/ttyUSB/i],
        win32: [/^COM\d+/i],
    };

    const patterns = patternsByOs[process.platform] || [];
    return patterns.some((re) => re.test(pathStr));
}

function containsPicoKeywords(port) {
    const candidates = [
        port.manufacturer,
        port.friendlyName,
        port.serialNumber,
        port.pnpId,
        port.path,
    ]
        .map((v) => (v || "").toLowerCase())
        .filter(Boolean);

    const result = PICO_KEYWORDS.some((keyword) =>
        candidates.some((value) => value.includes(keyword))
    );

    return result;
}

function isPicoPort(port) {
    if (!matchPathForPlatform(port.path)) return false;

    if (matchesFirmwareUsbPair(port)) return true;
    if (matchesPicoVendorProduct(port)) return true;

    // On macOS the Raspberry Pi Pico sometimes reports no vendorId/productId, so there is a
    // fallback that decides on the path alone when that information is missing.
    const lacksUsbIds = !normalizeHex(port.vendorId) && !normalizeHex(port.productId);
    if (process.platform === "darwin" && lacksUsbIds) {
        return true;
    }

    return containsPicoKeywords(port);
}

// Listing the serial ports
ipcMain.handle("pico-serial-list", async () => {
    try {
        const ports = await SerialPort.list();
        return ports
            .filter(isPicoPort)
            .map((p) => {
                const vendorId = p.vendorId || "";
                const productId = p.productId || "";
                const manufacturer = p.manufacturer || "";
                const serialNumber = p.serialNumber || "";

                return {
                    path: p.path,
                    manufacturer,
                    serialNumber,
                    vendorId,
                    productId,
                    displayName: p.path,
                };
            });
    } catch (e) {
        console.error("[SERIAL] list error:", e);
        return [];
    }
});

// Connecting over serial
ipcMain.handle("pico-serial-open", async (_event, pathToOpen) => {
    const normalizedPath = typeof pathToOpen === "string" ? pathToOpen.trim() : "";
    if (!normalizedPath) {
        throw new Error("path is required");
    }

    // Wait for the previous port to finish closing before opening
    await cleanupSerial();

    return new Promise((resolve, reject) => {
        const options = {
            path: normalizedPath,
            baudRate: 115200,
        };

        const port = new SerialPort(options, (err) => {
            if (err) {
                console.error("[SERIAL] open error:", err);
                const errorMessage = `[SERIAL] open failed (${process.platform}): ${err.message || err}`;
                broadcastSerialError(errorMessage);
                return reject(new Error(errorMessage));
            }
            console.log("[SERIAL] opened:", normalizedPath, options);
            picoSerial = port;
            picoSerialPath = normalizedPath;

            // Broadcast the received serial data to the renderer
            port.on("data", (chunk) => {
                // If we have already switched to another port, discard what is left of the old one
                if (picoSerial !== port) return;
                const data = chunk.toString("utf8");
                console.log("[SERIAL] data:", JSON.stringify(data));
                const wins = BrowserWindow.getAllWindows();
                for (const w of wins) {
                    try {
                        w.webContents.send("pico-serial-data", data);
                    } catch (e) {
                        console.error("[SERIAL] send pico-serial-data error:", e);
                    }
                }
            });

            port.on("error", (e) => {
                if (picoSerial !== port) return;
                console.error("[SERIAL] runtime error:", e);
                broadcastSerialError(`[SERIAL] runtime error: ${e?.message || e}`);
            });

            port.on("close", () => {
                // A close is reported exactly once for our own port.
                // (cleanupSerial has already set picoSerial to null, so gating this on identity
                //  with picoSerial alone would swallow the notification)
                if (port._closeNotified) return;
                port._closeNotified = true;
                console.log("[SERIAL] closed");
                const expected = !!port._expectedClose;
                if (picoSerial === port) {
                    picoSerial = null;
                    picoSerialPath = "";
                }
                // Let the renderer know immediately about an unexpected close, e.g. the USB cable being pulled
                broadcastSerialClosed(expected);
            });

            resolve("OK");
        }
        );
    });
});

// Disconnecting the serial port
ipcMain.handle("pico-serial-close", async () => {
    await cleanupSerial();
    return "CLOSED";
});

// The current serial state
ipcMain.handle("pico-serial-state", async () => {
    return {
        open: !!(picoSerial && picoSerial.isOpen),
        path: picoSerialPath,
    };
});

// Sending the connection settings (mode=bt|wifi / the BLE device name / the Wi-Fi settings)
ipcMain.handle("pico-serial-send-config", async (_event, cfg) => {
    if (!picoSerial || !picoSerial.isOpen) {
        throw new Error("Serial not open");
    }

    const {
        mode = "bt",
        btname = "",
        usbmode = "sinput",
        ds4map = "",
        switchmap = "",
        macro = "off",
        ssid = "",
        password = "",
        ip = "",
        port = "5000",
        gateway = "",
        subnet = "",
    } = cfg || {};

    function writeLine(line) {
        return new Promise((resolve, reject) => {
            picoSerial.write(String(line || "") + "\n", (err) => {
                if (err) {
                    return reject(err);
                }
                picoSerial.drain((err2) => {
                    if (err2) return reject(err2);
                    resolve();
                });
            });
        });
    }

    console.log("[SERIAL] sending config to Pico, mode =", mode);
    // Key names matching what the firmware expects (mode/btname/ssid/pass/ip/port/gw/sn).
    // Only the keys relevant to the selected mode are sent. The firmware's CFG BEGIN carries
    // the current settings over, so the stored settings of the other side survive unwritten.
    // (CFG GET does not return the inactive side's settings either, so sending every key would
    //  wipe them with the form's empty strings.)
    const normalizedMode = mode === "wifi" ? "wifi" : mode === "dongle" ? "dongle" : "bt";
    await writeLine("CFG BEGIN");
    await writeLine(`mode=${normalizedMode}`);
    if (normalizedMode === "wifi") {
        await writeLine(`ssid=${ssid}`);
        await writeLine(`pass=${password}`);
        await writeLine(`ip=${ip}`);
        await writeLine(`port=${port}`);
        await writeLine(`gw=${gateway}`);
        await writeLine(`sn=${subnet}`);
    } else if (normalizedMode === "bt") {
        await writeLine(`btname=${btname}`);
    } else {
        // dongle: the USB identity, the macro recorder switch, and the C/GL/GR mappings
        // (ds4map for the DS4 identity, switchmap for Switch and Pro Controller)
        const um = ["ds4", "switch", "procon"].includes(usbmode) ? usbmode : "sinput";
        await writeLine(`usbmode=${um}`);
        await writeLine(`macro=${macro === "on" ? "on" : "off"}`);
        if (ds4map) await writeLine(`ds4map=${ds4map}`);
        if (switchmap) await writeLine(`switchmap=${switchmap}`);
    }
    await writeLine("CFG END");

    console.log("[SERIAL] config sent");
    return "CONFIG_SENT";
});

// Send an arbitrary line of text over serial (for the serial monitor)
ipcMain.handle("pico-serial-send-line", async (_event, line) => {
    if (!picoSerial || !picoSerial.isOpen) {
        throw new Error("Serial not open");
    }
    return new Promise((resolve, reject) => {
        picoSerial.write(String(line || "") + "\n", (err) => {
            if (err) {
                return reject(err);
            }
            picoSerial.drain((err2) => {
                if (err2) return reject(err2);
                resolve("SENT");
            });
        });
    });
});

// =======================================
// ===== RPI-RP2 (writing the UF2) ========
// =======================================

// Starting a PowerShell process is expensive, so it is only invoked when needed.
// Arguments are passed as an array to avoid the shell quoting nightmare.
function runPowerShell(script) {
    return execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        {
            encoding: "utf-8",
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
            timeout: 15000,
        }
    );
}

// Finds a Pico in BOOTSEL mode by its USB VID/PID and returns where it is mounted.
// It is the last resort when the label match found nothing, so findRpiRp2Paths() only calls
// it when it has to (the enumeration itself is expensive).
async function listBootselUsbMounts() {
    const results = [];

    if (process.platform === "win32") {
        try {
            const psScript = `
$ErrorActionPreference='Stop'
$needles = @('VID_2E8A&PID_0003','VID_2E8A&PID_0004','VID_2E8A&PID_0005','VID_2E8A&PID_000F')
$drives = Get-CimInstance -ClassName Win32_DiskDrive | Where-Object {
  $id = $_.PNPDeviceID
  $hit = $false
  foreach($needle in $needles){ if($id -like "*$($needle)*"){ $hit = $true } }
  $hit
}
$result = @()
foreach($d in $drives){
  $parts = Get-CimAssociatedInstance -InputObject $d -ResultClassName Win32_DiskPartition
  foreach($p in $parts){
    $logical = Get-CimAssociatedInstance -InputObject $p -ResultClassName Win32_LogicalDisk
    foreach($l in $logical){
      $prod = ($d.PNPDeviceID -replace '.*PID_([0-9A-Fa-f]{4}).*','$1')
      $result += [PSCustomObject]@{
        MountPoint = ([string]$l.DeviceID + '\\')
        VendorId = '2e8a'
        ProductId = [string]$prod
        SerialNumber = [string]$d.SerialNumber
        Description = [string]$d.Model
      }
    }
  }
}
ConvertTo-Json -InputObject @($result) -Compress
`;
            const { stdout } = await runPowerShell(psScript);
            const parsed = JSON.parse(String(stdout || "[]").trim() || "[]");
            if (Array.isArray(parsed)) results.push(...parsed);
            else if (parsed) results.push(parsed);
        } catch (err) {
            console.warn("[UF2] VID/PID detection via Windows PowerShell failed:", err?.message || err);
        }
    } else if (process.platform === "darwin") {
        try {
            const { stdout } = await execFileAsync("system_profiler", ["SPUSBDataType", "-json"], {
                encoding: "utf-8",
                maxBuffer: 16 * 1024 * 1024,
                timeout: 15000,
            });
            const buses = JSON.parse(String(stdout || "{}"))?.SPUSBDataType || [];

            // The mount point lives in media[].volumes[].mount_point.
            // There is no need to run diskutil and plutil in two stages.
            const mountPointsOf = (item) => {
                const points = [];
                const medias = item?.media || item?.Media || [];
                for (const media of medias) {
                    const volumes = media?.volumes || media?.Volumes || [];
                    for (const vol of volumes) {
                        const mp = vol?.mount_point || vol?.mountpoint || "";
                        if (mp) points.push(mp);
                    }
                }
                return points;
            };

            const flatten = (items = []) => {
                for (const item of items) {
                    // vendor_id can arrive in the form "0x2e8a  (Raspberry Pi Ltd)"
                    // (normalizeHex drops everything from the first space or bracket)
                    const vendor = normalizeHex(item.vendor_id);
                    const product = normalizeHex(item.product_id);

                    if (vendor === PICO_VENDOR_ID && PICO_BOOTSEL_PRODUCT_IDS.has(product)) {
                        for (const mountPoint of mountPointsOf(item)) {
                            results.push({
                                MountPoint: mountPoint,
                                VendorId: vendor,
                                ProductId: product,
                                SerialNumber: item.serial_num || "",
                                Description: item._name || item.product_id || "",
                            });
                        }
                    }

                    if (Array.isArray(item._items)) flatten(item._items);
                }
            };

            // The top level is the USB bus. Devices hang off _items.
            for (const bus of buses) flatten(bus?._items || []);
        } catch (err) {
            console.warn("[UF2] USB detection on macOS failed:", err?.message || err);
        }
    } else {
        try {
            const { stdout } = await execFileAsync(
                "lsblk",
                ["-J", "-O", "-o", "NAME,TYPE,MOUNTPOINT,RM,KNAME,PKNAME"],
                { encoding: "utf-8", maxBuffer: 8 * 1024 * 1024, timeout: 15000 }
            );
            const blk = JSON.parse(String(stdout || "{}")) || {};

            const readUdevProps = async (devName) => {
                try {
                    const { stdout: out } = await execFileAsync(
                        "udevadm",
                        ["info", "--query=property", "--name", `/dev/${devName}`],
                        { encoding: "utf-8", timeout: 10000 }
                    );
                    const props = {};
                    for (const line of String(out || "").split(/\r?\n/)) {
                        const [k, v] = line.split("=");
                        if (k) props[k.trim()] = (v || "").trim();
                    }
                    return props;
                } catch (err) {
                    return {};
                }
            };

            const collect = async (node, parentDiskProps = null) => {
                if (!node) return;
                const type = node.type;
                const mountPoint = node.mountpoint || "";
                let props = parentDiskProps;

                if (type === "disk") {
                    props = await readUdevProps(node.kname || node.name);
                }

                if (type === "part" && mountPoint && parentDiskProps) {
                    const vendor = normalizeHex(parentDiskProps.ID_VENDOR_ID || parentDiskProps.ID_VENDOR);
                    const product = normalizeHex(parentDiskProps.ID_MODEL_ID || parentDiskProps.ID_MODEL);
                    if (vendor === PICO_VENDOR_ID && PICO_BOOTSEL_PRODUCT_IDS.has(product)) {
                        results.push({
                            MountPoint: mountPoint,
                            VendorId: vendor,
                            ProductId: product,
                            SerialNumber: parentDiskProps.ID_SERIAL || "",
                            Description: parentDiskProps.ID_MODEL || "",
                        });
                    }
                }

                if (Array.isArray(node.children)) {
                    for (const child of node.children) await collect(child, props);
                }
            };

            for (const dev of blk.blockdevices || []) {
                await collect(dev, null);
            }
        } catch (err) {
            console.warn("[UF2] lsblk/udev detection on Linux failed:", err?.message || err);
        }
    }

    return results.filter((r) => r?.MountPoint);
}

// Papers over spelling differences in candidate paths. On Windows "D:/", "D:\\" and "d:\\" are
// the same drive, so the separators are normalised before deduplicating.
function normalizeCandidatePath(value) {
    let s = String(value || "").trim();
    if (!s) return "";
    if (process.platform === "win32") {
        s = s.replace(/\//g, "\\");
        if (/^[A-Za-z]:$/.test(s)) s += "\\";
        s = s.replace(/\\+$/, "\\");
        return s.toUpperCase();
    }
    if (s.length > 1) s = s.replace(/\/+$/, "");
    return s;
}

async function findRpiRp2Paths() {
    const candidates = [];
    const addCandidate = (value, labelMatched, source = "", meta = {}) => {
        const normalized = normalizeCandidatePath(value);
        if (!normalized) return;
        if (candidates.some((c) => c.path === normalized)) return;
        candidates.push({ path: normalized, labelMatched: !!labelMatched, source, ...meta });
    };
    const hasLabelMatch = () => candidates.some((c) => c.labelMatched);

    if (process.platform === "win32") {
        // Windows: search by volume label.
        // wmic was dropped from the defaults in Windows 11 24H2, so Get-Volume comes first and
        // the old wmic is kept as a fallback for environments where it does not work.
        let volumes = [];
        try {
            const { stdout } = await runPowerShell(
                "ConvertTo-Json -InputObject @(Get-Volume | Where-Object { $_.DriveLetter } |" +
                " ForEach-Object { [PSCustomObject]@{ DriveLetter = [string]$_.DriveLetter;" +
                " Label = [string]$_.FileSystemLabel } }) -Compress"
            );
            const parsed = JSON.parse(String(stdout || "[]").trim() || "[]");
            volumes = Array.isArray(parsed) ? parsed : [parsed];
        } catch (err) {
            console.warn("[UF2] enumerating drives with Get-Volume failed:", err?.message || err);
        }

        if (volumes.length) {
            for (const v of volumes) {
                const letter = String(v?.DriveLetter || "").replace(/:$/, "").trim();
                if (!letter) continue;
                if (isBootselVolumeLabel(v?.Label)) {
                    addCandidate(`${letter}:\\`, true, "get-volume");
                }
            }
        } else {
            try {
                const { stdout } = await execFileAsync(
                    "wmic",
                    ["logicaldisk", "get", "DeviceID,VolumeName", "/format:list"],
                    { encoding: "utf-8", windowsHide: true, timeout: 15000 }
                );
                const blocks = String(stdout || "").split(/\n\s*\n/);
                for (const block of blocks) {
                    const deviceId = block.match(/DeviceID=(.+)/)?.[1]?.trim();
                    const volumeName = block.match(/VolumeName=(.+)/)?.[1]?.trim();
                    if (!deviceId) continue;
                    if (isBootselVolumeLabel(volumeName)) {
                        addCandidate(`${deviceId}\\`, true, "wmic");
                    }
                }
            } catch (err) {
                console.warn("[UF2] enumerating drives with wmic failed:", err?.message || err);
            }
        }

        // A brute-force sweep stats every drive and is expensive, so it only runs when the
        // label match found nothing at all
        if (!hasLabelMatch()) {
            for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ") {
                addCandidate(`${letter}:\\`, false, "fallback-range");
            }
        }
    } else if (process.platform === "darwin") {
        // macOS: scan /Volumes
        try {
            const entries = await fs.promises.readdir("/Volumes", { withFileTypes: true });
            for (const dir of entries) {
                if (!dir.isDirectory()) continue;
                const full = path.join("/Volumes", dir.name);
                if (isBootselVolumeLabel(dir.name)) addCandidate(full, true, "/Volumes");
            }
        } catch (err) {
            console.warn("[UF2] scanning /Volumes failed:", err?.message || err);
        }
    } else {
        // Linux: scan /run/media/*/* and filter by label match
        const scanBase = ["/run/media", "/media"];
        for (const base of scanBase) {
            try {
                const users = await fs.promises.readdir(base, { withFileTypes: true });
                for (const userDir of users) {
                    if (!userDir.isDirectory()) continue;
                    const userPath = path.join(base, userDir.name);
                    try {
                        const mounts = await fs.promises.readdir(userPath, { withFileTypes: true });
                        for (const m of mounts) {
                            if (!m.isDirectory()) continue;
                            if (!isBootselVolumeLabel(m.name)) continue;
                            addCandidate(path.join(userPath, m.name), true, base);
                        }
                    } catch (err) {
                        console.warn(`[UF2] mount path scan failed (${userPath}):`, err?.message || err);
                    }
                }
            } catch (err) {
                console.warn(`[UF2] base scan failed (${base}):`, err?.message || err);
            }
        }
    }

    // USB enumeration runs external commands and is expensive. Skip it if the label match already found it.
    if (!hasLabelMatch()) {
        const usbMounts = await listBootselUsbMounts();
        for (const mount of usbMounts) {
            const vendorId = mount.VendorId ? normalizeHex(mount.VendorId) : "";
            const productId = mount.ProductId ? normalizeHex(mount.ProductId) : "";
            const meta = {
                vendorId,
                productId,
                serialNumber: mount.SerialNumber || "",
                description: mount.Description || "",
                usbDetected: vendorId === PICO_VENDOR_ID && !!productId && PICO_BOOTSEL_PRODUCT_IDS.has(productId),
            };
            addCandidate(mount.MountPoint, false, "usb-id", meta);
        }
    }

    return candidates;
}

// A cache of the detection result. The renderer polls while waiting for a connection, so
// re-enumerating every drive on each call would be needlessly expensive.
const RPI_DETECT_CACHE_MS = 3000;
let rpiDetectCache = null;      // { at, result }
let rpiDetectInflight = null;

function invalidateRpiDetectCache() {
    rpiDetectCache = null;
}

function detectRpiRp2Mount({ force = false } = {}) {
    if (force) invalidateRpiDetectCache();
    if (rpiDetectCache && Date.now() - rpiDetectCache.at < RPI_DETECT_CACHE_MS) {
        return Promise.resolve(rpiDetectCache.result);
    }
    // Concurrent calls collapse into a single enumeration
    if (rpiDetectInflight) return rpiDetectInflight;

    rpiDetectInflight = runRpiRp2Detection()
        .then((result) => {
            rpiDetectCache = { at: Date.now(), result };
            return result;
        })
        .finally(() => {
            rpiDetectInflight = null;
        });
    return rpiDetectInflight;
}

async function runRpiRp2Detection() {
    const candidates = await findRpiRp2Paths();

    const inspectCandidate = async (candidate) => {
        try {
            const stat = await fs.promises.stat(candidate.path);
            if (!stat.isDirectory()) {
                console.warn(`[UF2] skip ${candidate.path}: not a directory`);
                return null;
            }

            const infoFile = path.join(candidate.path, "INFO_UF2.TXT");
            const indexFile = path.join(candidate.path, "INDEX.HTM");
            const [hasInfo, hasIndex] = await Promise.all([
                fs.promises.access(infoFile).then(() => true, () => false),
                fs.promises.access(indexFile).then(() => true, () => false),
            ]);

            // The chip generation is read from INFO_UF2.TXT's Board-ID.
            //   RP2040 family: "Board-ID: RPI-RP2"
            //   RP2350 family: "Board-ID: RP2350"  (Pico 2 / Pico 2 W)
            // Note: in BOOTSEL mode a Pico cannot be told from a Pico W, nor a Pico 2 from a
            //   Pico 2 W. Only the generation is knowable, so the UF2 choice stops there too.
            let boardId = "";
            let family = "";
            if (hasInfo) {
                try {
                    const txt = await fs.promises.readFile(infoFile, "utf-8");
                    boardId = txt.match(/Board-ID:\s*(\S+)/i)?.[1] || "";
                } catch (err) {
                    console.warn(`[UF2] failed to read INFO_UF2.TXT (${candidate.path}):`, err?.message || err);
                }
            }
            const familySource = boardId || path.basename(candidate.path);
            if (/RP2350/i.test(familySource)) family = "rp2350";
            else if (/RPI-?RP2/i.test(familySource)) family = "rp2040";

            return {
                ...candidate,
                exists: true,
                hasInfo,
                hasIndex,
                boardId,
                family,
            };
        } catch (err) {
            // Brute-force candidates usually do not exist, so ENOENT is dropped silently
            if (err?.code !== "ENOENT") {
                console.warn(`[UF2] candidate check failed (${candidate.path}):`, err?.message || err);
            }
            return {
                ...candidate,
                exists: false,
                hasInfo: false,
                hasIndex: false,
            };
        }
    };

    // Priority follows the order of the candidates, so the order is preserved despite running in parallel
    const checked = (await Promise.all(candidates.map(inspectCandidate))).filter(Boolean);

    const labelAndSignature = checked.find((c) => c.labelMatched && c.exists && (c.hasInfo || c.hasIndex));
    const labelOnly = checked.find((c) => c.labelMatched && c.exists);
    // The last resort when no label can be read. INDEX.HTM is placed by other bootloaders too,
    // so only entries that also have INFO_UF2.TXT are accepted.
    const signatureOnly = checked.find((c) => c.exists && c.hasInfo);

    const selected = labelAndSignature || labelOnly || signatureOnly || null;
    const mountPath = selected?.path || "";
    const usbDetectedCount = checked.filter((c) => c.usbDetected).length;

    let message = "";
    if (!mountPath) {
        if (!checked.length) {
            message = tr("uf2VolumeNotFound");
        } else if (checked.some((c) => c.labelMatched)) {
            message = tr("uf2SignatureMissing");
        } else {
            message = tr("uf2LabelMissing");
        }

        if (usbDetectedCount > 0) {
            message += tr("usbDetectedSuffix");
        }
    }

    return {
        connected: !!mountPath,
        mountPath,
        candidates: checked,
        message,
        usbDetected: usbDetectedCount > 0,
        family: selected?.family || "",
        boardId: selected?.boardId || "",
        boardLabel: selected?.family === "rp2350" ? "Pico 2 W (RP2350)"
                  : selected?.family === "rp2040" ? "Pico W (RP2040)"
                  : "",
    };
}

ipcMain.handle("pico-firmware-detect", async () => {
    return detectRpiRp2Mount();
});

async function fetchLatestFirmwareInfo(family = "") {
    const assetName = firmwareAssetNameFor(family);
    try {
        const res = await fetch(RELEASE_LATEST_URL, {
            method: "HEAD",
            redirect: "manual",
            headers: {
                "User-Agent": "karakuri-pad-app",
            },
            signal: AbortSignal.timeout(15000),
        });

        const location = res.headers.get("location") || "";
        const version = location.match(/\/tag\/([^\s/]+)/)?.[1] || "";
        if (!version || !assetName) {
            throw new Error(tr("latestReleaseNotFound"));
        }

        const downloadUrl = `${FIRMWARE_DOWNLOAD_PREFIX}${version}/${assetName}`;
        return { version, downloadUrl, assetName, family };
    } catch (err) {
        console.warn("Failed to fetch latest firmware info:", err);
        return { version: "", downloadUrl: "", assetName, family, error: err?.message || String(err) };
    }
}

async function downloadFirmwareToBase64(downloadUrl) {
    if (!downloadUrl) {
        throw new Error(tr("downloadUrlMissing"));
    }
    // Always time out, so an unresponsive peer cannot leave the button stuck disabled
    const resp = await fetch(downloadUrl, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) {
        throw new Error(tr("firmwareDownloadFailed", { status: resp.status }));
    }

    const buffer = await resp.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
}

// Pick a local UF2 file and return it as data for the cache.
// Used for pre-release development builds and for manual installation while offline.
ipcMain.handle("pico-firmware-load-local", async () => {
    const result = await dialog.showOpenDialog({
        title: tr("uf2DialogTitle"),
        properties: ["openFile"],
        filters: [{ name: "UF2 firmware", extensions: ["uf2"] }],
    });
    if (result.canceled || !result.filePaths?.length) {
        return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const buf = await fs.promises.readFile(filePath);

    // Check that it is a valid UF2 and which board it targets, and return that
    const { family, valid } = detectUf2Family(buf);
    if (!valid) {
        throw new Error(tr("uf2Invalid"));
    }
    if (!family) {
        throw new Error(tr("uf2UnsupportedBoard"));
    }

    return {
        canceled: false,
        dataBase64: buf.toString("base64"),
        fileName: path.basename(filePath),
        family,
    };
});

ipcMain.handle("pico-firmware-latest", async (_event, payload = {}) => {
    // With no generation passed in, decide from whichever board is currently plugged in
    const family = payload?.family || (await detectRpiRp2Mount()).family || "";
    return fetchLatestFirmwareInfo(family);
});

ipcMain.handle("pico-firmware-download", async (_event, payload = {}) => {
    const downloadUrl = String(payload?.downloadUrl || "");
    if (!downloadUrl) {
        throw new Error(tr("downloadUrlMissing"));
    }
    // Restricted to release assets, so the renderer cannot make us fetch an arbitrary URL
    if (!downloadUrl.startsWith(FIRMWARE_DOWNLOAD_PREFIX)) {
        console.warn("[UF2] download URL not allowed:", downloadUrl);
        throw new Error(tr("downloadUrlNotAllowed"));
    }
    const dataBase64 = await downloadFirmwareToBase64(downloadUrl);
    return { dataBase64 };
});

// Guards against re-entry mid-write. Writing to the same drive twice leaves the bootloader
// with a half-finished image, and recovering means starting over from BOOTSEL.
let firmwareWriting = false;

ipcMain.handle("pico-firmware-write", async (_event, payload = {}) => {
    if (firmwareWriting) {
        throw new Error(tr("firmwareWriteBusy"));
    }
    firmwareWriting = true;
    try {
        const dataBase64 = String(payload?.dataBase64 || "");
        const detection = await detectRpiRp2Mount();
        const family = payload?.family || detection.family || "";

        // The write target is limited to "a drive we can currently detect".
        // The renderer must not be able to hand us an arbitrary path and have megabytes written there.
        let targetMount = detection.mountPath;
        if (payload?.mountPath) {
            const requested = normalizeCandidatePath(payload.mountPath);
            const allowed = (detection.candidates || [])
                .filter((c) => c.exists)
                .map((c) => c.path);
            if (!requested || !allowed.includes(requested)) {
                console.warn("[UF2] write target not allowed:", payload.mountPath);
                throw new Error(tr("uf2MountNotAllowed"));
            }
            targetMount = requested;
        }

        // The file name must be a .uf2 with no directory component.
        // "../" and friends must not be able to write outside the drive.
        const rawFileName = payload?.fileName
            ? path.basename(String(payload.fileName))
            : firmwareAssetNameFor(family);
        if (!rawFileName) {
            // Without a known family there is no way to pick the asset name
            throw new Error(tr("uf2UnsupportedBoard"));
        }
        if (!/\.uf2$/i.test(rawFileName) || rawFileName === ".uf2") {
            throw new Error(tr("uf2FileNameInvalid"));
        }

        if (!targetMount) {
            throw new Error(tr("bootselDriveMissing"));
        }
        if (!dataBase64) {
            throw new Error(tr("firmwareDataEmpty"));
        }

        const buf = Buffer.from(dataBase64, "base64");

        // The bootloader silently ignores a UF2 of the wrong generation, so the copy succeeds
        // while the firmware stays put. Rejecting it here prevents a false success report.
        const uf2 = detectUf2Family(buf);
        if (!uf2.valid) {
            throw new Error(tr("uf2InvalidData"));
        }
        // As in load-local, a UF2 whose generation cannot be determined is rejected
        if (!uf2.family) {
            throw new Error(tr("uf2UnsupportedBoard"));
        }
        if (family && uf2.family !== family) {
            throw new Error(
                tr("uf2BoardMismatch", { board: detection.boardLabel || family, uf2: uf2.family })
            );
        }

        const dest = path.join(targetMount, rawFileName);
        await writeUf2AndAwaitReboot(dest, buf, targetMount);
        // The drive disappears after the write, so the cache is discarded
        invalidateRpiDetectCache();
        return { status: "OK", path: dest, family, boardId: detection.boardId };
    } finally {
        firmwareWriting = false;
    }
});

// Writes the UF2 to the bootloader drive.
// The Pico reboots the instant it has all the data and the drive disappears, so write/close
// erroring out or hanging is "the normal behaviour on success".
// The drive vanishing is treated as the success signal.
async function writeUf2AndAwaitReboot(dest, buf, mountPath) {
    let settled = null;
    const writePromise = fs.promises
        .writeFile(dest, buf)
        .then(() => { settled = { ok: true }; })
        .catch((e) => { settled = { ok: false, error: e }; });

    const deadline = Date.now() + 30000;
    for (;;) {
        await Promise.race([
            writePromise,
            new Promise((res) => setTimeout(res, 500)),
        ]);

        const mounted = fs.existsSync(mountPath);

        if (settled) {
            if (settled.ok) return;                 // the write completed normally
            if (!mounted) return;                   // an error, but the drive is gone = it rebooted = success
            throw settled.error;                    // the drive is still there and it failed = a real error
        }

        if (!mounted) {
            // The drive disappeared while the write never returned =
            // the Pico accepted it and rebooted. Treat it as a success.
            console.log("[UF2] the drive disappeared (device reboot) - treating the write as successful");
            return;
        }

        if (Date.now() > deadline) {
            throw new Error(tr("writeTimeout"));
        }
    }
}

