// Development mock so the UI can be checked in a plain browser (disabled under Electron)
import "./devMock.js";

// Suppress web-native behaviour such as the browser's default context menu and
// middle-click autoscroll (kept in DEV, where it is useful for debugging)
// Enable the title-bar integration layout under Electron only.
// Padding differs per platform, so the platform-* classes branch on that too
if (navigator.userAgent.includes("Electron")) {
    document.documentElement.classList.add("is-electron");
    const platform = window.appInfo?.platform;
    if (platform) {
        document.documentElement.classList.add(`platform-${platform}`);
    }
}

if (import.meta.env.PROD) {
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("auxclick", (e) => {
        if (e.button === 1) e.preventDefault();
    });
}
import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n.js";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
