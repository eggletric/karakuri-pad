import React from "react";
import { useTranslation } from "react-i18next";
import { FaHome, FaCamera, FaPlus, FaMinus } from "react-icons/fa";
import { Modal } from "./Modal";

const StickPad = ({ value, onChange, padSize, thumbSize, interactive }) => {
    const padRef = React.useRef(null);
    const [pos, setPos] = React.useState(value);
    const [isDragging, setDragging] = React.useState(false);

    const radius = (padSize - thumbSize) / 2;

    const updateFromClientPos = React.useCallback(
        (clientX, clientY) => {
            if (!padRef.current) return;
            const rect = padRef.current.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const dx = clientX - cx;
            const dy = clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clamped = Math.min(dist, radius);

            const rx = dist ? (dx / dist) * clamped : 0;
            const ry = dist ? (dy / dist) * clamped : 0;

            const nx = Math.round((rx / radius) * 127) + 128;
            const ny = Math.round((ry / radius) * 127) + 128;

            const nextPos = {
                x: Math.min(255, Math.max(0, nx)),
                y: Math.min(255, Math.max(0, ny)),
            };

            setPos(nextPos);
            onChange?.(nextPos);
        },
        [onChange, radius]
    );

    const handleMouseDown = (e) => {
        if (!interactive) return;
        e.preventDefault();
        setDragging(true);
        updateFromClientPos(e.clientX, e.clientY);
    };

    const handleMouseMove = (e) => {
        if (!interactive || !isDragging) return;
        updateFromClientPos(e.clientX, e.clientY);
    };

    React.useEffect(() => {
        if (!interactive || !isDragging) return;

        const handleWindowMove = (e) => updateFromClientPos(e.clientX, e.clientY);
        const handleWindowUp = () => setDragging(false);

        window.addEventListener("mousemove", handleWindowMove);
        window.addEventListener("mouseup", handleWindowUp);

        return () => {
            window.removeEventListener("mousemove", handleWindowMove);
            window.removeEventListener("mouseup", handleWindowUp);
        };
    }, [interactive, isDragging, updateFromClientPos]);

    React.useEffect(() => {
        setPos(value);
    }, [value]);

    const offsetX = ((pos.x - 128) / 127) * radius;
    const offsetY = ((pos.y - 128) / 127) * radius;

    return (
        <div
            className={
                "step-stick-pad" + (interactive ? "" : " step-stick-pad--readonly")
            }
            style={{ width: padSize, height: padSize }}
            ref={padRef}
            onMouseDown={interactive ? handleMouseDown : undefined}
            onMouseMove={interactive ? handleMouseMove : undefined}
            onMouseUp={interactive ? () => setDragging(false) : undefined}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div
                className="step-stick-thumb"
                style={{
                    left: padSize / 2 + offsetX - thumbSize / 2,
                    top: padSize / 2 + offsetY - thumbSize / 2,
                    width: thumbSize,
                    height: thumbSize,
                }}
            />
        </div>
    );
};

const StepStickInput = ({ stick, x, y, onChange, readOnly = false }) => {
    const { t } = useTranslation();
    const [pos, setPos] = React.useState({ x, y });
    const [draftPos, setDraftPos] = React.useState({ x, y });
    const [isModalOpen, setModalOpen] = React.useState(false);

    React.useEffect(() => {
        const nextPos = { x, y };
        setPos(nextPos);
        setDraftPos(nextPos);
    }, [x, y]);

    const handleChange = (nextPos) => {
        setDraftPos(nextPos);
    };

    const handleOpen = () => {
        if (readOnly) return;
        setDraftPos(pos);
        setModalOpen(true);
    };

    const handleConfirm = () => {
        setPos(draftPos);
        onChange?.(draftPos);
        setModalOpen(false);
    };

    const handleCancel = () => {
        setDraftPos(pos);
        setModalOpen(false);
    };

    return (
        <>
            <div className="step-stick-control">
                <div
                    role={readOnly ? undefined : "button"}
                    tabIndex={readOnly ? undefined : 0}
                    aria-label={readOnly ? undefined : t("macro.adjustStick", { stick })}
                    onClick={readOnly ? undefined : handleOpen}
                    onKeyDown={readOnly ? undefined : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpen();
                        }
                    }}
                >
                    <StickPad
                        value={pos}
                        onChange={handleChange}
                        padSize={30}
                        thumbSize={8}
                        interactive={false}
                    />
                </div>
                <div className="step-stick-meta">
                    <div className="step-stick-values">X:{pos.x} / Y:{pos.y}</div>
                </div>
            </div>

            <Modal
                open={isModalOpen}
                onClose={handleCancel}
                title={`${stick} Stick`}
                footer={
                    <>
                        <button className="btn btn--md" onClick={handleCancel}>
                            {t("common.cancel")}
                        </button>
                        <button
                            className="btn btn--md btn-primary"
                            onClick={handleConfirm}
                        >
                            {t("common.ok")}
                        </button>
                    </>
                }
            >
                <div className="step-stick-modal">
                    <StickPad
                        value={draftPos}
                        onChange={handleChange}
                        padSize={150}
                        thumbSize={30}
                        interactive={true}
                    />
                    <div className="step-stick-modal__meta">
                        <div className="step-stick-modal__label">{t("macro.dragToAdjust")}</div>
                        <div className="step-stick-modal__values">
                            X:{draftPos.x} / Y:{draftPos.y}
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};

// readOnly: for cases like the recording modal's preview, where the same look is wanted but
//   display only. Disables reordering, deletion, value edits and drag & drop additions.
// emptyText: what to show when there are no steps (defaults to the macro tab's drop hint)
export function MacroSteps({ steps, setSteps, readOnly = false, emptyText }) {
    const { t } = useTranslation();
    const effectiveEmptyText = emptyText ?? t("macro.dropHint");
    // Which row is being drag-reordered (internal to Steps)
    const [dragIndex, setDragIndex] = React.useState(null);
    // Index of the "it will be inserted here" guide line (0 to steps.length)
    const [dragOverIndex, setDragOverIndex] = React.useState(null);
    // References to the row DOM nodes (for the manual drag & drop)
    const rowRefs = React.useRef([]);

    const [ghostPos, setGhostPos] = React.useState(null);

    const clearDragState = () => {
        setDragIndex(null);
        setDragOverIndex(null);
        if (typeof document !== "undefined") {
            document.body.style.userSelect = "auto";
        }
    };

    // The actual insertion (only handles new steps coming from the palette)
    const insertFromTransfer = (e, targetIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const json = e.dataTransfer.getData("application/x-step");

        // 1) Adding a new step from the palette (independent of the manual drag inside Steps)
        if (json) {
            try {
                const data = JSON.parse(json);
                const copy = [...steps];

                let insertIndex = targetIndex;
                if (insertIndex < 0) insertIndex = 0;
                if (insertIndex > copy.length) insertIndex = copy.length;

                copy.splice(insertIndex, 0, data);
                setSteps(copy);
            } catch (err) {
                console.error("invalid step drop:", err);
            }
        }

        // When a palette drag & drop ends, only clear the drag state
        clearDragState();
    };

    // Parent container: handles drag & drop (from the palette) onto the padding (guide at the end)
    const handleRootDragOver = (e) => {
        e.preventDefault();
        if (dragOverIndex == null) {
            setDragOverIndex(steps.length);
        }
    };

    const handleRootDrop = (e) => {
        const index = dragOverIndex != null ? dragOverIndex : steps.length;
        insertFromTransfer(e, index);
    };

    const handleRootDragLeave = (e) => {
        const rt = e.relatedTarget;
        if (!rt || !e.currentTarget.contains(rt)) {
            clearDragState();
        }
    };

    const remove = (i) => {
        const copy = [...steps];
        copy.splice(i, 1);
        setSteps(copy);
    };

    // Switch a button step between Tap / Down / Up
    const updateButtonKind = (i, kind) => {
        const copy = [...steps];
        const cur = copy[i];
        const button = cur.button;
        if (kind === "tap") {
            copy[i] = { type: "tap", button, ms: cur.ms || 100 };
        } else {
            copy[i] = { type: "button", button, action: kind };
        }
        setSteps(copy);
    };

    // Switch a D-Pad step between Tap / Hold / Center
    const updateDpadKind = (i, kind) => {
        const copy = [...steps];
        const cur = copy[i];
        const dir = cur.dir === "CENTER" ? "UP" : cur.dir;   // default direction when coming back from Center
        if (kind === "tap") {
            copy[i] = { type: "dpad", dir, ms: cur.ms || 100 };
        } else if (kind === "hold") {
            copy[i] = { type: "dpad", dir, action: "down" };
        } else {
            copy[i] = { type: "dpad", dir: "CENTER", action: "up" };
        }
        setSteps(copy);
    };

    const updateSleep = (i, ms) => {
        const num = Number(ms);
        if (Number.isNaN(num)) return;   // do not store an invalid value
        const clamped = Math.max(1, Math.min(60000, num));   // same range as tap/dpad in macroCompiler
        const copy = [...steps];
        copy[i] = { ...copy[i], ms: clamped };
        setSteps(copy);
    };

    const updateStick = (i, pos) => {
        const copy = [...steps];
        copy[i] = { ...copy[i], ...pos };
        setSteps(copy);
    };

    // The drop indicator shown *between* rows
    const renderDropIndicator = (index) => (
        <div
            key={"drop-" + index}
            className={
                "step-drop-indicator" +
                (dragOverIndex === index ? " active" : "")
            }
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverIndex(index);
            }}
            onDrop={(e) => {
                insertFromTransfer(e, index);
            }}
        />
    );

    // For palette drag & drop over a row (top half = before / bottom half = after)
    const handleRowDragOver = (e, i) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const mid = rect.height / 2;
        const index = offsetY < mid ? i : i + 1;
        setDragOverIndex(index);
    };

    const handleRowDrop = (e, i) => {
        e.preventDefault();
        e.stopPropagation();
        const index = dragOverIndex != null ? dragOverIndex : i + 1;
        insertFromTransfer(e, index);
    };

    // Reordering inside Steps: a mouse drag (HTML5 DnD is not used)
    React.useEffect(() => {
        if (dragIndex == null) return;

        const handleMove = (e) => {
            const y = e.clientY;
            const rects = rowRefs.current.map((el) =>
                el ? el.getBoundingClientRect() : null
            );

            let target = steps.length;

            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                if (!r) continue;
                const mid = r.top + r.height / 2;
                if (y < mid) {
                    target = i;
                    break;
                }
            }

            setDragOverIndex(target);

            // Update the ghost's position so it keeps the point where it was grabbed
            setGhostPos((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    x: e.clientX - prev.dx,
                    y: e.clientY - prev.dy,
                };
            });
        };

        const handleUp = () => {
            // Perform the reorder
            if (
                dragIndex != null &&
                dragOverIndex != null &&
                dragIndex !== dragOverIndex &&
                dragIndex + 1 !== dragOverIndex
            ) {
                setSteps((prev) => {
                    const from = dragIndex;
                    let targetIndex = dragOverIndex;

                    const copy = [...prev];
                    const [moved] = copy.splice(from, 1);

                    if (from < targetIndex) {
                        targetIndex = targetIndex - 1;
                    }
                    if (targetIndex < 0) targetIndex = 0;
                    if (targetIndex > copy.length) targetIndex = copy.length;

                    copy.splice(targetIndex, 0, moved);
                    return copy;
                });
            }
            setGhostPos(null);
            clearDragState();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);

        if (typeof document !== "undefined") {
            document.body.style.userSelect = "none";
        }

        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            if (typeof document !== "undefined") {
                document.body.style.userSelect = "auto";
            }
        };
    }, [dragIndex, dragOverIndex, steps, setSteps]);

    const handleHandleMouseDown = (i, e) => {
        // Start a reorder inside Steps
        e.preventDefault();
        setDragIndex(i);
        setDragOverIndex(i);

        const el = rowRefs.current[i];
        const rect = el ? el.getBoundingClientRect() : null;

        if (rect) {
            const dx = e.clientX - rect.left;
            const dy = e.clientY - rect.top;

            setGhostPos({
                x: rect.left,      // top left of the row
                y: rect.top,
                width: rect.width,
                dx,
                dy,
            });
        } else {
            setGhostPos(null);
        }
    };

    const renderButtonLabel = (button) => {
        switch (button) {
            case "PLUS":
                return <div className="palette-icon-item"><FaPlus /></div>;
            case "MINUS":
                return <div className="palette-icon-item"><FaMinus /></div>;
            case "HOME":
                return <div className="palette-icon-item"><FaHome /></div>;
            case "CAPTURE":
                return <div className="palette-icon-item"><FaCamera /></div>;
            case "LSTICK":
                return "L3";
            case "RSTICK":
                return "R3";
            default:
                return button;
        }
    };

    return (
        <div
            className={"macro-steps" + (readOnly ? " macro-steps--readonly" : "")}
            onDragOver={readOnly ? undefined : handleRootDragOver}
            onDrop={readOnly ? undefined : handleRootDrop}
            onDragLeave={readOnly ? undefined : handleRootDragLeave}
        >
            {(() => {
                if (steps.length == 0) {
                    return (
                        <h3 className="back-text">{effectiveEmptyText}</h3>
                    )
                }
            })()}
            {/* The "it goes here" indicator at the top */}
            {!readOnly && renderDropIndicator(0)}

            {steps.map((s, i) => (
                <React.Fragment key={i}>
                    <div
                        className={
                            "step-row" + (dragIndex === i ? " dragging" : "")
                        }
                        ref={(el) => {
                            rowRefs.current[i] = el;
                        }}
                        // Drag & drop for palette -> Steps additions (HTML5)
                        onDragOver={readOnly ? undefined : (e) => handleRowDragOver(e, i)}
                        onDrop={readOnly ? undefined : (e) => handleRowDrop(e, i)}
                    >
                        {/* Drag handle on the left edge (click and drag to reorder) */}
                        {!readOnly && (
                            <div
                                className="step-drag-handle"
                                onMouseDown={(e) => handleHandleMouseDown(i, e)}
                            >
                                ≡
                            </div>
                        )}

                        <div className="step-main">
                            <div className="step-label">
                                {(s.type === "button" || s.type === "tap") && renderButtonLabel(s.button, null)}
                                {s.type === "dpad" && `DPad ${s.dir === "CENTER" ? "●" : s.dir}`}
                                {s.type === "stick" && `${s.stick}Stick`}
                                {s.type === "sleep" && `Sleep`}
                            </div>

                            {(s.type === "button" || s.type === "tap") && (
                                <select
                                    className="form-control form-control--sm step-kind-select"
                                    value={s.type === "tap" ? "tap" : s.action}
                                    disabled={readOnly}
                                    onChange={(e) => updateButtonKind(i, e.target.value)}
                                >
                                    <option value="tap">Tap</option>
                                    <option value="down">Down</option>
                                    <option value="up">Up</option>
                                </select>
                            )}

                            {s.type === "dpad" && (
                                <select
                                    className="form-control form-control--sm step-kind-select"
                                    value={s.ms != null ? "tap" : s.dir === "CENTER" ? "center" : "hold"}
                                    disabled={readOnly}
                                    onChange={(e) => updateDpadKind(i, e.target.value)}
                                >
                                    <option value="tap">Tap</option>
                                    <option value="hold">Hold</option>
                                    <option value="center">Center</option>
                                </select>
                            )}

                            {(s.type === "sleep" || s.type === "tap" || (s.type === "dpad" && s.ms != null)) && (
                                <input
                                    type="number"
                                    value={s.ms}
                                    min={s.type === "sleep" ? "0" : "1"}
                                    disabled={readOnly}
                                    onChange={(e) =>
                                        updateSleep(i, e.target.value)
                                    }
                                    className="form-control form-control--sm step-input"
                                />
                            )}

                            {s.type === "stick" && (
                                <StepStickInput
                                    stick={s.stick}
                                    x={s.x}
                                    y={s.y}
                                    readOnly={readOnly}
                                    onChange={(nextPos) => updateStick(i, nextPos)}
                                />
                            )}
                        </div>

                        {!readOnly && (
                            <div className="step-controls">
                                <button className="btn btn--sm" onClick={() => remove(i)}>×</button>
                            </div>
                        )}
                    </div>

                    {/* An indicator *below* each row too */}
                    {!readOnly && renderDropIndicator(i + 1)}
                </React.Fragment>
            ))}

            {ghostPos && dragIndex != null && steps[dragIndex] && (
                <div
                    className="drag-ghost"
                    style={{
                        left: ghostPos.x,
                        top: ghostPos.y,
                        width: ghostPos.width,
                    }}
                >
                    <div className="step-row step-row-ghost">
                        <div className="step-drag-handle">≡</div>

                        <div className="step-main">
                            <div className="step-label">
                                {steps[dragIndex].type === "button" &&
                                    renderButtonLabel(steps[dragIndex].button, steps[dragIndex].action)}
                                {steps[dragIndex].type === "dpad" &&
                                    `DPad ${steps[dragIndex].dir}`}
                                {steps[dragIndex].type === "stick" &&
                                    `${steps[dragIndex].stick}Stick`}
                                {steps[dragIndex].type === "sleep" && `Sleep`}
                            </div>

                            {steps[dragIndex].type === "sleep" && (
                                <input
                                    type="number"
                                    value={steps[dragIndex].ms}
                                    readOnly
                                    className="form-control form-control--sm step-input"
                                />
                            )}

                            {steps[dragIndex].type === "stick" && (
                                <div className="step-stick-ghost-values">
                                    X:{steps[dragIndex].x} / Y:{steps[dragIndex].y}
                                </div>
                            )}
                        </div>

                        <div className="step-controls">
                            <button className="btn btn--sm" disabled>×</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

