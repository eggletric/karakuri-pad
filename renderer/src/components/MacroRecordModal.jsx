import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.jsx";
import { MacroSteps } from "./MacroSteps.jsx";
import { MiniControllerView } from "./MiniControllerView.jsx";
import { PassthroughPanel } from "./PassthroughPanel.jsx";
import { buildStepsFromRecording } from "./recordingToSteps.js";

export function MacroRecordModal({
    open,
    onClose,
    onCommit,
    isCountingDown,
    countdown,
    isRecording,
    toggleRecording,
    controllerInputSupported,
    controllerConnected,
    controllerName,
    controllerStatusMessage,
    controllerSetupLinks,
    recordedSteps,
}) {
    const { t } = useTranslation();
    // The preview shows the same "as committed" form as the macro tab (down->up becomes a TAP,
    // gaps become SLEEPs). recordedSteps holds raw events, so apply the same conversion as on commit.
    const previewSteps = React.useMemo(
        () => buildStepsFromRecording(recordedSteps),
        [recordedSteps]
    );

    // Auto-scroll the list to the bottom as steps are added
    const stepsBoxRef = React.useRef(null);
    React.useEffect(() => {
        const el = stepsBoxRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [previewSteps.length]);

    // Recording cannot start without a controller connected
    const canStart = controllerInputSupported && controllerConnected;

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={t("record.title")}
            footer={(
                <>
                    <button className="btn btn--md" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        className="btn btn--md"
                        onClick={onCommit}
                        disabled={isRecording || isCountingDown || recordedSteps.length === 0}
                    >
                        {t("common.done")}
                    </button>
                </>
            )}
        >
            <div className="macro-recorder-grid">
                {/* Left: recording controls and controller status */}
                <div className="macro-recorder-grid__left">
                    <div className="macro-recorder-actions">
                        <button
                            className="btn btn--md"
                            onClick={toggleRecording}
                            disabled={!isRecording && !isCountingDown && !canStart}
                        >
                            {isRecording || isCountingDown ? t("record.stop") : t("record.start")}
                        </button>
                        <div className="macro-recorder-status">
                            {isCountingDown && (
                                <span className="macro-recorder-countdown">
                                    {t("record.countdownLabel", { countdown })}
                                </span>
                            )}
                            {!isCountingDown && isRecording && (
                                <span className="macro-recorder-live">{t("record.recording")}</span>
                            )}
                            {!isRecording && !isCountingDown && (
                                <span className="macro-recorder-idle">
                                    {canStart ? t("record.idleReady") : t("record.idleSearching")}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Input visualisation: the hardware-like view from the controller test, scaled down */}
                    <div className="macro-recorder-p2v">
                        <MiniControllerView />
                    </div>

                    {/* Connection info. The connected chip and the not-connected notice share one frame,
                        with a fixed height so the layout does not shift when they swap */}
                    <div className="macro-recorder-conninfo">
                        {!controllerInputSupported ? (
                            <span className="macro-recorder-empty">
                                {t("record.inputNotSupported")}
                            </span>
                        ) : controllerConnected ? (
                            <span className="macro-recorder-chip">
                                {controllerName ? t("record.connectedWithName", { name: controllerName }) : t("record.connected")}
                            </span>
                        ) : (
                            <span className="macro-recorder-empty">
                                {t("record.connectHint")}
                            </span>
                        )}
                    </div>

                    {controllerInputSupported && controllerStatusMessage && (
                        <div className="macro-recorder-detections">
                            <span className="macro-recorder-chip macro-recorder-chip--warning">
                                {controllerStatusMessage}
                            </span>
                            {(controllerSetupLinks || []).map((link) => (
                                <a
                                    key={link.url}
                                    className="macro-recorder-link"
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Passthrough is available from here too, so the console can be driven on real
                        hardware between recordings (the panel is self-contained) */}
                    <div className="macro-recorder-passthrough">
                        <PassthroughPanel />
                    </div>
                </div>

                {/* Right: the recorded steps (a read-only version of the macro tab's display) */}
                <div className="macro-recorder-grid__right">
                    <div className="macro-recorder-steps-title">
                        <span>{t("record.stepsTitle")}</span>
                        <span>{previewSteps.length > 0 ? t("record.stepsCount", { count: previewSteps.length }) : ""}</span>
                    </div>
                    <div className="macro-recorder-steps-box" ref={stepsBoxRef}>
                        <MacroSteps
                            steps={previewSteps}
                            setSteps={() => {}}
                            readOnly
                            emptyText={t("record.emptyText")}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
