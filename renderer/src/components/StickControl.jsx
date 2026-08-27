
import React from "react";
import { HoldableButton } from "./HoldableButton.jsx";

export function StickControl({ label, stick, extPos = null, pressActive = false }) {
    const [pos, setPos] = React.useState({ x: 128, y: 128 });
    const [isDragging, setDragging] = React.useState(false);
    const [isHold, setHold] = React.useState(false);

    const padRef = React.useRef(null);
    const thumbSize = 40;
    const padSize = 160;
    const radius = 60;

    const sendStick = (nx, ny) => {
        try {
            if (window.pico && window.pico.stick) {
                window.pico.stick(stick, nx, ny);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const setFromClientPos = React.useCallback(
        (clientX, clientY, holdMode) => {
            const rect = padRef.current.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const dx = clientX - cx;
            const dy = clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const clamped = Math.min(dist, radius);

            const rx = (dx / dist) * clamped;
            const ry = (dy / dist) * clamped;

            const nx = Math.round((rx / radius) * 127) + 128;
            const ny = Math.round((ry / radius) * 127) + 128;

            setPos({ x: nx, y: ny });
            sendStick(nx, ny);
            setHold(holdMode);
        },
        [radius]
    );

    const handleMouseDown = (e) => {
        e.preventDefault();
        if (!padRef.current) return;
        const isRight = e.button === 2;
        setDragging(true);
        setFromClientPos(e.clientX, e.clientY, isRight);
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        if (!padRef.current) return;
        const isRight = e.buttons === 2;
        setFromClientPos(e.clientX, e.clientY, isRight);
    };

    const centerStick = () => {
        setPos({ x: 128, y: 128 });
        sendStick(128, 128);
        setHold(false);
    };

    const handleMouseUp = (e) => {
        if (!isDragging) return;
        setDragging(false);
        // Return to centre if this was a left drag
        if (e.button === 0 && !isHold) {
            centerStick();
        }
    };


    React.useEffect(() => {
        if (!isDragging) return;

        const handleWindowMouseMove = (e) => {
            if (!padRef.current) return;
            const isRight = e.buttons === 2;
            setFromClientPos(e.clientX, e.clientY, isRight);
        };

        const handleWindowMouseUp = (e) => {
            setDragging(false);
            if (e.button === 0 && !isHold) {
                centerStick();
            }
        };

        window.addEventListener("mousemove", handleWindowMouseMove);
        window.addEventListener("mouseup", handleWindowMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleWindowMouseMove);
            window.removeEventListener("mouseup", handleWindowMouseUp);
        };
    }, [isDragging, isHold, setFromClientPos]);

    // Values from the physical controller go straight to the display unless the UI is being used
    const useExt = extPos && !isDragging && !isHold;
    const shown = useExt ? extPos : pos;
    // Only highlight in green while actually tilted (do not light up at neutral)
    const extActive = useExt && (extPos.x !== 128 || extPos.y !== 128);
    const offsetX = ((shown.x - 128) / 127) * radius;
    const offsetY = ((shown.y - 128) / 127) * radius;

    // The L stick puts its click button in the bottom-right corner, the R stick in the bottom-left
    const corner = stick === "L" ? "stick-corner--right" : "stick-corner--left";

    return (
        <div className="controller-card stick-card">
            <div className="card-title">{label}</div>
            <div
                className="stick-area"
                ref={padRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div
                    className={"stick-thumb" + (isHold ? " hold" : "") + (extActive ? " pressed" : "")}
                    style={{
                        left: padSize / 2 + offsetX - thumbSize / 2,
                        top: padSize / 2 + offsetY - thumbSize / 2
                    }}
                />
            </div>
            <div className="stick-coords">
                ({shown.x}, {shown.y}) {isHold ? "HOLD" : ""}
            </div>

            {/* Stick click (L3 / R3) */}
            <div className={"stick-corner " + corner}>
                <HoldableButton
                    label={stick === "L" ? "L3" : "R3"}
                    buttonCode={stick === "L" ? "LSTICK" : "RSTICK"}
                    active={pressActive}
                />
            </div>
        </div>
    );
}
