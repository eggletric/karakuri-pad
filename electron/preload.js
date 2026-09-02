const { contextBridge, ipcRenderer } = require("electron");

// For layout branching (title-bar integration padding differs per platform)
contextBridge.exposeInMainWorld("appInfo", {
    platform: process.platform,
});

contextBridge.exposeInMainWorld("pico", {
    // target: { type: "tcp", host, port } or { type: "ble", name, id }.
    // The legacy form connect(host, port) is also accepted.
    connect: (target, port) =>
        ipcRenderer.invoke(
            "pico-connect",
            target && typeof target === "object" ? target : { type: "tcp", host: target, port }
        ),
    // Scanning for the Pico (BLE). Used for the candidate list in the connection settings modal
    scanBleDevices: (opts) => ipcRenderer.invoke("pico-ble-scan", opts || {}),
    // Abort a connection attempt in flight (connect's Promise is rejected)
    cancelConnect: () => ipcRenderer.invoke("pico-connect-cancel"),
    // Keep the language of main-process messages in sync with the renderer ("ja" | "en")
    setLanguage: (lng) => ipcRenderer.invoke("app-set-language", lng),
    disconnect: () => ipcRenderer.invoke("pico-disconnect"),
    // The current link state { connected, type: "tcp"|"ble"|null, name, host, port }
    getLinkStatus: () => ipcRenderer.invoke("pico-link-status"),
    send: (line) => ipcRenderer.invoke("pico-send", line),
    buttonDown: (b) => ipcRenderer.invoke("pico-send", `BTN ${b} DOWN`),
    buttonUp: (b) => ipcRenderer.invoke("pico-send", `BTN ${b} UP`),
    dpad: (dir) => ipcRenderer.invoke("pico-send", `DPAD ${dir}`),
    stick: (side, x, y) => ipcRenderer.invoke("pico-send", `${side}STICK ${x} ${y}`),

    playMacro: (steps) => ipcRenderer.invoke("pico-send-macro", steps),
    stopMacro: () => ipcRenderer.invoke("pico-send", "MACRO STOP"),
    onControllerInput: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on("pico-controller-input", listener);
        return () => ipcRenderer.removeListener("pico-controller-input", listener);
    },
    getControllerStatus: () => ipcRenderer.invoke("pico-controller-status"),
    // Discovery for the Pro Controller 2 (BLE). Started explicitly because noble asks for the Bluetooth permission
    startBleController: () => ipcRenderer.invoke("pico-controller-ble-start"),
    stopBleController: () => ipcRenderer.invoke("pico-controller-ble-stop"),
    // Passthrough, which forwards controller input straight to the Pico
    startPassthrough: () => ipcRenderer.invoke("pico-passthrough-start"),
    stopPassthrough: () => ipcRenderer.invoke("pico-passthrough-stop"),
    getPassthroughStatus: () => ipcRenderer.invoke("pico-passthrough-status"),
    getActivityStatus: () => ipcRenderer.invoke("pico-activity-status"),
    // Responses from the firmware (MACRO LOADED / ERR ...) and link state changes
    onMessage: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on("pico-message", listener);
        return () => ipcRenderer.removeListener("pico-message", listener);
    },
});

contextBridge.exposeInMainWorld("picoSerial", {
    listPorts: () => ipcRenderer.invoke("pico-serial-list"),
    openPort: (path) => ipcRenderer.invoke("pico-serial-open", path),
    closePort: () => ipcRenderer.invoke("pico-serial-close"),
    getState: () => ipcRenderer.invoke("pico-serial-state"),
    sendWifiConfig: (cfg) => ipcRenderer.invoke("pico-serial-send-config", cfg),
    sendLine: (line) => ipcRenderer.invoke("pico-serial-send-line", line),
    onError: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, message) => handler(message);
        ipcRenderer.on("pico-serial-error", listener);
        return () => {
            ipcRenderer.removeListener("pico-serial-error", listener);
        };
    },
    onData: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, data) => handler(data);
        ipcRenderer.on("pico-serial-data", listener);
        return () => {
            ipcRenderer.removeListener("pico-serial-data", listener);
        };
    },
    // When the serial port closes (expected=false means an unexpected close, e.g. the USB cable was pulled)
    onClosed: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on("pico-serial-closed", listener);
        return () => {
            ipcRenderer.removeListener("pico-serial-closed", listener);
        };
    },
});

contextBridge.exposeInMainWorld("picoFirmware", {
    detect: () => ipcRenderer.invoke("pico-firmware-detect"),
    fetchLatest: () => ipcRenderer.invoke("pico-firmware-latest"),
    downloadFirmware: (payload) => ipcRenderer.invoke("pico-firmware-download", payload),
    loadLocalFirmware: () => ipcRenderer.invoke("pico-firmware-load-local"),
    // The UF2 files stay on disk in userData; the renderer only sees the manifest
    listCache: () => ipcRenderer.invoke("pico-firmware-cache-list"),
    deleteCache: (payload) => ipcRenderer.invoke("pico-firmware-cache-delete", payload),
    install: (payload) => ipcRenderer.invoke("pico-firmware-write", payload),
});

// Auto update. The UX is "notify only, download on demand", so the renderer drives the
// download and the restart itself (see the updater section in main.js).
// The welcome modal (first launch + the "About Karakuri Pad" menu item)
contextBridge.exposeInMainWorld("appWelcome", {
    onOpen: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = () => handler();
        ipcRenderer.on("app-open-welcome", listener);
        return () => ipcRenderer.removeListener("app-open-welcome", listener);
    },
});

contextBridge.exposeInMainWorld("appUpdate", {
    getState: () => ipcRenderer.invoke("update-get-state"),
    download: () => ipcRenderer.invoke("update-download"),
    quitAndInstall: () => ipcRenderer.invoke("update-quit-and-install"),
    onStateChanged: (handler) => {
        if (typeof handler !== "function") return () => {};
        const listener = (_event, payload) => handler(payload);
        ipcRenderer.on("update-state-changed", listener);
        return () => ipcRenderer.removeListener("update-state-changed", listener);
    },
});
