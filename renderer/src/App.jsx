import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { ControllerPad } from "./components/ControllerPad.jsx";
import { MacroEditor } from "./components/MacroEditor.jsx";
import { ChromeTabs } from "./components/ChromeTabs.jsx";
import { ConnectionBar } from "./components/ConnectionBar.jsx";
import { ConfigTab } from "./components/ConfigTab.jsx";
import { InstallTab } from "./components/InstallTab.jsx";
import { Modal } from "./components/Modal.jsx";
import { ToastContainer, showToast } from "./components/Toast.jsx";
import { UpdateChip } from "./components/UpdateChip.jsx";
import { WelcomeModal } from "./components/WelcomeModal.jsx";
import { setLanguage, getLanguagePreference } from "./i18n.js";
import "./styles.css";

// The welcome modal's "don't show again" flag. localStorage like the language and the
// terminal theme, so the whole persistence story of the renderer stays in one place
const WELCOME_DISMISSED_KEY = "picoWelcomeDismissed";

function readWelcomeDismissed() {
    try {
        return window.localStorage?.getItem(WELCOME_DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

// Flags are SVGs because the emoji versions do not render on Windows (Chromium)
function FlagJP() {
    return (
        <svg viewBox="0 0 30 20" aria-hidden="true">
            <rect width="30" height="20" fill="#ffffff" />
            <circle cx="15" cy="10" r="6" fill="#bc002d" />
        </svg>
    );
}

function FlagUS() {
    const whiteStripes = [1, 3, 5, 7, 9, 11];
    const h = 20 / 13;
    return (
        <svg viewBox="0 0 30 20" aria-hidden="true">
            <rect width="30" height="20" fill="#b22234" />
            {whiteStripes.map((i) => (
                <rect key={i} x="0" y={i * h} width="30" height={h} fill="#ffffff" />
            ))}
            <rect width="13" height={7 * h} fill="#3c3b6e" />
            {[0, 1, 2].map((row) =>
                [0, 1, 2, 3].map((col) => (
                    <circle
                        key={`${row}-${col}`}
                        cx={2.2 + col * 2.9}
                        cy={1.9 + row * 3.4}
                        r="0.55"
                        fill="#ffffff"
                    />
                ))
            )}
        </svg>
    );
}

// Icon for "follow the system setting" (a monitor drawn to match the flags' frame size)
function SystemIcon() {
    return (
        <svg viewBox="0 0 30 20" aria-hidden="true">
            <rect width="30" height="20" fill="#1b2440" />
            <rect x="8" y="3.5" width="14" height="9" rx="1.2" fill="none" stroke="#93a0bd" strokeWidth="1.5" />
            <rect x="13.5" y="13" width="3" height="1.8" fill="#93a0bd" />
            <rect x="10.5" y="14.8" width="9" height="1.6" rx="0.8" fill="#93a0bd" />
        </svg>
    );
}

const LANGUAGES = [
    { code: "ja", label: "日本語", Flag: FlagJP },
    { code: "en", label: "English", Flag: FlagUS },
];

export default function App() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language === "ja" ? "ja" : "en";
    const [langModalOpen, setLangModalOpen] = useState(false);
    const [langPref, setLangPref] = useState(getLanguagePreference);
    const CurrentFlag = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[1]).Flag;
    const langOptions = [
        { code: "system", label: t("language.system"), Flag: SystemIcon },
        ...LANGUAGES,
    ];
    const [tab, setTab] = useState("controller");

    // Welcome modal: auto-shown on first launch (until dismissed with the checkbox),
    // reopened any time from the "About Karakuri Pad" menu item
    const [welcomeDismissed, setWelcomeDismissed] = useState(readWelcomeDismissed);
    const [welcomeOpen, setWelcomeOpen] = useState(() => !readWelcomeDismissed());

    React.useEffect(() => {
        const unsubscribe = window.appWelcome?.onOpen?.(() => setWelcomeOpen(true));
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, []);

    const handleWelcomeClose = (dontShowAgain) => {
        setWelcomeOpen(false);
        // Persist both directions: checking on first launch stores the dismissal, and
        // unchecking on a menu reopen re-enables the auto-show on the next launch
        if (dontShowAgain !== welcomeDismissed) {
            setWelcomeDismissed(dontShowAgain);
            try {
                if (dontShowAgain) {
                    window.localStorage?.setItem(WELCOME_DISMISSED_KEY, "1");
                } else {
                    window.localStorage?.removeItem(WELCOME_DISMISSED_KEY);
                }
            } catch (e) {
                console.warn("Failed to persist the welcome flag", e);
            }
        }
    };

    // Announce an unexpected Pico (TCP) disconnect to the whole app.
    // Not shown for a user-initiated disconnect (expected).
    React.useEffect(() => {
        const unsubscribe = window.pico?.onMessage?.((payload) => {
            if (payload?.type !== "closed") return;
            if (payload.expected) return;
            showToast(
                payload.passthroughStopped
                    ? t("app.picoDisconnectedPassthroughStopped")
                    : t("app.picoDisconnected"),
                "error"
            );
        });
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, [t]);
    // While a tab switch is pending: { id, macroRunning, passthroughEnabled }
    const [pendingTab, setPendingTab] = useState(null);

    // Only block and confirm tab switches while a macro is running. Passthrough is
    // self-sufficient on the main side (stall detection, neutral sending, auto-reconnect),
    // so switching tabs is harmless
    const trySelectTab = async (id) => {
        if (id === tab) return;
        try {
            const st = await window.pico?.getActivityStatus?.();
            if (st?.macroRunning) {
                setPendingTab({ id, ...st, passthroughEnabled: false });
                return;
            }
        } catch (e) {
            console.warn("activity status", e);
        }
        setTab(id);
    };

    const stopAndMove = async () => {
        const target = pendingTab;
        setPendingTab(null);
        if (!target) return;
        try {
            if (target.macroRunning) await window.pico?.stopMacro?.();
            if (target.passthroughEnabled) await window.pico?.stopPassthrough?.();
        } catch (e) {
            console.error(e);
        }
        setTab(target.id);
    };

    const pendingLabel = pendingTab?.macroRunning && pendingTab?.passthroughEnabled
        ? t("app.pendingBoth")
        : pendingTab?.macroRunning
            ? t("app.pendingMacro")
            : t("app.pendingPassthrough");

    return (
        <div className="app-root">
            {/* Drag strip for the integrated title bar (shown under Electron only) */}
            <div className="app-titlebar">
                <span className="app-titlebar__title">Karakuri Pad</span>
            </div>
            <div className="app-header">
                <ChromeTabs
                    tabs={[
                        { id: "controller", label: t("app.tabController") },
                        { id: "macro", label: t("app.tabMacro") },
                        { id: "config", label: t("app.tabConfig") },
                        { id: "install", label: t("app.tabInstall") },
                    ]}
                    current={tab}
                    onSelect={trySelectTab}
                />
                <UpdateChip />
                <ConnectionBar />
            </div>
            {tab === "controller" && (
                <div className="page">
                    <ControllerPad />
                </div>
            )}
            {tab === "macro" && (
                <div className="page">
                    <MacroEditor />
                </div>
            )}
            {tab === "config" && (
                <div className="page">
                    <ConfigTab />
                </div>
            )}
            {tab === "install" && (
                <div className="page">
                    <InstallTab />
                </div>
            )}

            <Modal
                open={!!pendingTab}
                onClose={() => setPendingTab(null)}
                title={t("app.pendingTitle", { label: pendingLabel })}
                footer={(
                    <>
                        <button className="btn btn--sm" onClick={() => setPendingTab(null)}>
                            {t("common.cancel")}
                        </button>
                        <button className="btn btn--sm btn-danger" onClick={stopAndMove}>
                            {t("app.stopAndMove")}
                        </button>
                    </>
                )}
            >
                <p>
                    {t("app.pendingBody1", { label: pendingLabel })}<br />
                    {t("app.pendingBody2")}
                </p>
            </Modal>

            {/* Language switch: flag button pinned to the bottom left (the bottom right collides with toasts) */}
            <button
                className="lang-fab"
                onClick={() => setLangModalOpen(true)}
                aria-label={t("language.title")}
                title={t("language.title")}
            >
                <span className="lang-flag"><CurrentFlag /></span>
            </button>

            <Modal
                open={langModalOpen}
                onClose={() => setLangModalOpen(false)}
                title={t("language.title")}
            >
                <div className="lang-list">
                    {langOptions.map(({ code, label, Flag }) => (
                        <button
                            key={code}
                            className={`lang-list__item${langPref === code ? " is-active" : ""}`}
                            onClick={() => {
                                setLanguage(code);
                                setLangPref(code);
                                setLangModalOpen(false);
                            }}
                        >
                            <span className="lang-flag"><Flag /></span>
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </Modal>

            <WelcomeModal
                open={welcomeOpen}
                onClose={handleWelcomeClose}
                initialDontShowAgain={welcomeDismissed}
            />

            <ToastContainer />
        </div>
    );
}
