
import React from "react";

export function DpadButton({ dir, label, active = false }) {
    const [isHold, setHold] = React.useState(false);
    // Whether a left-click press is in progress (guards against a mouseup missed outside the element)
    const [isLeftActive, setLeftActive] = React.useState(false);

    const sendDpad = (d) => {
        try {
            if (window.pico && window.pico.dpad) {
                window.pico.dpad(d);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const releaseLeft = () => {
        setLeftActive(false);
        // On left click, return to centre on mouse up
        sendDpad("CENTER");
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        const isRight = e.button === 2;
        if (isRight) {
            setHold(true);
            sendDpad(dir);
        } else {
            setHold(false);
            setLeftActive(true);
            sendDpad(dir);
        }
    };

    const handleMouseUp = (e) => {
        e.preventDefault();
        const isRight = e.button === 2;
        if (!isRight) {
            releaseLeft();
        }
    };

    const handleContextMenu = (e) => e.preventDefault();

    // Guards against a missed release when mouseup happens outside the element during a
    // left-click press. Uses the same approach as StickControl: a temporary window listener.
    React.useEffect(() => {
        if (!isLeftActive) return;

        const handleWindowMouseUp = (e) => {
            if (e.button !== 2) {
                releaseLeft();
            }
        };

        window.addEventListener("mouseup", handleWindowMouseUp);
        return () => {
            window.removeEventListener("mouseup", handleWindowMouseUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLeftActive]);

    return (
        <div
            className={"dpad-btn" + (isHold ? " hold" : "") + (active ? " pressed" : "")}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
        >
            {label}
        </div>
    );
}
