import React from "react";
import { useTranslation } from "react-i18next";
import { showToast } from "./Toast.jsx";

// Control panel for passthrough, which forwards controller input straight to the Pico.
// Works with either the Pro Controller (USB) or the Pro Controller 2 (BLE).
export function PassthroughPanel() {
    const { t } = useTranslation();
    const [status, setStatus] = React.useState({
        enabled: false,
        picoConnected: false,
        controllerConnected: false,
        kind: "",
        deviceName: "",
        bleSearching: false,
    });
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState("");

    const bridge = window.pico;
    const supported = typeof bridge?.getPassthroughStatus === "function";

    const prevRef = React.useRef({ enabled: false, controllerConnected: false });

    React.useEffect(() => {
        if (!supported) return;
        let cancelled = false;

        const poll = async () => {
            try {
                const s = await bridge.getPassthroughStatus();
                if (!cancelled && s) {
                    // Report it if the controller goes away mid-passthrough (rescanning is automatic)
                    const prev = prevRef.current;
                    if (
                        prev.enabled &&
                        s.enabled &&
                        prev.controllerConnected &&
                        !s.controllerConnected
                    ) {
                        showToast(
                            t("passthrough.controllerLostRetrying"),
                            "warning"
                        );
                    }
                    prevRef.current = {
                        enabled: !!s.enabled,
                        controllerConnected: !!s.controllerConnected,
                    };
                    setStatus(s);
                }
            } catch (e) {
                console.warn("passthrough status", e);
            }
        };

        poll();
        const id = window.setInterval(poll, 1500);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [supported]);

    const start = async () => {
        setBusy(true);
        setMessage("");
        try {
            const res = await bridge.startPassthrough();
            if (!res?.ok) {
                setMessage(res?.message || t("passthrough.startFailed"));
            }
        } catch (e) {
            setMessage(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        setBusy(true);
        setMessage("");
        try {
            await bridge.stopPassthrough();
        } catch (e) {
            console.error(e);
        } finally {
            setBusy(false);
        }
    };

    if (!supported) return null;

    // The description line doubles as the status display (to avoid adding another line)
    const descText = status.controllerConnected
        ? t("passthrough.controllingWith", {
            name: status.deviceName || (status.kind === "ble" ? t("passthrough.deviceProCon2") : t("passthrough.deviceProCon")),
        })
        : status.enabled && status.bleSearching
            ? t("passthrough.searching")
            : t("passthrough.description");

    return (
        <div className="controller-card passthrough-panel">
            {/* Connection status indicator (top left of the panel) */}
            <span className="passthrough-indicator">
                <span
                    className={
                        "passthrough-dot" +
                        (status.enabled
                            ? status.controllerConnected
                                ? " passthrough-dot--active"
                                : " passthrough-dot--searching"
                            : "")
                    }
                />
                {status.enabled
                    ? status.controllerConnected
                        ? t("passthrough.statusConnected")
                        : t("passthrough.statusSearching")
                    : t("passthrough.statusDisconnected")}
            </span>

            <div className="passthrough-head">
                <div className="passthrough-title">{t("passthrough.title")}</div>
                <div className="passthrough-desc">{descText}</div>
            </div>

            {status.enabled ? (
                <button className="btn btn--md btn-danger" onClick={stop} disabled={busy}>
                    {t("passthrough.stop")}
                </button>
            ) : (
                <button
                    className="btn btn--md btn-primary"
                    onClick={start}
                    disabled={busy || !status.picoConnected}
                >
                    {t("passthrough.start")}
                </button>
            )}

            {!status.picoConnected && !status.enabled && (
                <div className="passthrough-note">{t("passthrough.connectFirst")}</div>
            )}
            {message && <div className="passthrough-note passthrough-note--error">{message}</div>}
        </div>
    );
}
