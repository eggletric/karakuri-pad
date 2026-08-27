import React from "react";
import { FaHome, FaCamera, FaPlus, FaMinus } from "react-icons/fa";
import { StickControl } from "./StickControl.jsx";
import { HoldableButton } from "./HoldableButton.jsx";
import { DpadButton } from "./DpadButton.jsx";
import { CapturePreview } from "./CapturePreview.jsx";
import { PassthroughPanel } from "./PassthroughPanel.jsx";

export function ControllerPad() {
    // Reflect the state of the physical controller (the Pro Controller / Pro Controller 2
    // being passed through or recorded) onto the on-screen buttons and sticks
    const [extButtons, setExtButtons] = React.useState(() => new Set());
    const [extDpad, setExtDpad] = React.useState("");
    const [extSticks, setExtSticks] = React.useState({
        L: { x: 128, y: 128 },
        R: { x: 128, y: 128 },
    });

    React.useEffect(() => {
        const handle = (p) => {
            if (!p) return;
            if (p.type === "button" && p.button) {
                setExtButtons((prev) => {
                    const next = new Set(prev);
                    if (p.action === "down") next.add(p.button);
                    else next.delete(p.button);
                    return next;
                });
            } else if (p.type === "dpad" && p.dir) {
                setExtDpad(p.dir === "CENTER" || p.action === "up" ? "" : p.dir);
            } else if (p.type === "stick" && p.stick) {
                setExtSticks((prev) => ({
                    ...prev,
                    [p.stick]: { x: Number(p.x ?? 128), y: Number(p.y ?? 128) },
                }));
            } else if (p.type === "status" && !p.connected) {
                // Reset the display once the controller goes away
                setExtButtons(new Set());
                setExtDpad("");
                setExtSticks({ L: { x: 128, y: 128 }, R: { x: 128, y: 128 } });
            }
        };
        const unsubscribe = window.pico?.onControllerInput?.(handle);
        // For browser testing (same window-event path as MacroEditor)
        const onWindowEvent = (event) => handle(event.detail || event);
        window.addEventListener("pico-controller-input", onWindowEvent);
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            window.removeEventListener("pico-controller-input", onWindowEvent);
        };
    }, []);

    const pressed = (code) => extButtons.has(code);

    return (
        <div className="controller-root">

            {/* Left column */}
            <div className="controller-column">
                <div className="controller-card">
                    <div className="shoulder-row">
                        <HoldableButton label="ZL" buttonCode="ZL" active={pressed("ZL")} />
                        <HoldableButton label="L" buttonCode="L" active={pressed("L")} />
                    </div>
                </div>

                <StickControl label="Left Stick" stick="L" extPos={extSticks.L} pressActive={pressed("LSTICK")} />

                <div className="controller-card">
                    <div className="dpad-container">
                        <div className="dpad-grid">
                            <div></div>
                            <DpadButton dir="UP" label="▲" active={extDpad === "UP"} />
                            <div></div>

                            <DpadButton dir="LEFT" label="◀" active={extDpad === "LEFT"} />
                            <div></div>
                            <DpadButton dir="RIGHT" label="▶" active={extDpad === "RIGHT"} />

                            <div></div>
                            <DpadButton dir="DOWN" label="▼" active={extDpad === "DOWN"} />
                            <div></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Middle column */}
            <div className="controller-column controller-column--center">
                <CapturePreview />
                <div className="controller-card center">
                    <div className="center-buttons-row">
                        <HoldableButton buttonCode="MINUS" active={pressed("MINUS")} >
                            <FaMinus />
                        </HoldableButton>
                        <HoldableButton buttonCode="CAPTURE" active={pressed("CAPTURE")}>
                            <FaCamera />
                        </HoldableButton>
                        <HoldableButton buttonCode="HOME" active={pressed("HOME")}>
                            <FaHome />
                        </HoldableButton>
                        <HoldableButton buttonCode="PLUS" active={pressed("PLUS")} >
                            <FaPlus />
                        </HoldableButton>
                    </div>
                </div>

                <PassthroughPanel />
            </div>

            {/* Right column */}
            <div className="controller-column">
                <div className="controller-card">
                    <div className="shoulder-row">
                        <HoldableButton label="R" buttonCode="R" active={pressed("R")} />
                        <HoldableButton label="ZR" buttonCode="ZR" active={pressed("ZR")} />
                    </div>
                </div>

                <div className="controller-card">
                    <div className="face-buttons-container">
                        <div className="face-buttons">
                            <div></div>
                            <HoldableButton label="X" buttonCode="X" active={pressed("X")} />
                            <div></div>

                            <HoldableButton label="Y" buttonCode="Y" active={pressed("Y")} />
                            <div></div>
                            <HoldableButton label="A" buttonCode="A" active={pressed("A")} />

                            <div></div>
                            <HoldableButton label="B" buttonCode="B" active={pressed("B")} />
                            <div></div>
                        </div>
                    </div>
                </div>

                <StickControl label="Right Stick" stick="R" extPos={extSticks.R} pressActive={pressed("RSTICK")} />
            </div>

        </div>
    );
}
