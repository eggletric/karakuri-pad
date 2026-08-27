import React from "react";
import { useTranslation } from "react-i18next";
import { FaSave, FaTrashAlt } from "react-icons/fa";
import { MacroPalette } from "./MacroPalette.jsx";
import { MacroSteps } from "./MacroSteps.jsx";
import { compileMacroToLines } from "./macroCompiler.js";
import { buildStepsFromRecording } from "./recordingToSteps.js";
import { MacroRecordModal } from "./MacroRecordModal.jsx";
import { Modal } from "./Modal.jsx";
import { showToast } from "./Toast.jsx";
import nl2br from "../utils/nl2br.jsx";

const STORAGE_KEY = "picoMacroSlots";

export function MacroEditor() {
    const { t } = useTranslation();
    const loadStoredSlots = React.useCallback(() => {
        try {
            if (!window?.localStorage) return [];

            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("failed to load macro slots:", e);
            return [];
        }
    }, []);

    const initialSlotsRef = React.useRef(null);
    if (initialSlotsRef.current === null) {
        initialSlotsRef.current = loadStoredSlots();
    }

    const [steps, setSteps] = React.useState(initialSlotsRef.current[0]?.steps || []);
    const [slots, setSlots] = React.useState(initialSlotsRef.current);
    const [selectedSlotId, setSelectedSlotId] = React.useState(
        initialSlotsRef.current[0]?.id || null
    );

    // The playback result from the firmware (dropped steps, unknown commands, ...)
    const [playbackMsg, setPlaybackMsg] = React.useState(null);
    // Whether a macro is running (on the firmware side). Used for the warning shown when hovering Play
    const [macroRunning, setMacroRunning] = React.useState(false);
    const expectedStepsRef = React.useRef(null);

    // Name input for creating a new slot
    const [newSlotName, setNewSlotName] = React.useState("");
    const newSlotNameRef = React.useRef(null);

    // Inline editing state for renaming
    const [editingSlotId, setEditingSlotId] = React.useState(null);
    const [editingName, setEditingName] = React.useState("");
    // Confirm before switching slots mid-rename if there are unsaved changes
    const [pendingSelectSlot, setPendingSelectSlot] = React.useState(null);
    const [slotToDelete, setSlotToDelete] = React.useState(null);
    const editingNameRef = React.useRef(null);

    // For controller recording
    const [isRecordModalOpen, setIsRecordModalOpen] = React.useState(false);
    const [isCountingDown, setIsCountingDown] = React.useState(false);
    const [countdown, setCountdown] = React.useState(3);
    const [isRecording, setIsRecording] = React.useState(false);
    const [recordedSteps, setRecordedSteps] = React.useState([]);
    const [controllerInputSupported, setControllerInputSupported] = React.useState(false);
    const [controllerConnected, setControllerConnected] = React.useState(false);
    const [controllerName, setControllerName] = React.useState("");
    const [controllerStatusMessage, setControllerStatusMessage] = React.useState("");
    const [controllerSetupLinks, setControllerSetupLinks] = React.useState([]);
    const countdownTimerRef = React.useRef(null);

    // Persistence
    React.useEffect(() => {
        (async () => {
            try {
                if (window.localStorage) {
                    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
                }
            } catch (e) {
                console.error("failed to save macro slots:", e);
            }
        })();
    }, [slots]);

    const handleDragStart = (e, data) => {
        e.dataTransfer.setData("application/x-step", JSON.stringify(data));
    };

    const selectedSlot = React.useMemo(
        () => slots.find((s) => s.id === selectedSlotId) || null,
        [slots, selectedSlotId]
    );

    const createSlot = () => {
        const baseName = newSlotName.trim();
        const name = baseName || t("macro.newSlotDefaultName");
        const id = String(Date.now());
        const newSlot = { id, name, steps: [] };
        setSlots((prev) => [...prev, newSlot]);
        setSelectedSlotId(id);
        setSteps([]);
        setNewSlotName("");
    };

    // Whether the name being edited differs from the original and has not been saved yet
    const hasUnsavedRename = () => {
        if (!editingSlotId) return false;
        const editing = slots.find((s) => s.id === editingSlotId);
        if (!editing) return false;
        const name = editingName.trim();
        return !!name && name !== (editing.name || "");
    };

    const selectSlot = (slot) => {
        if (editingSlotId && editingSlotId !== slot.id) {
            if (hasUnsavedRename()) {
                // Unsaved changes: do not switch yet, go to the confirmation modal
                setPendingSelectSlot(slot);
                return;
            }
            // No changes: quietly cancel the edit and switch
            cancelRenameSlot();
        }
        setSelectedSlotId(slot.id);
        setSteps(slot.steps || []);
    };

    // Handling the confirmation modal's result
    const resolvePendingSelect = (action) => {
        const target = pendingSelectSlot;
        setPendingSelectSlot(null);
        if (!target) return;

        if (action === "save") {
            const editing = slots.find((s) => s.id === editingSlotId);
            if (editing) commitRenameSlot(editing);
        } else if (action === "discard") {
            cancelRenameSlot();
        } else {
            return; // Cancel: keep editing (and keep the selection)
        }
        setSelectedSlotId(target.id);
        setSteps(target.steps || []);
    };

    const saveToSlot = (slot, stepsToSave = steps) => {
        const compiled = compileMacroToLines(stepsToSave);
        setSlots((prev) =>
            prev.map((s) =>
                s.id === slot.id
                    ? { ...s, steps: stepsToSave, compiled }
                    : s
            )
        );
    };

    React.useEffect(() => {
        if (!selectedSlotId) return;
        const target = slots.find((s) => s.id === selectedSlotId);
        if (!target) return;

        const currentStepsJson = JSON.stringify(steps || []);
        const targetStepsJson = JSON.stringify(target.steps || []);
        if (currentStepsJson === targetStepsJson) return;

        saveToSlot(target, steps);
    }, [steps, selectedSlotId]);

    const startRenameSlot = (slot) => {
        setEditingSlotId(slot.id);
        setEditingName(slot.name || "");
    };

    const commitRenameSlot = (slot) => {
        const name = editingName.trim();
        if (!name) {
            // An empty value counts as a cancel
            setEditingSlotId(null);
            setEditingName("");
            return;
        }
        setSlots((prev) =>
            prev.map((s) =>
                s.id === slot.id
                    ? { ...s, name }
                    : s
            )
        );
        setEditingSlotId(null);
        setEditingName("");
    };

    const cancelRenameSlot = () => {
        setEditingSlotId(null);
        setEditingName("");
    };

    const adjustEditingNameHeight = React.useCallback(() => {
        const textarea = editingNameRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    const adjustNewSlotNameHeight = React.useCallback(() => {
        const textarea = newSlotNameRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    React.useEffect(() => {
        adjustEditingNameHeight();
    }, [editingName, editingSlotId, adjustEditingNameHeight]);

    React.useEffect(() => {
        adjustNewSlotNameHeight();
    }, [newSlotName, adjustNewSlotNameHeight]);

    const deleteSlot = (slot) => {
        const updatedSlots = slots.filter((s) => s.id !== slot.id);
        setSlots(updatedSlots);

        if (selectedSlotId === slot.id) {
            const nextSlot = updatedSlots[0] || null;
            setSelectedSlotId(nextSlot?.id ?? null);
            setSteps(nextSlot?.steps || []);
        }
    };

    const requestDeleteSlot = (slot) => {
        setSlotToDelete(slot);
    };

    const closeDeleteModal = () => {
        setSlotToDelete(null);
    };

    const confirmDeleteSlot = () => {
        if (!slotToDelete) return;
        deleteSlot(slotToDelete);
        setSlotToDelete(null);
    };

    React.useEffect(() => {
        window.pico?.getActivityStatus?.()
            .then((st) => setMacroRunning(!!st?.macroRunning))
            .catch(() => {});
    }, []);

    const play = () => {
        try {
            if (!selectedSlotId) {
                console.warn("no slot selected");
                return;
            }
            const target = slots.find((s) => s.id === selectedSlotId);
            if (!target) return;
            // A bug in older versions could store a slot with compiled left as an empty array,
            // so recover by recompiling from the steps when it is empty
            const compiled = (Array.isArray(target.compiled) && target.compiled.length > 0)
                ? target.compiled
                : compileMacroToLines(target.steps || []);
            if (compiled.length === 0) {
                setPlaybackMsg({ level: "error", text: t("macro.noStepsError") });
                return;
            }
            setPlaybackMsg(null);
            expectedStepsRef.current = null;
            if (window.pico && window.pico.playMacro) {
                window.pico.playMacro(compiled)
                    .then(() => setMacroRunning(true))
                    .catch((e) => {
                        console.error(e);
                        setPlaybackMsg({ level: "error", text: t("macro.sendFailed", { error: e?.message || String(e) }) });
                    });
            }
        } catch (e) {
            console.error(e);
            setPlaybackMsg({ level: "error", text: t("macro.sendFailed", { error: e?.message || String(e) }) });
        }
    };

    const stop = () => {
        try {
            setPlaybackMsg(null);
            setMacroRunning(false);
            if (window.pico && window.pico.stopMacro) {
                window.pico.stopMacro();
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Keep PLAY/STOP unclickable while not connected to the Pico
    const [picoConnected, setPicoConnected] = React.useState(false);
    React.useEffect(() => {
        let cancelled = false;
        window.pico?.getLinkStatus?.()
            .then((s) => { if (!cancelled) setPicoConnected(!!s?.connected); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // The firmware answers MACRO END with "MACRO LOADED <accepted> <dropped>".
    // Without checking it, steps silently dropped past 1800 or for being too long go unnoticed.
    React.useEffect(() => {
        const unsubscribe = window.pico?.onMessage?.((payload) => {
            if (!payload) return;

            if (payload.type === "macro-sent") {
                expectedStepsRef.current = payload.sent;
                return;
            }

            if (payload.type === "connected") {
                setPicoConnected(true);
                return;
            }

            if (payload.type === "closed") {
                setPicoConnected(false);
                setMacroRunning(false);
                setPlaybackMsg({ level: "error", text: t("macro.picoDisconnected") });
                return;
            }

            if (payload.type !== "line" || typeof payload.line !== "string") return;

            const loaded = payload.line.match(/^MACRO LOADED (\d+) (\d+)$/);
            if (loaded) {
                const accepted = Number(loaded[1]);
                const dropped = Number(loaded[2]);
                const expected = expectedStepsRef.current;

                if (dropped > 0 || (expected !== null && accepted !== expected)) {
                    setPlaybackMsg({
                        level: "error",
                        text: t("macro.stepsDropped", { expected: expected ?? "?", accepted, dropped }),
                    });
                } else {
                    setPlaybackMsg({ level: "info", text: t("macro.playingSteps", { accepted }) });
                }
                return;
            }

            if (payload.line.startsWith("ERR ")) {
                const text = payload.line.slice(4);
                // Do not re-render repeatedly with identical content
                setPlaybackMsg((prev) =>
                    prev && prev.level === "error" && prev.text === text ? prev : { level: "error", text }
                );
            }
        });
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, []);

    const clearCountdownTimer = React.useCallback(() => {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }, []);

    const resetRecordingState = React.useCallback(() => {
        clearCountdownTimer();
        setIsCountingDown(false);
        setCountdown(3);
        setIsRecording(false);
    }, [clearCountdownTimer]);

    const closeRecordModal = () => {
        setIsRecordModalOpen(false);
        resetRecordingState();
        setRecordedSteps([]);
        window.pico?.stopBleController?.()
            .catch((e) => console.warn("Failed to stop BLE", e));
    };

    const startCountdown = () => {
        if (isCountingDown || isRecording) return;
        setIsCountingDown(true);
        setCountdown(3);

        clearCountdownTimer();
        countdownTimerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearCountdownTimer();
                    setIsCountingDown(false);
                    setIsRecording(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopRecording = React.useCallback(() => {
        resetRecordingState();
    }, [resetRecordingState]);

    const toggleRecording = () => {
        if (isRecording || isCountingDown) {
            stopRecording();
            return;
        }
        startCountdown();
    };

    // Keeping only the downs would produce a macro that holds buttons forever, so keep the ups too.
    // down/up pairs are collapsed into TAPs when the recording is committed (recordingToSteps.js).
    const mapSignalToStep = (payload) => {
        if (!payload) return null;

        if (payload.type === "button" && payload.button) {
            return {
                type: "button",
                button: String(payload.button).toUpperCase(),
                action: payload.action === "up" ? "up" : "down",
            };
        }
        if (payload.type === "dpad" && payload.dir) {
            const dir = String(payload.dir).toUpperCase();
            if (payload.action === "up" || dir === "CENTER") {
                return { type: "dpad", dir: "CENTER", action: "up" };
            }
            return { type: "dpad", dir, action: "down" };
        }
        if (payload.type === "stick" && payload.stick) {
            const x = Number(payload.x ?? 128);
            const y = Number(payload.y ?? 128);
            return { type: "stick", stick: String(payload.stick).toUpperCase(), x, y };
        }

        return null;
    };

    // Report it if the controller goes away while the recording modal is open
    const controllerConnectedRef = React.useRef(false);
    const recordModalOpenRef = React.useRef(false);
    React.useEffect(() => {
        recordModalOpenRef.current = isRecordModalOpen;
    }, [isRecordModalOpen]);

    const handleControllerSignal = React.useCallback(
        (payload) => {
            if (payload?.type === "status") {
                if (
                    controllerConnectedRef.current &&
                    !payload.connected &&
                    recordModalOpenRef.current
                ) {
                    showToast(t("macro.controllerDisconnected"), "warning");
                }
                controllerConnectedRef.current = !!payload.connected;
                setControllerConnected(!!payload.connected);
                setControllerName(payload.deviceName || "");
                setControllerStatusMessage(payload.message || "");
                setControllerSetupLinks(Array.isArray(payload.setupLinks) ? payload.setupLinks : []);
                return;
            }

            if (!isRecording) return;
            const step = mapSignalToStep(payload || {});
            if (!step) return;
            // at is used to build the SLEEPs and TAPs (it is stripped on commit)
            const at = Number.isFinite(payload?.at) ? payload.at : Date.now();
            setRecordedSteps((prev) => [...prev, { ...step, at }]);
        },
        [isRecording, t]
    );

    React.useEffect(() => {
        const handleWindowEvent = (event) => handleControllerSignal(event.detail || event);
        window.addEventListener("pico-controller-input", handleWindowEvent);
        const unsubscribe = window.pico?.onControllerInput?.(handleControllerSignal);
        return () => {
            window.removeEventListener("pico-controller-input", handleWindowEvent);
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, [handleControllerSignal]);

    React.useEffect(() => {
        return () => clearCountdownTimer();
    }, [clearCountdownTimer]);

    React.useEffect(() => {
        const checkSupport = async () => {
            const hasBridge = typeof window?.pico?.onControllerInput === "function";
            setControllerInputSupported(hasBridge);

            if (hasBridge && typeof window?.pico?.getControllerStatus === "function") {
                try {
                    const status = await window.pico.getControllerStatus();
                    setControllerConnected(!!status?.connected);
                    setControllerName(status?.deviceName || "");
                    setControllerStatusMessage(status?.message || "");
                    setControllerSetupLinks(Array.isArray(status?.setupLinks) ? status.setupLinks : []);
                } catch (e) {
                    console.warn("failed to read controller status", e);
                }
            }
        };

        checkSupport();
        const intervalId = window.setInterval(checkSupport, 2000);
        return () => window.clearInterval(intervalId);
    }, []);

    const commitRecordedSteps = () => {
        if (recordedSteps.length > 0) {
            // Convert the gaps into SLEEPs and the down->up pairs into TAPs before importing
            const built = buildStepsFromRecording(recordedSteps);
            setSteps((prev) => [...prev, ...built]);
        }
        closeRecordModal();
    };

    return (
        <>
            <div className="macro-editor-root">
                <div className="macro-editor-container">
                    {/* Left: the list of macro slots */}
                    <div className="macro-editor-left">
                        <div className="macro-slots-header">
                            <div className="macro-slots-title">{t("macro.slotsTitle")}</div>
                        </div>
                        <div className="macro-slot-new-row">
                            <textarea
                                ref={newSlotNameRef}
                                className="form-control form-control--sm macro-slot-new-input macro-slot-name-textarea"
                                placeholder={t("macro.newSlotPlaceholder")}
                                value={newSlotName}
                                rows={1}
                                onChange={(e) => {
                                    setNewSlotName(e.target.value);
                                    adjustNewSlotNameHeight();
                                }}
                            />
                            <button className="btn btn--sm" onClick={createSlot}>
                                {t("macro.newSlotButton")}
                            </button>
                        </div>
                        <div className="macro-slots-list">
                            {slots.length === 0 && (
                                <div className="macro-slots-empty">
                                    {t("macro.noSavedSlots")}
                                </div>
                            )}
                            {slots.map((slot) => (
                                <label
                                    key={slot.id}
                                    className={
                                        "macro-slot-item" +
                                        (slot.id === selectedSlotId ? " selected" : "")
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="macro-slot"
                                        className="macro-slot-radio"
                                        checked={slot.id === selectedSlotId}
                                        onChange={() => selectSlot(slot)}
                                    />
                                    <div
                                        className="macro-slot-main"
                                        onDoubleClick={() => startRenameSlot(slot)}
                                    >
                                        {editingSlotId === slot.id ? (
                                            <textarea
                                                ref={editingNameRef}
                                                className="form-control form-control--sm macro-slot-name-input macro-slot-name-textarea"
                                                value={editingName}
                                                rows={1}
                                                autoFocus
                                                onChange={(e) => {
                                                    setEditingName(e.target.value);
                                                    adjustEditingNameHeight();
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        e.preventDefault();
                                                        cancelRenameSlot();
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <div className="macro-slot-name">
                                                {nl2br(slot.name) || "(no name)"}
                                            </div>
                                        )}
                                    </div>
                                    {(editingSlotId === null || editingSlotId === slot.id) && (
                                        <button
                                            type="button"
                                            className="macro-slot-action-btn"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (editingSlotId === slot.id) {
                                                    commitRenameSlot(slot);
                                                } else {
                                                    requestDeleteSlot(slot);
                                                }
                                            }}
                                        >
                                            {editingSlotId === slot.id ? (
                                                <FaSave />
                                            ) : (
                                                <FaTrashAlt />
                                            )}
                                        </button>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Centre: the steps of the macro being edited */}
                    <div className="macro-editor-center">
                        <div className="macro-editor-center-header">
                            <div className="playback-actions">
                                <span className="play-anchor">
                                    <button className="transport-btn transport-btn--play" onClick={play} disabled={!picoConnected}>▶ PLAY</button>
                                    {macroRunning && (
                                        <span className="play-popover">
                                            {t("macro.runningHint")}
                                        </span>
                                    )}
                                </span>
                                <button className="transport-btn transport-btn--stop" onClick={stop} disabled={!picoConnected}>■ STOP</button>
                            </div>
                        </div>
                        {playbackMsg && (
                            <div className={"playback-msg" + (playbackMsg.level === "error" ? " playback-msg--error" : "")}>
                                {playbackMsg.text}
                            </div>
                        )}
                        <MacroSteps steps={steps} setSteps={setSteps} />
                    </div>

                </div>
                {/* Right: recording and the palette */}
                <div className="macro-editor-right">
                    <button
                        className="btn btn--md macro-record-btn"
                        onClick={() => {
                            setRecordedSteps([]);
                            resetRecordingState();
                            setIsRecordModalOpen(true);
                            // The Pro Controller 2 is BLE, so only start discovery when the recorder is opened
                            window.pico?.startBleController?.()
                                .catch((e) => console.warn("Failed to start BLE", e));
                        }}
                    >
                        <span className="rec-dot" />
                        {t("macro.recordButton")}
                    </button>
                    <MacroPalette onDragStart={handleDragStart} />
                </div>
                </div>

            <MacroRecordModal
                open={isRecordModalOpen}
                onClose={closeRecordModal}
                onCommit={commitRecordedSteps}
                isCountingDown={isCountingDown}
                countdown={countdown}
                isRecording={isRecording}
                toggleRecording={toggleRecording}
                controllerInputSupported={controllerInputSupported}
                controllerConnected={controllerConnected}
                controllerName={controllerName}
                controllerStatusMessage={controllerStatusMessage}
                controllerSetupLinks={controllerSetupLinks}
                recordedSteps={recordedSteps}
            />

            <Modal
                open={!!slotToDelete}
                onClose={closeDeleteModal}
                title={t("macro.deleteSlotTitle")}
                footer={(
                    <>
                        <button className="btn btn--md" onClick={closeDeleteModal}>
                            {t("common.cancel")}
                        </button>
                        <button className="btn btn--md" onClick={confirmDeleteSlot}>
                            {t("common.delete")}
                        </button>
                    </>
                )}
            >
                <p>
                    {t("macro.deleteSlotConfirmLine1", { name: slotToDelete?.name || "(no name)" })}<br />{t("macro.deleteSlotConfirmLine2")}
                </p>
            </Modal>

            <Modal
                open={!!pendingSelectSlot}
                onClose={() => resolvePendingSelect("cancel")}
                title={t("macro.unsavedRenameTitle")}
                footer={(
                    <>
                        <button
                            className="btn btn--md"
                            onClick={() => resolvePendingSelect("cancel")}
                        >
                            {t("macro.backToEditing")}
                        </button>
                        <button
                            className="btn btn--sm btn-danger"
                            onClick={() => resolvePendingSelect("discard")}
                        >
                            {t("macro.discardAndSwitch")}
                        </button>
                        <button
                            className="btn btn--sm btn-primary"
                            onClick={() => resolvePendingSelect("save")}
                        >
                            {t("macro.saveAndSwitch")}
                        </button>
                    </>
                )}
            >
                <p>
                    {t("macro.unsavedRenameLine1")}<br />
                    {t("macro.unsavedRenameLine2")}
                </p>
            </Modal>

        </>
    );
}
