import React from "react";
import i18n from "../i18n.js";

// Last line of defence: keeps an unexpected exception in the renderer from leaving a
// white screen (i.e. a state that needs an app restart) and offers a reload in place.
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error("[ErrorBoundary]", error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="error-boundary">
                <div className="error-boundary__card">
                    <div className="error-boundary__title">{i18n.t("errorBoundary.title")}</div>
                    <div className="error-boundary__message">
                        {String(this.state.error?.message || this.state.error)}
                    </div>
                    <button
                        className="btn btn--md btn-primary"
                        onClick={() => window.location.reload()}
                    >
                        {i18n.t("errorBoundary.reload")}
                    </button>
                </div>
            </div>
        );
    }
}
