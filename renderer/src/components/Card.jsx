import React from "react";

function classNames(...classes) {
    return classes.filter(Boolean).join(" ");
}

export function Card({
    title,
    header,
    footer,
    children,
    className,
    headerClassName,
    bodyClassName,
    footerClassName,
    headerStyle,
    bodyStyle,
    footerStyle,
}) {
    const headerContent = header ?? title;

    return (
        <div className={classNames("card config-card", className)}>
            {headerContent && (
                <div className={classNames("card-header", headerClassName)} style={headerStyle}>
                    {headerContent}
                </div>
            )}
            <div className={classNames("card-body", bodyClassName)} style={bodyStyle}>
                {children}
            </div>
            {footer && (
                <div className={classNames("card-footer", footerClassName)} style={footerStyle}>
                    {footer}
                </div>
            )}
        </div>
    );
}
