import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { showToast } from "./Toast.jsx";

// The update chip in the header (only shown once an update has been detected in a packaged
// build). The UX is "notify only, download on demand": available = click to start the
// download -> downloading = progress -> downloaded = "restart to update".
// Applying it is refused by main (update-quit-and-install) while a macro is running; the
// busy response is reported as a toast.
export function UpdateChip() {
    const { t } = useTranslation();
    const [state, setState] = useState(null);

    useEffect(() => {
        let mounted = true;
        window.appUpdate?.getState?.().then((s) => {
            if (mounted && s) setState(s);
        }).catch(() => { /* the updater is unavailable (dev, or loading failed) */ });
        const off = window.appUpdate?.onStateChanged?.((s) => setState(s || null));
        return () => {
            mounted = false;
            if (typeof off === "function") off();
        };
    }, []);

    if (!state || state.status === "idle") return null;

    const handleClick = async () => {
        if (state.status === "available" || state.status === "error") {
            await window.appUpdate?.download?.();
        } else if (state.status === "downloaded") {
            const r = await window.appUpdate?.quitAndInstall?.();
            if (r && r.ok === false && r.reason === "busy") showToast(t("app.update.busy"), "warn");
        }
    };

    let label;
    let tooltip;
    if (state.status === "available") {
        label = t("app.update.availableLabel", { version: state.version });
        tooltip = t("app.update.availableTooltip", { version: state.version });
    } else if (state.status === "downloading") {
        label = t("app.update.downloadingLabel", { percent: state.percent ?? 0 });
        tooltip = t("app.update.downloadingTooltip");
    } else if (state.status === "downloaded") {
        label = t("app.update.downloadedLabel");
        tooltip = t("app.update.downloadedTooltip");
    } else {
        label = t("app.update.errorLabel");
        tooltip = state.message || t("app.update.errorTooltipDefault");
    }

    const busy = state.status === "downloading";

    return (
        <button
            type="button"
            className={`update-chip update-chip--${state.status}`}
            onClick={busy ? undefined : handleClick}
            disabled={busy}
            title={tooltip}
        >
            {state.status === "downloading" && (
                <span className="update-chip__bar" style={{ width: `${state.percent ?? 0}%` }} />
            )}
            <span className="update-chip__label">{label}</span>
        </button>
    );
}
