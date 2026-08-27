import React, { useEffect, useState } from "react";
import { Card } from "./Card";

const MODAL_ANIMATION_MS = 220;

export function Modal({ open, onClose, title, children, footer, size }) {
    const [isVisible, setIsVisible] = useState(open);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        let timer;
        if (open) {
            setIsVisible(true);
            setIsClosing(false);
        } else if (isVisible) {
            setIsClosing(true);
            timer = setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);
            }, MODAL_ANIMATION_MS);
        }

        return () => {
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [open, isVisible]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && open) {
                onClose?.();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!isVisible) return null;

    const handleOverlayClick = () => {
        onClose?.();
    };

    return (
        <div
            className={`modal ${isClosing ? "is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={handleOverlayClick}
        >
            <div
                className={`modal__content${size === "lg" ? " modal__content--lg" : size === "md" ? " modal__content--md" : ""} ${isClosing ? "is-closing" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <Card
                    className="modal__card"
                    headerClassName="modal__card-header"
                    bodyClassName="modal__card-body"
                    footerClassName="modal__card-footer"
                    header={
                        <>
                            <h3 className="modal__title">{title}</h3>
                            {onClose && (
                                <button
                                    type="button"
                                    className="modal__close"
                                    onClick={onClose}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            )}
                        </>
                    }
                    footer={footer}
                >
                    {children}
                </Card>
            </div>
        </div>
    );
}
