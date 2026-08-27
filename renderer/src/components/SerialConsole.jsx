// src/renderer/src/components/SerialConsole.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useXTerm } from "../hooks/useXTerm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { CustomSelect } from "./CustomSelect";
import { Card } from "./Card";

const THEME_STORAGE_KEY = "pico_xterm_theme";

// Theme definitions (id: "1" / "2")
// The default is "2" = Dark
const TERMINAL_THEMES = [
    {
        id: "1",
        label: "Light",
        theme: {
            background: "#ffffff",
            foreground: "#000000",
            cursor: "#000000",
            selectionBackground: "#cce5ff",
            black: "#000000",
            red: "#d70000",
            green: "#008700",
            yellow: "#af8700",
            blue: "#005faf",
            magenta: "#8700af",
            cyan: "#008787",
            white: "#e4e4e4",
            brightBlack: "#444444",
            brightRed: "#ff005f",
            brightGreen: "#5faf00",
            brightYellow: "#ffd700",
            brightBlue: "#0087ff",
            brightMagenta: "#af00ff",
            brightCyan: "#00afaf",
            brightWhite: "#ffffff",
        },
    },
    {
        id: "2",
        label: "Dark",
        theme: {
            background: "#000000",
            foreground: "#e5e5e5",
            cursor: "#e5e5e5",
            selectionBackground: "#44475a",
            black: "#000000",
            red: "#ff5555",
            green: "#50fa7b",
            yellow: "#f1fa8c",
            blue: "#bd93f9",
            magenta: "#ff79c6",
            cyan: "#8be9fd",
            white: "#bbbbbb",
            brightBlack: "#555555",
            brightRed: "#ff6e6e",
            brightGreen: "#69ff94",
            brightYellow: "#ffffa5",
            brightBlue: "#d6acff",
            brightMagenta: "#ff92df",
            brightCyan: "#a4ffff",
            brightWhite: "#ffffff",
        },
    },
];

// clearSignal: a counter the parent increments when it wants the monitor cleared
export default function SerialConsole({ bridge, serialState, onReset, clearSignal }) {
    const { t } = useTranslation();
    // The xterm instance
    const { instance, ref } = useXTerm();
    const [themeId, setThemeId] = useState("2"); // default: Dark
    const [inputText, setInputText] = useState("");

    // Load the initial theme from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
            if (saved && TERMINAL_THEMES.some((t) => t.id === saved)) {
                setThemeId(saved);
            }
        } catch (e) {
            console.warn("Failed to load theme from localStorage", e);
        }
    }, []);

    const currentTheme =
        TERMINAL_THEMES.find((t) => t.id === themeId)?.theme ||
        TERMINAL_THEMES[1].theme; // fallback: Dark

    const handleThemeChange = (newId) => {
        setThemeId(newId);

        if (typeof window !== "undefined") {
            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, newId);
            } catch (err) {
                console.warn("Failed to save theme to localStorage", err);
            }
        }
    };

    useEffect(() => {
        if (!instance || !currentTheme) return;

        try {
            const { cols, rows, ...options } = instance.options;

            instance.options = {
                ...options,        // keep the existing settings
                theme: currentTheme,
                fontSize: 12,
                fontFamily:
                    'Menlo, Monaco, Consolas, "Courier New", monospace',
                cursorBlink: true,
                scrollback: 2000,
            };
        } catch (e) {
            console.warn("Failed to update xterm options", e);
        }
    }, [instance, currentTheme]);

    // Fit the column count to the container width so the canvas never overflows the card.
    // Rows stay fixed (the terminal's height decides the card height, so fitting rows
    // to the parent would be circular)
    useEffect(() => {
        if (!instance) return;

        const fitAddon = new FitAddon();
        instance.loadAddon(fitAddon);

        const fitCols = () => {
            try {
                const dims = fitAddon.proposeDimensions();
                if (dims && Number.isFinite(dims.cols) && dims.cols > 0) {
                    instance.resize(dims.cols, instance.rows);
                }
            } catch (e) {
                console.warn("Failed to fit xterm columns", e);
            }
        };

        fitCols();

        const el = instance.element?.parentElement;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(fitCols);
        observer.observe(el);

        return () => {
            observer.disconnect();
        };
    }, [instance]);

    // bridge.onData -> write to xterm
    useEffect(() => {
        if (!bridge || typeof bridge.onData !== "function") return;
        if (!instance) return;

        const unsubscribe = bridge.onData((chunk) => {
            // Show the Pico -> PC data in the terminal as-is
            const text =
                typeof chunk === "string"
                    ? chunk.replace(/\n/g, "\r\n")
                    : String(chunk);
            instance.write(text);
        });

        return () => {
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, [bridge, instance]);

    // A clear request from the parent (e.g. after a restart caused by a mode change)
    useEffect(() => {
        if (!instance || !clearSignal) return;
        try {
            instance.clear();
        } catch (e) {
            console.warn("Failed to clear xterm", e);
        }
    }, [clearSignal, instance]);

    // Reset button
    const handleClickReset = async () => {
        if (!onReset) return;
        await onReset();
    };

    // Clear button
    const handleClickClear = () => {
        if (!instance) return;
        try {
            // clear is still around in xterm v5+
            instance.clear();
        } catch (e) {
            console.warn("Failed to clear xterm", e);
        }
    };

    // Send arbitrary text
    const handleSend = async () => {
        if (!bridge) return;
        if (!serialState?.open) return;
        const line = inputText.trim();
        if (!line) return;

        try {
            await bridge.sendLine(line);
            setInputText("");
        } catch (e) {
            console.error(e);
            // Do not touch the Config side's msg here. This is console-only, so ignore it.
        }
    };

    return (
        <Card
            header={
                <>
                    <div style={{ fontWeight: "bold", flex: "1 1 auto" }}>
                        {t("serial.title")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ fontSize: 14 }}>
                            {t("serial.themeLabel")}&nbsp;
                        </div>
                        <CustomSelect
                            dense
                            value={themeId}
                            onChange={handleThemeChange}
                            options={TERMINAL_THEMES.map((t) => ({
                                value: t.id,
                                label: `${t.label} (${t.id})`,
                            }))}
                            aria-label="Terminal theme"
                        />

                        <button
                            className="btn btn--sm"
                            style={{ marginLeft: 8 }}
                            onClick={handleClickReset}
                            disabled={!serialState?.open}
                        >
                            {t("serial.resetButton")}
                        </button>
                        <button
                            className="btn btn--sm"
                            style={{ marginLeft: 4 }}
                            onClick={handleClickClear}
                        >
                            {t("serial.clearButton")}
                        </button>
                    </div>
                </>
            }
            bodyStyle={{ background: currentTheme.background }}
            footer={
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 4,
                    }}
                >
                    <input
                        className="form-control form-control--md"
                        style={{ flex: "1 1 auto" }}
                        placeholder={t("serial.inputPlaceholder")}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <button
                        className="btn btn--md"
                        onClick={handleSend}
                        disabled={!serialState?.open}
                    >
                        {t("serial.sendButton")}
                    </button>
                </div>
            }
        >
            <div
                style={{
                    flex: "1 1 auto",
                    minHeight: 260,
                    overflow: "hidden",
                }}
            >
                <div ref={ref} />
            </div>
        </Card>
    );
}

