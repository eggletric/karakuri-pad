import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.jsx";

// Operation manual for the controller-side gestures, in two tabs: the dongle macro
// recorder and the GL/GR button assignment. Every gesture, state change and vibration
// pattern shown here mirrors the firmware implementation
// (karakuri-firmware: pico_switch_pad.ino, "Dongle macro recorder" section).

const SLOT_KEYS = ["A", "B", "X", "Y", "L", "R", "ZL", "ZR"];
// What a paddle may be assigned to (firmware: GLGR_ASSIGNABLE_MASK)
const ASSIGN_KEYS = ["↑", "↓", "←", "→", "A", "B", "X", "Y", "L", "R", "ZL", "ZR", "L3", "R3"];

// Vibration pattern: "s" = short (~120ms), "l" = long (~400ms), "x" = extra long (~1s)
function Vib({ pattern }) {
    return (
        <span className="mm-vib" aria-hidden="true">
            {pattern.split("").map((p, i) => (
                <span
                    key={i}
                    className={
                        "mm-vib__pulse"
                        + (p === "l" ? " mm-vib__pulse--long" : "")
                        + (p === "x" ? " mm-vib__pulse--xlong" : "")
                    }
                />
            ))}
        </span>
    );
}

function Key({ children, accent }) {
    return (
        <kbd className={"mm-key" + (accent ? " mm-key--accent" : "")}>
            {children}
        </kbd>
    );
}

function Step({ num, gesture, caption, last }) {
    return (
        <div className={"mm-step" + (last ? " mm-step--last" : "")}>
            <div className="mm-step__rail">
                <div className="mm-step__num">{num}</div>
                {!last && <div className="mm-step__line" />}
            </div>
            <div className="mm-step__body">
                <div className="mm-step__gesture">{gesture}</div>
                <div className="mm-step__caption">{caption}</div>
            </div>
        </div>
    );
}

// The macro recorder tab: unchanged from when this modal only covered the recorder
function MacroTab({ t }) {
    return (
        <>
                {/* Premise: what the C button becomes and what a slot is */}
                <div className="mm-intro">
                    <div className="mm-intro__row">
                        <Key accent>C</Key>
                        <span>{t("macroManual.introC")}</span>
                    </div>
                    <div className="mm-intro__row">
                        <span className="mm-intro__slots">
                            {SLOT_KEYS.map((k) => (
                                <Key key={k}>{k}</Key>
                            ))}
                        </span>
                        <span>{t("macroManual.introSlots")}</span>
                    </div>
                </div>

                <div className="mm-columns">
                    {/* Left: recording flow */}
                    <section className="mm-col">
                        <h4 className="mm-section-title">{t("macroManual.recordTitle")}</h4>
                        <Step
                            num="1"
                            gesture={
                                <>
                                    <Key accent>C</Key>
                                    <span className="mm-op">+</span>
                                    <Key>GL</Key>
                                    <span className="mm-op">/</span>
                                    <Key>GR</Key>
                                    <span className="mm-hold">{t("macroManual.hold1s")}</span>
                                    <Vib pattern="s" />
                                </>
                            }
                            caption={t("macroManual.rec1")}
                        />
                        <Step
                            num="2"
                            gesture={
                                <>
                                    <span className="mm-release">{t("macroManual.releaseAll")}</span>
                                    <span className="mm-op">→</span>
                                    <span className="mm-wait">0.5s</span>
                                    <Vib pattern="s" />
                                </>
                            }
                            caption={t("macroManual.rec2")}
                        />
                        <Step
                            num="3"
                            gesture={
                                <>
                                    <span className="mm-recdot" />
                                    <span className="mm-recording">{t("macroManual.recording")}</span>
                                    <span className="mm-limit">{t("macroManual.max90s")}</span>
                                </>
                            }
                            caption={t("macroManual.rec3")}
                        />
                        <Step
                            num="4"
                            gesture={
                                <>
                                    <Key accent>C</Key>
                                    <span className="mm-op">→</span>
                                    <span>{t("macroManual.stopLabel")}</span>
                                    <Vib pattern="s" />
                                </>
                            }
                            caption={t("macroManual.rec4")}
                        />
                        <Step
                            num="5"
                            last
                            gesture={
                                <>
                                    <Key>A</Key>
                                    <span className="mm-op">…</span>
                                    <Key>ZR</Key>
                                    <span className="mm-op">=</span>
                                    <span className="mm-save">{t("macroManual.saveLabel")}</span>
                                    <Vib pattern="ss" />
                                    <span className="mm-sep" />
                                    <Key accent>C</Key>
                                    <span className="mm-op">=</span>
                                    <span className="mm-discard">{t("macroManual.discardLabel")}</span>
                                    <Vib pattern="l" />
                                </>
                            }
                            caption={t("macroManual.rec5")}
                        />
                    </section>

                    {/* Right: playback flow + vibration cue legend */}
                    <section className="mm-col">
                        <h4 className="mm-section-title">{t("macroManual.playTitle")}</h4>
                        <Step
                            num="1"
                            gesture={
                                <>
                                    <Key accent>C</Key>
                                    <span className="mm-holdmark">{t("macroManual.whileHolding")}</span>
                                    <span className="mm-op">+</span>
                                    <Key>A</Key>
                                    <span className="mm-op">…</span>
                                    <Key>ZR</Key>
                                    <Vib pattern="ss" />
                                </>
                            }
                            caption={t("macroManual.play1")}
                        />
                        <Step
                            num="2"
                            last
                            gesture={
                                <>
                                    <Key accent>C</Key>
                                    <span className="mm-op">→</span>
                                    <span>{t("macroManual.stopLabel")}</span>
                                    <Vib pattern="s" />
                                </>
                            }
                            caption={t("macroManual.play2")}
                        />

                        <h4 className="mm-section-title">{t("macroManual.vibTitle")}</h4>
                        <div className="mm-vib-table">
                            <div className="mm-vib-row">
                                <Vib pattern="s" />
                                <div>
                                    <div className="mm-vib-row__label">{t("macroManual.vib1Label")}</div>
                                    <div className="mm-vib-row__desc">{t("macroManual.vib1Desc")}</div>
                                </div>
                            </div>
                            <div className="mm-vib-row">
                                <Vib pattern="ss" />
                                <div>
                                    <div className="mm-vib-row__label">{t("macroManual.vib2Label")}</div>
                                    <div className="mm-vib-row__desc">{t("macroManual.vib2Desc")}</div>
                                </div>
                            </div>
                            <div className="mm-vib-row">
                                <Vib pattern="l" />
                                <div>
                                    <div className="mm-vib-row__label">{t("macroManual.vib3Label")}</div>
                                    <div className="mm-vib-row__desc">{t("macroManual.vib3Desc")}</div>
                                </div>
                            </div>
                            <div className="mm-vib-row">
                                <Vib pattern="sss" />
                                <div>
                                    <div className="mm-vib-row__label">{t("macroManual.vib4Label")}</div>
                                    <div className="mm-vib-row__desc">{t("macroManual.vib4Desc")}</div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

            {/* Footnotes that do not belong to a single step */}
            <ul className="mm-notes">
                <li>{t("macroManual.note1")}</li>
                <li>{t("macroManual.note2")}</li>
                <li>{t("macroManual.note3")}</li>
            </ul>
        </>
    );
}


// The GL/GR assignment tab. Mirrors the C+GL+GR gesture in the firmware
// (pico_switch_pad.ino, the DM_ASSIGN_* states).
function PaddleTab({ t }) {
    return (
        <>
            {/* Premise: what the gesture is and what can be assigned */}
            <div className="mm-intro">
                <div className="mm-intro__row">
                    <span className="mm-intro__slots">
                        <Key accent>C</Key>
                        <span className="mm-op">+</span>
                        <Key>GL</Key>
                        <span className="mm-op">+</span>
                        <Key>GR</Key>
                    </span>
                    <span>{t("paddleManual.introGesture")}</span>
                </div>
                <div className="mm-intro__row">
                    <span className="mm-intro__slots">
                        {ASSIGN_KEYS.map((k) => (
                            <Key key={k}>{k}</Key>
                        ))}
                    </span>
                    <span>{t("paddleManual.introKeys")}</span>
                </div>
            </div>

            <div className="mm-columns">
                {/* Left: the assignment flow */}
                <section className="mm-col">
                    <h4 className="mm-section-title">{t("paddleManual.assignTitle")}</h4>
                    <Step
                        num="1"
                        gesture={
                            <>
                                <Key accent>C</Key>
                                <span className="mm-op">+</span>
                                <Key>GL</Key>
                                <span className="mm-op">+</span>
                                <Key>GR</Key>
                                <span className="mm-hold">{t("macroManual.hold1s")}</span>
                                <Vib pattern="x" />
                            </>
                        }
                        caption={t("paddleManual.step1")}
                    />
                    <Step
                        num="2"
                        gesture={
                            <>
                                <span className="mm-release">{t("macroManual.releaseAll")}</span>
                                <span className="mm-op">→</span>
                                <span className="mm-wait">0.5s</span>
                            </>
                        }
                        caption={t("paddleManual.step2")}
                    />
                    <Step
                        num="3"
                        gesture={
                            <>
                                <span className="mm-release">{t("paddleManual.anyButtons")}</span>
                                <span className="mm-hold">{t("paddleManual.hold3s")}</span>
                                <Vib pattern="ss" />
                            </>
                        }
                        caption={t("paddleManual.step3")}
                    />
                    <Step
                        num="4"
                        last
                        gesture={
                            <>
                                <span className="mm-release">{t("macroManual.releaseAll")}</span>
                                <span className="mm-op">→</span>
                                <Key>GL</Key>
                                <span className="mm-op">/</span>
                                <Key>GR</Key>
                                <Vib pattern="s" />
                            </>
                        }
                        caption={t("paddleManual.step4")}
                    />
                </section>

                {/* Right: undoing things + vibration cue legend */}
                <section className="mm-col">
                    <h4 className="mm-section-title">{t("paddleManual.undoTitle")}</h4>
                    <Step
                        num="1"
                        gesture={
                            <>
                                <Key accent>C</Key>
                                <span className="mm-op">→</span>
                                <span className="mm-discard">{t("paddleManual.cancelLabel")}</span>
                                <Vib pattern="l" />
                            </>
                        }
                        caption={t("paddleManual.cancel")}
                    />
                    <Step
                        num="2"
                        last
                        gesture={
                            <>
                                <span className="mm-release">{t("paddleManual.nothingHeld")}</span>
                                <span className="mm-op">→</span>
                                <Key>GL</Key>
                                <span className="mm-op">/</span>
                                <Key>GR</Key>
                                <Vib pattern="s" />
                            </>
                        }
                        caption={t("paddleManual.clear")}
                    />

                    <h4 className="mm-section-title">{t("macroManual.vibTitle")}</h4>
                    <div className="mm-vib-table">
                        <div className="mm-vib-row">
                            <Vib pattern="x" />
                            <div>
                                <div className="mm-vib-row__label">{t("paddleManual.vib1Label")}</div>
                                <div className="mm-vib-row__desc">{t("paddleManual.vib1Desc")}</div>
                            </div>
                        </div>
                        <div className="mm-vib-row">
                            <Vib pattern="ss" />
                            <div>
                                <div className="mm-vib-row__label">{t("macroManual.vib2Label")}</div>
                                <div className="mm-vib-row__desc">{t("paddleManual.vib2Desc")}</div>
                            </div>
                        </div>
                        <div className="mm-vib-row">
                            <Vib pattern="s" />
                            <div>
                                <div className="mm-vib-row__label">{t("macroManual.vib1Label")}</div>
                                <div className="mm-vib-row__desc">{t("paddleManual.vib3Desc")}</div>
                            </div>
                        </div>
                        <div className="mm-vib-row">
                            <Vib pattern="l" />
                            <div>
                                <div className="mm-vib-row__label">{t("macroManual.vib3Label")}</div>
                                <div className="mm-vib-row__desc">{t("paddleManual.vib4Desc")}</div>
                            </div>
                        </div>
                        <div className="mm-vib-row">
                            <Vib pattern="sss" />
                            <div>
                                <div className="mm-vib-row__label">{t("macroManual.vib4Label")}</div>
                                <div className="mm-vib-row__desc">{t("paddleManual.vib5Desc")}</div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <ul className="mm-notes">
                <li>{t("paddleManual.note1")}</li>
                <li>{t("paddleManual.note2")}</li>
            </ul>
        </>
    );
}

const TABS = [
    { id: "macro", label: "macroManual.tabMacro", Body: MacroTab },
    { id: "paddle", label: "macroManual.tabPaddle", Body: PaddleTab },
];

export function MacroManualModal({ open, onClose }) {
    const { t } = useTranslation();
    const [tab, setTab] = React.useState(TABS[0].id);

    // Always open on the first tab, so reopening never lands somewhere unexpected
    React.useEffect(() => {
        if (open) setTab(TABS[0].id);
    }, [open]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={t("macroManual.title")}
            titleContent={
                <div className="mm-tabs" role="tablist">
                    {TABS.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={"mm-tab" + (tab === id ? " is-active" : "")}
                            onClick={() => setTab(id)}
                        >
                            {t(label)}
                        </button>
                    ))}
                </div>
            }
        >
            {/* Both panes are always rendered, stacked in one grid cell, so the modal
                keeps the height of the taller tab and does not resize when switching.
                The inactive one is visibility:hidden, which also takes it out of the
                tab order and the accessibility tree. */}
            <div className="mm-body">
                {TABS.map(({ id, Body }) => (
                    <div
                        key={id}
                        role="tabpanel"
                        className={"mm-pane" + (tab === id ? " is-active" : "")}
                    >
                        <Body t={t} />
                    </div>
                ))}
            </div>
        </Modal>
    );
}
