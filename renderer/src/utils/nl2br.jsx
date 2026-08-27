import React from "react";

// Renders a string with its newlines turned into <br />.
// This used to depend on react-br, replaced by our own version as it lacks React 19 support.
export default function nl2br(text) {
    if (typeof text !== "string" || text.length === 0) return text;
    const lines = text.split("\n");
    return lines.flatMap((line, i) =>
        i === 0 ? [line] : [<br key={`br-${i}`} />, line]
    );
}
