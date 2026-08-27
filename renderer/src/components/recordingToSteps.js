// Converts recorded raw events (a step plus its arrival time `at`) into a macro step list.
//
//  1. A "down -> up of the same button" with nothing in between collapses into one TAP step
//  2. The gaps between events become SLEEP steps
//
// The firmware consumes the interval given to MACRO LOAD (100ms by default) for every step,
// and only a SLEEP line consumes its own ms instead of that interval. A TAP is
// "interval + hold time". What goes into a SLEEP here is the remainder after subtracting that.

export const MACRO_INTERVAL_MS = 100;
const MIN_SLEEP_MS = 10;   // The firmware's minimum interval. Anything below it is discarded as noise

export function buildStepsFromRecording(recorded) {
    if (!Array.isArray(recorded) || recorded.length === 0) return [];

    const records = recorded.map((r) => {
        const { at, ...step } = r || {};
        return { at: Number.isFinite(at) ? at : 0, step };
    });

    // ---- 1) collapse down -> up into a TAP ----
    const merged = [];
    const consumedIndex = new Set();

    for (let i = 0; i < records.length; i++) {
        if (consumedIndex.has(i)) continue;

        const cur = records[i];
        const next = records[i + 1];

        const isTappable =
            cur.step.type === "button" &&
            cur.step.action === "down" &&
            next &&
            !consumedIndex.has(i + 1) &&
            next.step.type === "button" &&
            next.step.action === "up" &&
            next.step.button === cur.step.button;

        if (isTappable) {
            const ms = Math.max(1, Math.min(60000, Math.round(next.at - cur.at)));
            consumedIndex.add(i + 1);
            merged.push({
                at: cur.at,
                step: { type: "tap", button: cur.step.button, ms },
            });
            continue;
        }

        // "Press -> neutral" on the D-Pad also collapses into a single Tap step
        const isDpadTappable =
            cur.step.type === "dpad" &&
            cur.step.action === "down" &&
            cur.step.dir !== "CENTER" &&
            next &&
            !consumedIndex.has(i + 1) &&
            next.step.type === "dpad" &&
            (next.step.dir === "CENTER" || next.step.action === "up");

        if (isDpadTappable) {
            const ms = Math.max(1, Math.min(60000, Math.round(next.at - cur.at)));
            consumedIndex.add(i + 1);
            merged.push({
                at: cur.at,
                step: { type: "dpad", dir: cur.step.dir, ms },
            });
            continue;
        }

        merged.push({ at: cur.at, step: cur.step });
    }

    // ---- 2) turn the gaps into SLEEPs ----
    const out = [];
    for (let i = 0; i < merged.length; i++) {
        const cur = merged[i];
        out.push(cur.step);

        const next = merged[i + 1];
        if (!next) break;

        const consumed = MACRO_INTERVAL_MS +
            (cur.step.type === "tap" || (cur.step.type === "dpad" && cur.step.ms != null) ? cur.step.ms : 0);
        const extra = Math.round(next.at - cur.at) - consumed;
        if (extra >= MIN_SLEEP_MS) {
            out.push({ type: "sleep", ms: extra });
        }
    }

    return out;
}
