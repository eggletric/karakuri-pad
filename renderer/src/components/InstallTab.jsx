import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "./Card";
import { CustomSelect } from "./CustomSelect";

// The UF2 differs between the Pico W (RP2040) and the Pico 2 W (RP2350). Both are kept on disk
// (userData/firmware, managed by the main process), so a board can be flashed as soon as it shows up.
const FAMILIES = ["rp2040", "rp2350"];

const BOARD_LABELS = {
    rp2040: "Pico W (RP2040)",
    rp2350: "Pico 2 W (RP2350)",
};

// Earlier versions kept the UF2 as base64 in localStorage (megabytes per generation).
// Whatever is left over is dropped so the space goes back to the origin's quota.
const LEGACY_STORAGE_PREFIXES = ["picoMacroFirmwareVersion:", "picoMacroFirmwareData:"];
function clearLegacyLocalStorageCache() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        for (const key of keys) {
            if (LEGACY_STORAGE_PREFIXES.some((prefix) => key?.startsWith(prefix))) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.warn("Failed to clear the legacy firmware cache:", e);
    }
}

// Release tags look like v1.2.3. A tag that does not parse falls back to plain inequality.
function parseVersion(value) {
    const m = String(value || "").trim().match(/^v?(\d+(?:\.\d+)*)/i);
    return m ? m[1].split(".").map(Number) : null;
}

function isNewerVersion(latest, current) {
    if (!current) return true;
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return latest !== current;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

// The auto-fetch for a missing UF2 runs once per app session, not every time the tab is opened
let autoFetchedThisSession = false;

import BoardImage from "../assets/board-transparent.png";
import nl2br from "../utils/nl2br.jsx";


import { MdOutlineSdCard, MdInsertDriveFile } from "react-icons/md";

export function InstallTab() {
    const { t } = useTranslation();
    const firmwareBridge = useMemo(() => {
        if (typeof window === "undefined") return null;
        return window.picoFirmware || null;
    }, []);

    // { rp2040: entry | undefined, rp2350: entry | undefined }; null until the first read completes
    const [cache, setCache] = useState(null);
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [status, setStatus] = useState("");
    const [devicePath, setDevicePath] = useState("");
    const [deviceConnected, setDeviceConnected] = useState(false);
    const [mountCandidates, setMountCandidates] = useState([]);
    const [detectMessage, setDetectMessage] = useState("");
    const [usbDetected, setUsbDetected] = useState(false);
    const [detectedFamily, setDetectedFamily] = useState("");
    const [boardLabel, setBoardLabel] = useState("");

    const refreshCache = useCallback(async () => {
        if (!firmwareBridge?.listCache) return {};
        try {
            const next = (await firmwareBridge.listCache()) || {};
            setCache(next);
            return next;
        } catch (e) {
            console.error(e);
            setCache({});
            return {};
        }
    }, [firmwareBridge]);

    useEffect(() => {
        clearLegacyLocalStorageCache();
        refreshCache();
    }, [refreshCache]);

    const clearCache = useCallback(async () => {
        if (!firmwareBridge?.deleteCache) return;
        try {
            await firmwareBridge.deleteCache({});
            setStatus(t("install.cacheDeleted"));
        } catch (e) {
            console.error(e);
            setStatus(e?.message || String(e));
        } finally {
            refreshCache();
        }
    }, [firmwareBridge, refreshCache, t]);

    // Looks up the latest release tag (no board needed) and downloads only the generations whose
    // saved copy is missing or older. A locally imported UF2 is never replaced by this.
    const checkLatestFirmware = useCallback(async () => {
        if (!firmwareBridge) {
            setStatus(t("install.electronOnly"));
            return;
        }

        setStatus("");
        setChecking(true);
        try {
            const latest = await firmwareBridge.fetchLatest();
            const version = latest?.version || "";
            const assets = latest?.assets || {};
            if (!version) {
                setStatus(t("install.fetchLatestFailed", { error: latest?.error || t("install.unknownError") }));
                return;
            }

            const current = await refreshCache();
            // The connected board goes first so it becomes flashable soonest
            const families = [...FAMILIES].sort((a, b) =>
                a === detectedFamily ? -1 : b === detectedFamily ? 1 : 0
            );
            const toFetch = [];
            const keptLocal = [];
            for (const family of families) {
                if (!assets[family]?.downloadUrl) continue;
                const entry = current[family];
                if (entry?.source === "local") {
                    keptLocal.push(BOARD_LABELS[family]);
                    continue;
                }
                if (isNewerVersion(version, entry?.version)) toFetch.push(family);
            }

            if (!toFetch.length) {
                setStatus(
                    keptLocal.length
                        ? t("install.localKept", { version, boards: keptLocal.join(", ") })
                        : t("install.cachedIsLatest", { version })
                );
                return;
            }

            setChecking(false);
            setDownloading(true);
            const failures = [];
            for (const family of toFetch) {
                setStatus(t("install.downloadingFirmware", { board: BOARD_LABELS[family], version }));
                try {
                    await firmwareBridge.downloadFirmware({
                        family,
                        version,
                        downloadUrl: assets[family].downloadUrl,
                    });
                } catch (e) {
                    console.error(e);
                    failures.push(`${BOARD_LABELS[family]}: ${e?.message || String(e)}`);
                }
            }
            await refreshCache();
            setStatus(
                failures.length
                    ? t("install.downloadFailed", { error: failures.join(" / ") })
                    : t("install.latestDownloaded", { version })
            );
        } catch (e) {
            console.error(e);
            setStatus(t("install.checkLatestFailed", { error: e?.message || String(e) }));
        } finally {
            setChecking(false);
            setDownloading(false);
        }
    }, [detectedFamily, firmwareBridge, refreshCache, t]);

    // With nothing saved for some generation, fetch it without being asked (once per session)
    useEffect(() => {
        if (!firmwareBridge) {
            setStatus(t("install.electronOnly"));
            return;
        }
        if (cache === null) return;
        if (autoFetchedThisSession) return;
        autoFetchedThisSession = true;

        if (FAMILIES.every((family) => cache[family])) return;
        checkLatestFirmware();
    }, [cache, checkLatestFirmware, firmwareBridge, t]);

    useEffect(() => {
        if (!firmwareBridge) return;
        let cancelled = false;

        const poll = async () => {
            try {
                const res = await firmwareBridge.detect();
                if (cancelled) return;
                const candidates = res?.candidates || [];
                setMountCandidates(candidates);
                setDetectMessage(res?.message || "");
                setDeviceConnected(!!res?.connected);
                setUsbDetected(!!res?.usbDetected);
                setDetectedFamily(res?.family || "");
                setBoardLabel(res?.boardLabel || BOARD_LABELS[res?.family] || "");

                let nextPath = res?.mountPath || "";
                const labelCandidate = candidates.find((c) => c.labelMatched && c.exists)?.path;
                const previousExists = devicePath && candidates.some((c) => c.path === devicePath);

                if (!nextPath) {
                    nextPath = previousExists ? devicePath : labelCandidate || candidates[0]?.path || "";
                }

                setDevicePath(nextPath || "");
            } catch (e) {
                console.error(e);
                if (!cancelled) setDeviceConnected(false);
            }
        };

        poll();
        // BOOTSEL detection on the main side is expected to become async and cached, so widen the interval
        const id = setInterval(poll, 4000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [devicePath, firmwareBridge]);

    // Pick a local UF2; the main side files it under whichever generation it targets
    // (for development builds and offline use)
    const loadLocalFirmware = async () => {
        if (!firmwareBridge?.loadLocalFirmware) return;
        setStatus("");
        try {
            const res = await firmwareBridge.loadLocalFirmware();
            if (res?.canceled) return;
            await refreshCache();
            setStatus(t("install.localImported", { board: BOARD_LABELS[res.family] || res.family }));
        } catch (e) {
            console.error(e);
            setStatus(t("install.localLoadFailed", { error: e?.message || String(e) }));
        }
    };

    const cachedEntry = detectedFamily ? cache?.[detectedFamily] : null;

    const handleInstall = async () => {
        if (!firmwareBridge) {
            setStatus(t("install.installElectronOnly"));
            return;
        }
        if (!cachedEntry) {
            setStatus(t("install.noFirmwareDownloaded"));
            return;
        }
        setInstalling(true);
        setStatus(t("install.installing", { board: boardLabel || t("install.bootselDrive") }));
        try {
            await firmwareBridge.install({
                mountPath: devicePath,
                family: detectedFamily,
            });
            setStatus(t("install.installComplete"));
        } catch (e) {
            console.error(e);
            setStatus(t("install.installFailed", { error: e?.message || String(e) }));
        } finally {
            setInstalling(false);
        }
    };

    const loading = checking || downloading;
    const hasAnyCache = FAMILIES.some((family) => cache?.[family]);
    const canInstall = deviceConnected && !!cachedEntry && !installing && !loading && !!firmwareBridge;

    const versionLabel = (entry) => {
        if (!entry) return t("install.notDownloaded");
        if (entry.source === "local") return t("install.localVersion", { file: entry.fileName });
        return entry.version || t("install.unknownError");
    };

    return (
        <div className="install-root">

            {!firmwareBridge && (
                <div className="install-warning">{t("install.electronOnlyTab")}</div>
            )}

            <div className="install-grid">
                <Card className="install-guide-card" title={t("install.connectTitle")}>
                    <div className="install-guide">
                        <p>
                            {t("install.connectInstruction", { device: t("common.device") })}
                        </p>
                        <div className="install-board-figure">
                            <img src={BoardImage} />
                            {/* Upward block arrow (head: width 22, tail: width 7 x length 26) */}
                            <svg className="install-board-arrow" viewBox="0 0 24 40" aria-hidden="true">
                                <path d="M12 0 L23 14 L15.5 14 L15.5 40 L8.5 40 L8.5 14 L1 14 Z" fill="currentColor" />
                            </svg>
                        </div>
                        <p>
                            {t("install.connectInstructionDetail", { device: t("common.device") })}
                        </p>
                    </div>
                </Card>

                <div className="install-column">
                    <Card
                        title={
                            <>
                                <div>{t("install.prepareTitle")}</div>
                                <button
                                    disabled={!hasAnyCache || loading || installing}
                                    className="btn btn-secondary btn--md"
                                    onClick={clearCache}
                                >
                                    {t("install.deleteCachedFirmware")}
                                </button>
                            </>
                        }
                        footer={
                            <div className="install-footer-actions">
                                <button
                                    className="btn btn-secondary btn--md"
                                    disabled={loading || !firmwareBridge}
                                    onClick={checkLatestFirmware}
                                >
                                    {loading && <span className="spinner" />}
                                    {downloading
                                        ? t("install.downloadingEllipsis")
                                        : checking
                                            ? t("install.checkingEllipsis")
                                            : t("install.checkLatest")}
                                </button>
                                <button
                                    className="btn btn-secondary btn--md"
                                    disabled={loading || !firmwareBridge}
                                    onClick={loadLocalFirmware}
                                >
                                    {t("install.selectLocalUf2")}
                                </button>
                            </div>
                        }
                    >
                        <div className="install-row">
                            <div className="install-versions">
                                {FAMILIES.map((family) => (
                                    <div
                                        key={family}
                                        className={`install-version${family === detectedFamily ? " install-version--active" : ""}`}
                                    >
                                        {t("install.downloadedVersion", {
                                            board: BOARD_LABELS[family],
                                            version: versionLabel(cache?.[family]),
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card
                        title={t("install.writeTitle")}
                        footer={
                            <div className="install-actions">
                                {!deviceConnected && (
                                    <div className="install-note">
                                        {t("install.notConnected")}
                                    </div>
                                )}
                                <button
                                    className={`btn btn--md ${canInstall ? "btn-primary" : "btn-secondary"}`}
                                    disabled={!canInstall}
                                    onClick={handleInstall}
                                >
                                    {installing ? t("install.writingEllipsis") : t("install.installButton")}
                                </button>
                            </div>
                        }
                    >
                        <div className="install-row device">
                            <div className="install-status">
                                {boardLabel && !(deviceConnected && mountCandidates.length > 0) && (
                                    <div className="install-note install-note--board">{t("install.detectedBoard", { board: boardLabel })}</div>
                                )}
                                {deviceConnected && !detectedFamily && (
                                    <div className="install-note">
                                        {t("install.unknownGeneration")}
                                    </div>
                                )}
                                {deviceConnected && mountCandidates.length > 0 && (
                                    <div className="install-candidate-select">
                                        {/* Paths can get long, so the select goes on the line below rather than beside the item name */}
                                        <div className="install-candidate-select__head">
                                            <div className="install-label">{t("install.selectTarget")}</div>
                                            {boardLabel && (
                                                <div className="install-note install-note--board">
                                                    {t("install.detectedBoard", { board: boardLabel })}
                                                </div>
                                            )}
                                        </div>
                                        <CustomSelect
                                            value={devicePath}
                                            onChange={(val) => setDevicePath(val)}
                                            options={mountCandidates.map((c) => ({
                                                value: c.path,
                                                label: c.path,
                                                description:
                                                    c.description ||
                                                    (c.vendorId
                                                        ? `${c.vendorId}:${c.productId}`
                                                        : c.boardId || (c.labelMatched ? "BOOTSEL" : "")),
                                                icon: c.labelMatched ? <MdOutlineSdCard /> : <MdInsertDriveFile />,
                                            }))}
                                            placeholder={t("install.selectDevicePlaceholder")}
                                            dense
                                            renderLabel={(opt) => (
                                                <span>
                                                    {opt.label}
                                                    {opt.description ? ` (${opt.description})` : ""}
                                                </span>
                                            )}
                                        />
                                    </div>
                                )}
                                {usbDetected && !deviceConnected && (
                                    <div className="install-note">{t("install.usbNotMounted")}</div>
                                )}
                                {detectMessage && <div className="install-note">{nl2br(detectMessage)}</div>}
                            </div>
                        </div>
                    </Card>
                    <div className="install-messages">
                        {status ? status : ''}
                    </div>
                </div>
            </div>
            <div className="install-caption">
                {t("install.captionLine1")}<br />
                {t("install.captionLine2")}
            </div>
        </div>
    );
}
