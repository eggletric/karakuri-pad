import { useCallback, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";

// A replacement for react-xtermjs (dropped because the LICENSE it ships is GPLv3,
// which conflicts with ours). Uses @xterm/xterm (MIT) directly and exposes the same
// { instance, ref } API.
export function useXTerm() {
    const termRef = useRef(null);
    const [instance, setInstance] = useState(null);

    // A callback ref that creates and destroys the Terminal as the DOM node comes and goes
    const ref = useCallback((node) => {
        if (node) {
            const term = new Terminal();
            term.open(node);
            termRef.current = term;
            setInstance(term);
        } else if (termRef.current) {
            termRef.current.dispose();
            termRef.current = null;
            setInstance(null);
        }
    }, []);

    return { instance, ref };
}
