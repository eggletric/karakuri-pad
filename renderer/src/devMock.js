// A mock of the Electron bridge, active only in development (checking the UI in a plain
// browser). Under Electron the preload script provides the real thing, so this does nothing.
// import.meta.env.DEV is inlined by vite, so the whole block disappears in production builds.
if (import.meta.env.DEV && typeof window !== "undefined" && !window.pico) {
    const ok = (v) => Promise.resolve(v);

    window.pico = {
        connect: () => ok("OK"),
        disconnect: () => ok("DISCONNECTED"),
        send: () => ok("SENT"),
        buttonDown: () => ok("SENT"),
        buttonUp: () => ok("SENT"),
        dpad: () => ok("SENT"),
        stick: () => ok("SENT"),
        playMacro: () => ok({ status: "MACRO_SENT", sent: 0 }),
        stopMacro: () => ok("SENT"),
        onControllerInput: () => () => {},
        // onMessage keeps the listeners around so that window.__emitPicoMessage(payload)
        // can fire arbitrary messages during browser testing
        onMessage: (handler) => {
            const set = (window.__mockMessageHandlers ||= new Set());
            set.add(handler);
            return () => set.delete(handler);
        },
        getControllerStatus: () =>
            ok({
                bridgeAvailable: true,
                connected: false,
                kind: "",
                deviceName: "",
                message: "",
                setupLinks: [],
                bleSearching: false,
            }),
        startBleController: () => ok({ started: true }),
        stopBleController: () => ok({ stopped: true }),
        startPassthrough: () => {
            window.__mockPassthrough = true;
            return ok({ ok: true });
        },
        stopPassthrough: () => {
            window.__mockPassthrough = false;
            return ok({ ok: true });
        },
        getActivityStatus: () =>
            ok({
                macroRunning: !!window.__mockMacroRunning,
                passthroughEnabled: !!window.__mockPassthrough,
            }),
        getPassthroughStatus: () =>
            ok({
                enabled: !!window.__mockPassthrough,
                picoConnected: true,
                controllerConnected: false,
                kind: "",
                deviceName: "",
                bleSearching: !!window.__mockPassthrough,
            }),
    };

    // Stateful serial mock: openPort/getState track a real open flag, and CFG GET is
    // answered with a canned [CFG] CURRENT block, so the whole config panel (dongle
    // settings included) can be exercised in a plain browser. Tweak the reply via
    // window.__mockCfg before pressing Connect.
    const serialMock = {
        open: false,
        path: "",
        dataHandlers: new Set(),
        emit(text, delayMs = 30) {
            // Emulate the firmware's line output asynchronously, like real serial data
            setTimeout(() => {
                for (const h of this.dataHandlers) h(text);
            }, delayMs);
        },
    };
    window.__mockCfg = {
        mode: "dongle",
        btname: "",
        usbmode: "procon",
        ds4map: "touchpad,none,none",
        switchmap: "none,none,none",
        // Set either to null to emulate firmware without the paddle assignment feature
        glmap: "none",
        grmap: "none",
        macro: "on",
    };

    window.picoSerial = {
        listPorts: () =>
            ok([
                {
                    // Must match FIRMWARE_USB_IDS in ConfigTab, or the port gets filtered out
                    path: "/dev/tty.usbmodem_mock01",
                    manufacturer: "HORI CO.,LTD.",
                    serialNumber: "MOCK0001",
                    vendorId: "0f0d",
                    productId: "0092",
                },
            ]),
        openPort: (path) => {
            serialMock.open = true;
            serialMock.path = path || "/dev/tty.usbmodem_mock01";
            return ok("OK");
        },
        closePort: () => {
            serialMock.open = false;
            serialMock.path = "";
            return ok("CLOSED");
        },
        getState: () => ok({ open: serialMock.open, path: serialMock.path }),
        // Logged rather than discarded: the payload is the only way to check in a browser
        // what would actually be written to the device
        sendWifiConfig: (cfg) => {
            console.log("[MOCK] sendWifiConfig", JSON.stringify(cfg));
            return ok("CONFIG_SENT");
        },
        sendLine: (line) => {
            const cmd = String(line || "").trim().toUpperCase();
            if (cmd === "CFG GET") {
                const c = window.__mockCfg;
                // window.__mockCfgDelayMs stretches the reply, e.g. to inspect loading states
                serialMock.emit(
                    "[CFG] CURRENT\n" +
                        `mode=${c.mode}\nbtname=${c.btname}\nusbmode=${c.usbmode}\n` +
                        `ds4map=${c.ds4map}\nswitchmap=${c.switchmap}\n` +
                        (c.glmap === null || c.grmap === null
                            ? ""
                            : `glmap=${c.glmap}\ngrmap=${c.grmap}\n`) +
                        `macro=${c.macro}\n` +
                        "none\n[CFG] CURRENT END\n",
                    window.__mockCfgDelayMs ?? 30
                );
            } else if (cmd) {
                serialMock.emit(`[MOCK] ${cmd}\n`);
            }
            return ok("SENT");
        },
        onError: () => () => {},
        onData: (handler) => {
            serialMock.dataHandlers.add(handler);
            return () => serialMock.dataHandlers.delete(handler);
        },
        onClosed: () => () => {},
    };

    // Stands in for the on-disk cache under userData/firmware
    const mockFirmwareCache = {};
    window.picoFirmware = {
        detect: () =>
            ok({
                connected: true,
                mountPath: "/Volumes/RP2350",
                candidates: [
                    {
                        path: "/Volumes/RP2350",
                        labelMatched: true,
                        exists: true,
                        hasInfo: true,
                        hasIndex: true,
                        boardId: "RP2350",
                        family: "rp2350",
                    },
                ],
                message: "",
                usbDetected: true,
                family: "rp2350",
                boardId: "RP2350",
                boardLabel: "Pico 2 W (RP2350)",
            }),
        fetchLatest: () =>
            ok({
                version: "v0.9.9",
                assets: {
                    rp2040: { assetName: "karakuri-firmware-picow.uf2", downloadUrl: "https://example.invalid/picow.uf2" },
                    rp2350: { assetName: "karakuri-firmware-pico2w.uf2", downloadUrl: "https://example.invalid/pico2w.uf2" },
                },
            }),
        downloadFirmware: ({ family, version }) => {
            mockFirmwareCache[family] = {
                version,
                source: "release",
                fileName: `karakuri-firmware-${family}.uf2`,
                size: 4,
                savedAt: new Date().toISOString(),
            };
            return ok({ family, entry: mockFirmwareCache[family] });
        },
        loadLocalFirmware: () => {
            mockFirmwareCache.rp2350 = { version: "", source: "local", fileName: "mock.uf2", size: 4, savedAt: new Date().toISOString() };
            return ok({ canceled: false, family: "rp2350", fileName: "mock.uf2", entry: mockFirmwareCache.rp2350 });
        },
        listCache: () => ok({ ...mockFirmwareCache }),
        deleteCache: ({ family } = {}) => {
            for (const f of family ? [family] : Object.keys(mockFirmwareCache)) delete mockFirmwareCache[f];
            return ok({ status: "OK" });
        },
        install: () => ok({ status: "OK", path: "/Volumes/RP2350/fw.uf2" }),
    };

    // Auto update. The state is driven by hand from the console:
    //   window.__emitUpdateState({ status: "available", version: "9.9.9" })
    let mockUpdateState = { status: "idle", version: null };
    const mockUpdateHandlers = [];
    window.appUpdate = {
        getState: () => ok(mockUpdateState),
        download: () => {
            window.__emitUpdateState({ status: "downloading", percent: 0 });
            let pct = 0;
            const timer = setInterval(() => {
                pct += 20;
                if (pct >= 100) {
                    clearInterval(timer);
                    window.__emitUpdateState({ status: "downloaded" });
                } else {
                    window.__emitUpdateState({ status: "downloading", percent: pct });
                }
            }, 400);
            return ok({ ok: true });
        },
        quitAndInstall: () => ok({ ok: true }),
        onStateChanged: (handler) => {
            if (typeof handler !== "function") return () => {};
            mockUpdateHandlers.push(handler);
            return () => {
                const i = mockUpdateHandlers.indexOf(handler);
                if (i >= 0) mockUpdateHandlers.splice(i, 1);
            };
        },
    };

    window.__emitUpdateState = (patch) => {
        mockUpdateState = { ...mockUpdateState, ...patch };
        for (const h of mockUpdateHandlers) h(mockUpdateState);
    };

    window.__emitPicoMessage = (payload) => {
        for (const h of window.__mockMessageHandlers || []) h(payload);
    };

    console.info("[devMock] Electron bridge mock enabled (DEV only)");
}
