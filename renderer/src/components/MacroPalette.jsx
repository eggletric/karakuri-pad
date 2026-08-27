import React from "react";
import { useTranslation } from "react-i18next";
import { FaHome, FaCamera, FaPlus, FaMinus } from "react-icons/fa";

// One button = one chip. Dropping one creates a Tap step by default;
// switching to Down / Up is done on the step itself (MacroSteps).
export function MacroPalette({ onDragStart }) {
    const { t } = useTranslation();

    const makeItem = (key, type, payload, label) => (
        <div
            key={key}
            className="palette-item"
            draggable
            onDragStart={(e) => onDragStart(e, { type, ...payload })}
        >
            {label}
        </div>
    );

    // Buttons default to Tap(100ms). HOME / CAPTURE default to 500ms because the console
    // sometimes requires a long press.
    const tapChip = (button, label, ms = 100) =>
        makeItem(`tap-${button.toLowerCase()}`, "tap", { button, ms }, label);

    return (
        <div className="macro-palette">
            {/* The palette is drag-operated. Make it clear this differs from the click-operated record button above */}
            <div className="palette-caption">
                <span className="palette-caption-icon">⠿</span>
                {t("macro.paletteDragHint")}
            </div>

            <h3>Buttons</h3>
            <div className="palette-grid">
                {tapChip("A", "A")}
                {tapChip("B", "B")}
                {tapChip("X", "X")}
                {tapChip("Y", "Y")}
                {tapChip("L", "L")}
                {tapChip("R", "R")}
                {tapChip("ZL", "ZL")}
                {tapChip("ZR", "ZR")}
                {tapChip("PLUS", <span className="palette-icon-item"><FaPlus /></span>)}
                {tapChip("MINUS", <span className="palette-icon-item"><FaMinus /></span>)}
                {tapChip("HOME", <span className="palette-icon-item"><FaHome /></span>, 500)}
                {tapChip("CAPTURE", <span className="palette-icon-item"><FaCamera /></span>, 500)}
                {tapChip("LSTICK", "L3")}
                {tapChip("RSTICK", "R3")}
            </div>

            <h3>D-Pad</h3>
            <div className="palette-grid">
                {makeItem("dpad-up", "dpad", { dir: "UP", ms: 100 }, "↑")}
                {makeItem("dpad-down", "dpad", { dir: "DOWN", ms: 100 }, "↓")}
                {makeItem("dpad-left", "dpad", { dir: "LEFT", ms: 100 }, "←")}
                {makeItem("dpad-right", "dpad", { dir: "RIGHT", ms: 100 }, "→")}
            </div>

            <h3>Sticks</h3>
            <div className="palette-grid palette-grid--wide">
                {makeItem("stick-l", "stick", { stick: "L", x: 128, y: 128 }, "L Stick")}
                {makeItem("stick-r", "stick", { stick: "R", x: 128, y: 128 }, "R Stick")}
            </div>

            <h3>Wait</h3>
            <div className="palette-grid">
                {makeItem("sleep", "sleep", { ms: 100 }, "Sleep")}
            </div>

            <p className="palette-hint">
                {t("macro.paletteHint")}
            </p>
        </div>
    );
}
