import React from "react";

// Application-wide notification toast.
// Can be shown from anywhere via showToast(message, level).
// Mainly used to report changes the user did not trigger, such as a disconnect.
export function showToast(message, level = "info") {
    window.dispatchEvent(
        new CustomEvent("app-toast", { detail: { message, level } })
    );
}

const TOAST_DURATION_MS = 4500;

export function ToastContainer() {
    const [toasts, setToasts] = React.useState([]);
    const idRef = React.useRef(0);

    React.useEffect(() => {
        const handler = (e) => {
            const { message, level } = e.detail || {};
            if (!message) return;
            const id = ++idRef.current;
            setToasts((prev) => [...prev, { id, message, level: level || "info" }]);
            window.setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, TOAST_DURATION_MS);
        };
        window.addEventListener("app-toast", handler);
        return () => window.removeEventListener("app-toast", handler);
    }, []);

    if (!toasts.length) return null;

    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`toast toast--${t.level}`}
                    onClick={() =>
                        setToasts((prev) => prev.filter((x) => x.id !== t.id))
                    }
                >
                    {t.message}
                </div>
            ))}
        </div>
    );
}
