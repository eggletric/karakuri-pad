// Converts a step array into firmware command lines.
// A line is capped at 24 characters on the firmware side; never emit anything longer.
export function compileMacroToLines(steps) {
    if (!Array.isArray(steps)) return [];
    const out = [];
    for (const s of steps) {
        switch (s.type) {
            case "button":
                if (s.action === "down") out.push(`BTN ${s.button} DOWN`);
                else if (s.action === "up") out.push(`BTN ${s.button} UP`);
                break;
            case "tap": {
                // Press and release <ms> later. Collapses DOWN / SLEEP / UP into a single step.
                const ms = Math.max(1, Math.min(60000, Number(s.ms) || 0));
                out.push(`TAP ${s.button} ${ms}`);
                break;
            }
            case "dpad":
                if (s.ms != null) {
                    // Tap: hold for the given ms and let the firmware return to neutral automatically
                    const ms = Math.max(1, Math.min(60000, Number(s.ms) || 0));
                    out.push(`DTAP ${s.dir} ${ms}`);
                } else if (s.action === "up" || s.dir === "CENTER") {
                    // Explicitly back to neutral
                    out.push("DPAD CENTER");
                } else {
                    // Hold: stays applied (a CENTER step is needed to undo it)
                    out.push(`DPAD ${s.dir}`);
                }
                break;
            case "stick":
                out.push(`${s.stick.toUpperCase()}STICK ${s.x} ${s.y}`);
                break;
            case "sleep": {
                // Clamp to the same range here too, so a SLEEP NaN never reaches the firmware
                const ms = Math.max(1, Math.min(60000, Number(s.ms) || 0));
                out.push(`SLEEP ${ms}`);
                break;
            }
            default:
                break;
        }
    }
    return out;
}
