// The welcome + notices modal, shown automatically on first launch and reopened from the
// "About Karakuri Pad" menu item. Same interaction contract as DiffyPick's WelcomeModal:
// - The checkbox starts from the persisted "dismissed" state, so a menu reopen shows the
//   current setting; unchecking it there re-enables the auto-show on the next launch.
// - Closing by any route (button, Esc, overlay click) applies the checkbox state.
// The notices are the same three items as the LP's top page (karakuri-pad-lp: notes).
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.jsx";
// The same icon electron-builder packs (build/icon-mac.png: rounded + alpha), so the
// modal matches the OS-native app icon
import appIconUrl from "../../../build/icon-mac.png";

export function WelcomeModal({ open, onClose, initialDontShowAgain = false }) {
    const { t } = useTranslation();
    const [dontShowAgain, setDontShowAgain] = useState(initialDontShowAgain);

    // Re-sync the checkbox with the persisted state every time the modal opens
    useEffect(() => {
        if (open) setDontShowAgain(initialDontShowAgain);
    }, [open, initialDontShowAgain]);

    const handleClose = () => {
        onClose?.(dontShowAgain);
    };

    return (
        <Modal
            open={open}
            onClose={handleClose}
            footer={
                <div className="welcome-footer">
                    <label className="cfg-radio-label welcome-footer__check">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                        />
                        {t("welcome.dontShowAgain")}
                    </label>
                    <button className="btn btn--md btn-primary" onClick={handleClose}>
                        {t("welcome.getStarted")}
                    </button>
                </div>
            }
        >
            <div className="welcome-hero">
                <img
                    src={appIconUrl}
                    alt=""
                    aria-hidden="true"
                    className="welcome-hero__icon"
                />
                <div>
                    <div className="welcome-hero__title">Karakuri Pad</div>
                    <div className="welcome-hero__tagline">{t("welcome.tagline")}</div>
                </div>
            </div>

            {/* Same presentation as the LP's notes section: a plain list with round
                warning-coloured dot bullets */}
            <div className="welcome-notes">
                <h4 className="welcome-notes__heading">{t("welcome.notesHeading")}</h4>
                <ul className="welcome-notes__list">
                    <li>{t("welcome.note1")}</li>
                    <li>{t("welcome.note2")}</li>
                    <li>{t("welcome.note3")}</li>
                </ul>
            </div>
        </Modal>
    );
}
