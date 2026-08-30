import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.jsx";
import { Procon2View } from "./Procon2View.jsx";

// Picks what a back paddle (GL / GR) sends, by clicking the buttons on a controller
// view. Several buttons can be chosen at once: the firmware stores the assignment as a
// button mask and presses them all together, so one paddle can fire a combination.
//
// The vocabulary matches the firmware's glmap= / grmap= tokens exactly (its
// GLGR_ASSIGNABLE_MASK). C, GL and GR are out because they are control buttons and a
// paddle cannot be mapped to itself; +, -, HOME and capture are out so a paddle can
// never fire something that leaves the game. All of them still render, dimmed, so the
// layout stays recognisable.
//
// Tokens are the codes lowercased, which is the whole mapping (up/a/zl/lstick/...).

export const PADDLE_ASSIGN_CODES = [
    "UP", "DOWN", "LEFT", "RIGHT",
    "A", "B", "X", "Y",
    "L", "R", "ZL", "ZR",
    "LSTICK", "RSTICK",
];
const CODE_SET = new Set(PADDLE_ASSIGN_CODES);
const DPAD_CODES = new Set(["UP", "DOWN", "LEFT", "RIGHT"]);

// Short labels for the summary line on the config button
const CODE_LABELS = {
    UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
    LSTICK: "L3", RSTICK: "R3",
};
export const codeLabel = (code) => CODE_LABELS[code] || code;

// "a+up" -> ["UP", "A"], in the firmware's canonical order so the UI never shows an
// order the device would not echo back
export function tokensToCodes(tokens) {
    const raw = String(tokens || "").trim().toLowerCase();
    if (!raw || raw === "none") return [];
    const wanted = new Set(raw.split("+").map((s) => s.trim()).filter(Boolean));
    return PADDLE_ASSIGN_CODES.filter((code) => wanted.has(code.toLowerCase()));
}

// ["UP", "A"] -> "up+a" (canonical order), "none" when empty
export function codesToTokens(codes) {
    const set = codes instanceof Set ? codes : new Set(codes || []);
    const picked = PADDLE_ASSIGN_CODES.filter((code) => set.has(code));
    return picked.length ? picked.map((c) => c.toLowerCase()).join("+") : "none";
}

// Trims a code list down to a fixed number of slots for the narrow config-panel
// button, so the row always stays one line high. Up to MAX codes are shown as they
// are; beyond that the last slot becomes a "+N" counter, because at five items a
// "+1" would occupy exactly the space the real chip needs anyway.
export const PADDLE_SUMMARY_SLOTS = 5;

export function summariseCodes(codes, slots = PADDLE_SUMMARY_SLOTS) {
    if (codes.length <= slots) return { shown: codes, overflow: 0 };
    return { shown: codes.slice(0, slots - 1), overflow: codes.length - (slots - 1) };
}

const NEUTRAL_STICKS = { L: { x: 128, y: 128 }, R: { x: 128, y: 128 } };

export function PaddleAssignModal({ open, paddle, value, onCancel, onApply }) {
    const { t } = useTranslation();
    const [picked, setPicked] = React.useState(() => new Set());

    // Seed from the saved value every time the modal opens, so cancelling really discards
    React.useEffect(() => {
        if (open) setPicked(new Set(tokensToCodes(value)));
    }, [open, value]);

    const toggle = React.useCallback((code) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }, []);

    // Procon2View wants the dpad separately from the buttons
    const buttons = React.useMemo(
        () => new Set([...picked].filter((c) => !DPAD_CODES.has(c))),
        [picked],
    );
    const dirs = React.useMemo(
        () => new Set([...picked].filter((c) => DPAD_CODES.has(c))),
        [picked],
    );

    const ordered = PADDLE_ASSIGN_CODES.filter((c) => picked.has(c));

    return (
        <Modal
            open={open}
            onClose={onCancel}
            size="lg"
            title={t("paddleAssign.title", { paddle })}
            footer={(
                <>
                    {/* The footer is flex/flex-end, so this pushes "clear" to the left */}
                    <button
                        type="button"
                        className="btn btn--md"
                        style={{ marginRight: "auto" }}
                        onClick={() => setPicked(new Set())}
                        disabled={picked.size === 0}
                    >
                        {t("paddleAssign.clear")}
                    </button>
                    <button type="button" className="btn btn--md" onClick={onCancel}>
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn--md"
                        onClick={() => onApply?.(codesToTokens(picked))}
                    >
                        {t("common.done")}
                    </button>
                </>
            )}
        >
            <div className="paddle-assign">
                <p className="paddle-assign__hint">{t("paddleAssign.hint", { paddle })}</p>
                <div className="paddle-assign__stage">
                    <Procon2View
                        buttons={buttons}
                        dpad={dirs}
                        sticks={NEUTRAL_STICKS}
                        selectable={CODE_SET}
                        onToggle={toggle}
                    />
                </div>
                <div className="paddle-assign__summary">
                    <span className="paddle-assign__summary-label">
                        {t("paddleAssign.current", { paddle })}
                    </span>
                    {ordered.length === 0 ? (
                        <span className="paddle-assign__none">{t("paddleAssign.none")}</span>
                    ) : (
                        <span className="paddle-assign__chips">
                            {ordered.map((code) => (
                                <span key={code} className="paddle-assign__chip">{codeLabel(code)}</span>
                            ))}
                        </span>
                    )}
                </div>
            </div>
        </Modal>
    );
}
