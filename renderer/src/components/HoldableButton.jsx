import React from "react";

export function HoldableButton({ label, buttonCode, children, active = false }) {
    const [isHold, setHold] = React.useState(false);
    // Whether a left-click hold is in progress (guards against a mouseup missed outside the element)
    const [isLeftHold, setLeftHold] = React.useState(false);

    const sendDown = () => {
        try {
            if (window.pico && window.pico.buttonDown) {
                window.pico.buttonDown(buttonCode);
            }
        } catch (e) {
            console.error(e);
        }
    };
    const sendUp = () => {
        try {
            if (window.pico && window.pico.buttonUp) {
                window.pico.buttonUp(buttonCode);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const releaseLeftHold = () => {
        setHold(false);
        setLeftHold(false);
        sendUp();
    };

    const handleMouseDown = (e) => {
        if (e.button === 0) {
            // Left click: press and release sends UP
            setHold(true);
            setLeftHold(true);
            sendDown();
        } else if (e.button === 2) {
            // Right click: start holding (stays pressed)
            setHold(true);
            sendDown();
        }
    };
    const handleMouseUp = (e) => {
        if (e.button === 0) {
            // Only send UP for a left click
            releaseLeftHold();
        }
        // On right click the hold survives the release (releasing it manually needs separate UI)
    };
    const handleContextMenu = (e) => {
        e.preventDefault();
    };

    // Guards against a missed release when mouseup happens outside the element during a
    // left-click hold. Uses the same approach as StickControl: a temporary window listener.
    React.useEffect(() => {
        if (!isLeftHold) return;

        const handleWindowMouseUp = (e) => {
            if (e.button === 0) {
                releaseLeftHold();
            }
        };

        window.addEventListener("mouseup", handleWindowMouseUp);
        return () => {
            window.removeEventListener("mouseup", handleWindowMouseUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLeftHold]);

    return (
        <div
            className={"btn-circle" + (isHold ? " hold" : "") + (active ? " pressed" : "")}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
        >
            {children ?? label}
        </div>
    );
}
