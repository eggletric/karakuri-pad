// The app's i18n foundation. UI strings live in renderer/src/locales/{ja,en}.json.
// The language comes from localStorage if set, otherwise from the OS locale (en unless ja).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";
import en from "./locales/en.json";

export const LANGUAGE_STORAGE_KEY = "picoLanguage";

// The language implied by the OS locale (en unless ja)
export function systemLanguage() {
    return String(navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";
}

// The stored choice. "ja" | "en" | "system" (nothing stored = follow the system setting)
export function getLanguagePreference() {
    try {
        const saved = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
        if (saved === "ja" || saved === "en") return saved;
    } catch {
        /* treat an unusable localStorage as system */
    }
    return "system";
}

export function detectLanguage() {
    const pref = getLanguagePreference();
    return pref === "system" ? systemLanguage() : pref;
}

export function setLanguage(pref) {
    let next;
    if (pref === "system") {
        // Drop the stored value and go back to following the OS locale
        try {
            window.localStorage?.removeItem(LANGUAGE_STORAGE_KEY);
        } catch {
            /* switch anyway even if it cannot be removed */
        }
        next = systemLanguage();
    } else {
        next = pref === "ja" ? "ja" : "en";
        try {
            window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
            /* switch anyway even if it cannot be stored */
        }
    }
    i18n.changeLanguage(next);
    // Keep messages originating in the main process (connection errors etc.) in the same language
    window.pico?.setLanguage?.(next);
}

i18n.use(initReactI18next).init({
    resources: {
        ja: { translation: ja },
        en: { translation: en },
    },
    lng: detectLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
});

// Tell the main process the current language at startup too
window.pico?.setLanguage?.(i18n.language);

export default i18n;
