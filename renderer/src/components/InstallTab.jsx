import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "./Card";
import { CustomSelect } from "./CustomSelect";

// The UF2 differs between the Pico W (RP2040) and the Pico 2 W (RP2350), so the cache is per-generation too
const storageVersionKey = (family) => `picoMacroFirmwareVersion:${family || "unknown"}`;
const storageDataKey = (family) => `picoMacroFirmwareData:${family || "unknown"}`;

const BOARD_LABELS = {
    rp2040: "Pico W (RP2040)",
    rp2350: "Pico 2 W (RP2350)",
};

import BoardImage from "../assets/board-transparent.png";
import nl2br from "../utils/nl2br.jsx";


import { MdOutlineSdCard, MdInsertDriveFile } from "react-icons/md";

export function InstallTab() {
    const { t } = useTranslation();
    const firmwareBridge = useMemo(() => {
        if (typeof window === "undefined") return null;
        return window.picoFirmware || null;
    }, []);

    const [cachedVersion, setCachedVersion] = useState(null);
    const [cachedData, setCachedData] = useState(null);
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
    const autoCheckedFamilies = useRef(new Set());

    // Which UF2 to fetch cannot be decided until we know which board is plugged in
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!detectedFamily) return;
        setCachedVersion(localStorage.getItem(storageVersionKey(detectedFamily)) || "");
        setCachedData(localStorage.getItem(storageDataKey(detectedFamily)) || "");
    }, [detectedFamily]);

    const downloadAndCache = React.useCallback(
        async (version, downloadUrl, family) => {
            if (!firmwareBridge) {
                setStatus(t("install.electronOnly"));
                return;
            }

            setDownloading(true);
            setStatus(t("install.downloadingFirmware"));
            try {
                const result = await firmwareBridge.downloadFirmware({ downloadUrl });
                const base64 = result?.dataBase64 || "";
                if (!base64) {
                    throw new Error(t("install.downloadResultEmpty"));
                }

                if (typeof window !== "undefined") {
                    localStorage.setItem(storageVersionKey(family), version || "");
                    localStorage.setItem(storageDataKey(family), base64);
                }

                setCachedVersion(version || "");
                setCachedData(base64);
                setStatus(t("install.latestDownloaded"));
            } catch (e) {
                console.error(e);
                setStatus(t("install.downloadFailed", { error: e?.message || String(e) }));
            } finally {
                setDownloading(false);
            }
        },
        [firmwareBridge, t]
    );

    const clearCache = React.useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.removeItem(storageVersionKey(detectedFamily));
            localStorage.removeItem(storageDataKey(detectedFamily));
        }

        autoCheckedFamilies.current.delete(detectedFamily);
        setCachedVersion("");
        setCachedData("");
        setStatus(t("install.cacheDeleted"));
    }, [detectedFamily, t]);

    const checkLatestFirmware = React.useCallback(async () => {
        if (!firmwareBridge) {
            setStatus(t("install.electronOnly"));
            return;
        }

        if (!detectedFamily) {
            setStatus(t("install.connectBoardFirst", { device: t("common.device") }));
            return;
        }

        setStatus("");
        setChecking(true);
        try {
            const latest = await firmwareBridge.fetchLatest({ family: detectedFamily });
            const version = latest?.version || "";
            const downloadUrl = latest?.downloadUrl || "";
            if (!downloadUrl) {
                setStatus(t("install.fetchLatestFailed", { error: latest?.error || t("install.unknownError") }));
                return;
            }


            const hasCachedData = !!cachedData;
            const hasSameVersion = version && cachedVersion === version;

            if (hasSameVersion && hasCachedData) {
                setStatus(t("install.cachedIsLatest"));
                return;
            }

            await downloadAndCache(version, downloadUrl, detectedFamily);
        } catch (e) {
            console.error(e);
            setStatus(t("install.checkLatestFailed", { error: e?.message || String(e) }));
        } finally {
            setChecking(false);
        }
    }, [cachedData, cachedVersion, detectedFamily, downloadAndCache, firmwareBridge, t]);

    useEffect(() => {
        if (!firmwareBridge) {
            setStatus(t("install.electronOnly"));
            return;
        }
        if (!detectedFamily) return;
        if (cachedVersion === null) return;
        if (autoCheckedFamilies.current.has(detectedFamily)) return;

        autoCheckedFamilies.current.add(detectedFamily);

        if (cachedVersion) return;

        checkLatestFirmware();
    }, [cachedVersion, checkLatestFirmware, detectedFamily, firmwareBridge, t]);

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

    // Pick a local UF2 and put it in the cache (for development builds and offline use)
    const loadLocalFirmware = async () => {
        if (!firmwareBridge?.loadLocalFirmware) return;
        setStatus("");
        try {
            const res = await firmwareBridge.loadLocalFirmware();
            if (res?.canceled) return;

            if (detectedFamily && res.family !== detectedFamily) {
                setStatus(
                    t("install.localMismatch", {
                        board: BOARD_LABELS[res.family] || res.family,
                        connected: boardLabel || detectedFamily,
                    })
                );
                return;
            }

            const version = `local: ${res.fileName}`;
            if (typeof window !== "undefined") {
                localStorage.setItem(storageVersionKey(res.family), version);
                localStorage.setItem(storageDataKey(res.family), res.dataBase64);
            }
            if (!detectedFamily || res.family === detectedFamily) {
                setCachedVersion(version);
                setCachedData(res.dataBase64);
            }
            setStatus(t("install.localImported", { board: BOARD_LABELS[res.family] || res.family }));
        } catch (e) {
            console.error(e);
            setStatus(t("install.localLoadFailed", { error: e?.message || String(e) }));
        }
    };

    const handleInstall = async () => {
        if (!firmwareBridge) {
            setStatus(t("install.installElectronOnly"));
            return;
        }
        if (!cachedData) {
            setStatus(t("install.noFirmwareDownloaded"));
            return;
        }
        setInstalling(true);
        setStatus(t("install.installing", { board: boardLabel || t("install.bootselDrive") }));
        try {
            await firmwareBridge.install({
                dataBase64: cachedData,
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
                                    disabled={!cachedData}
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
                                <div>{t("install.downloadedVersion", { version: cachedVersion || t("install.notDownloaded") })}</div>
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
                                    className={`btn btn--md ${
                                        !deviceConnected || installing || loading || !firmwareBridge || !cachedData
                                            ? "btn-secondary"
                                            : "btn-primary"
                                    }`}
                                    disabled={!deviceConnected || installing || loading || !firmwareBridge || !cachedData}
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
