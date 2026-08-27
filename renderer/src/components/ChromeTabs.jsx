
import React from "react";

export function ChromeTabs({ tabs, current, onSelect }) {
  return (
    <div className="chrome-tabs-bar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={"chrome-tab" + (current === t.id ? " active" : "")}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}
