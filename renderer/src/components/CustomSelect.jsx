import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A simple custom select component
 * - Styled after a Material-UI style modal menu
 * - Works without any dependencies
 */
export function CustomSelect({
    options = [],
    value,
    onChange,
    placeholder,
    dense = false,
    dropUp = false,   // open the menu upwards instead of down (for selects near the bottom)
    className = "",
    disabled = false,
    renderLabel,
    "aria-label": ariaLabel,
    style
}) {
    const { t } = useTranslation();
    const effectivePlaceholder = placeholder ?? t("select.placeholder");
    const [open, setOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const containerRef = useRef(null);

    const normalizedOptions = useMemo(
        () =>
            options.map((opt, idx) => {
                if (typeof opt === "string") {
                    return { value: opt, label: opt };
                }

                if (opt && typeof opt === "object" && (opt.type === "divider" || opt.divider)) {
                    return {
                        ...opt,
                        isDivider: true,
                        key: opt.key ?? `divider-${idx}`,
                    };
                }

                return opt;
            }),
        [options]
    );

    const selectedOption =
        normalizedOptions.find((o) => !o?.isDivider && o.value === value) || null;

    const findNextSelectableIndex = (startIdx, step) => {
        let idx = startIdx;
        while (idx >= 0 && idx < normalizedOptions.length) {
            const candidate = normalizedOptions[idx];
            if (!candidate?.isDivider) return idx;
            idx += step;
        }
        return -1;
    };

    const handleSelect = (option) => {
        if (disabled || option?.isDivider) return;
        onChange?.(option.value, option);
        setOpen(false);
    };

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (e) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        const handleEscape = (e) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (normalizedOptions.length === 0) {
            setHighlightIndex(-1);
            return;
        }

        const idx = normalizedOptions.findIndex((opt) => !opt?.isDivider && opt.value === value);
        const fallback = findNextSelectableIndex(0, 1);
        setHighlightIndex(idx >= 0 ? idx : fallback);
    }, [open, normalizedOptions, value]);

    const moveHighlight = (delta) => {
        if (!open || normalizedOptions.length === 0) return;
        setHighlightIndex((prev) => {
            const start = prev === -1 ? (delta > 0 ? 0 : normalizedOptions.length - 1) : prev + delta;
            const step = delta >= 0 ? 1 : -1;
            const next = findNextSelectableIndex(start, step);
            return next;
        });
    };

    const handleKeyDown = (e) => {
        if (disabled) return;
        if (!open) {
            if (["ArrowDown", "Enter", " "].includes(e.key)) {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            moveHighlight(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveHighlight(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const opt = normalizedOptions[highlightIndex];
            if (opt && !opt.isDivider) handleSelect(opt);
        }
    };

    const controlClass = [
        "custom-select__control",
        dense ? "custom-select__control--sm" : "custom-select__control--md",
        open ? "is-open" : "",
        disabled ? "is-disabled" : "",
    ]
        .filter(Boolean)
        .join(" ");

    const rootClass = ["custom-select", dropUp ? "custom-select--up" : "", className]
        .filter(Boolean)
        .join(" ");

    const renderOptionLabel = (opt) => renderLabel?.(opt) || opt.label;

    return (
        <div
            className={rootClass}
            ref={containerRef}
            data-open={open}
            onKeyDown={handleKeyDown}
            style={style}
        >
            <button
                type="button"
                className={controlClass}
                onClick={() => !disabled && setOpen((prev) => !prev)}
                aria-label={ariaLabel}
                aria-expanded={open}
                disabled={disabled}
            >
                <span className="custom-select__value">
                    {selectedOption ? (
                        <span className="custom-select__value-content">
                            {selectedOption.icon && (
                                <span className="custom-select__option-icon" aria-hidden>
                                    {selectedOption.icon}
                                </span>
                            )}
                            <span className="custom-select__option-label">
                                {renderOptionLabel(selectedOption)}
                            </span>
                        </span>
                    ) : (
                        // The parent is a flex container, so wrap the label in a span to make ellipsis work
                        <span className="custom-select__option-label">{effectivePlaceholder}</span>
                    )}
                </span>
                <span className="custom-select__icon" aria-hidden>
                    ▾
                </span>
            </button>

            {open && (
                <div className="custom-select__menu" role="listbox">
                    {normalizedOptions.length === 0 && (
                        <div className="custom-select__option custom-select__option--empty">
                            {t("select.noOptions")}
                        </div>
                    )}
                    {normalizedOptions.map((opt, idx) => {
                        if (opt?.isDivider) {
                            return <div key={opt.key ?? idx} className="custom-select__divider" role="separator" />;
                        }

                        const isSelected = opt.value === value;
                        const isHighlighted = idx === highlightIndex;
                        const optionClass = [
                            "custom-select__option",
                            isSelected ? "is-selected" : "",
                            isHighlighted ? "is-highlighted" : "",
                        ]
                            .filter(Boolean)
                            .join(" ");

                        return (
                            <div
                                key={opt.value ?? idx}
                                className={optionClass}
                                role="option"
                                aria-selected={isSelected}
                                onMouseEnter={() => setHighlightIndex(idx)}
                                onClick={() => handleSelect(opt)}
                            >
                                <span className="custom-select__option-content">
                                    {opt.icon && (
                                        <span className="custom-select__option-icon" aria-hidden>
                                            {opt.icon}
                                        </span>
                                    )}
                                    <span className="custom-select__option-label">
                                        {renderOptionLabel(opt)}
                                    </span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default CustomSelect;
