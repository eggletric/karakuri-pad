import React from "react";
import { Procon2View } from "./Procon2View.jsx";

// Controller display for the recording modal (display only).
// It subscribes to the same event path as ControllerPad (pico-controller-input) itself,
// so mounting it is enough. It reuses the hardware-like view from the controller test.
export function MiniControllerView() {
    const [buttons, setButtons] = React.useState(() => new Set());
    const [dpad, setDpad] = React.useState("");
    const [sticks, setSticks] = React.useState({
        L: { x: 128, y: 128 },
        R: { x: 128, y: 128 },
    });

    React.useEffect(() => {
        const handle = (p) => {
            if (!p) return;
            if (p.type === "button" && p.button) {
                setButtons((prev) => {
                    const next = new Set(prev);
                    if (p.action === "down") next.add(p.button);
                    else next.delete(p.button);
                    return next;
                });
            } else if (p.type === "dpad" && p.dir) {
                setDpad(p.dir === "CENTER" || p.action === "up" ? "" : p.dir);
            } else if (p.type === "stick" && p.stick) {
                setSticks((prev) => ({
                    ...prev,
                    [p.stick]: { x: Number(p.x ?? 128), y: Number(p.y ?? 128) },
                }));
            } else if (p.type === "status" && !p.connected) {
                setButtons(new Set());
                setDpad("");
                setSticks({ L: { x: 128, y: 128 }, R: { x: 128, y: 128 } });
            }
        };
        const unsubscribe = window.pico?.onControllerInput?.(handle);
        const onWindowEvent = (event) => handle(event.detail || event);
        window.addEventListener("pico-controller-input", onWindowEvent);
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            window.removeEventListener("pico-controller-input", onWindowEvent);
        };
    }, []);

    // Procon2View also accepts dpad as a string
    return <Procon2View buttons={buttons} dpad={dpad} sticks={sticks} />;
}
