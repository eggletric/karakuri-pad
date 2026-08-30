import React from "react";
import { FaHome, FaCamera, FaPlus, FaMinus } from "react-icons/fa";

// A hardware-like view of the Pro Controller 2, used by the controller test.
// Modelled on photos of the real thing: elements sit on a silhouette of the body (SVG)
// in the same relative positions as on the hardware:
//   left stick=top left / ABXY=top right / D-Pad=lower left / right stick=lower right /
//   -,+=top centre / capture and HOME below them / C=between the D-Pad and the right stick /
//   ZL,L / R,ZR=arcs following the top-left and top-right edges of the body /
//   GL,GR=grip backs (dashed)
// The coordinate system is a fixed 440x300.
// buttons: a Set of Pro Controller button codes / dpad: a Set of directions /
// sticks: { L: {x, y}, R: {x, y} } (0-255, centre 128, y positive downwards)
//
// Passing `selectable` (a Set of codes) turns the view into a picker: those elements
// become clickable and call onToggle(code), everything else dims. The picker reuses
// `buttons`/`dpad` for the highlight on purpose, so a chosen button lights up exactly
// the way it will once the paddle is actually pressed.

const W = 440;
const H = 300;

// Builds the class suffix and DOM props for one element in picker mode.
// Returns nothing outside picker mode, so the display-only render is untouched.
function pickProps(picker, code) {
    if (!picker) return { cls: "", props: {} };
    if (!picker.selectable.has(code)) return { cls: " is-locked", props: {} };
    const fire = () => picker.onToggle?.(code);
    return {
        cls: " is-pick",
        props: {
            role: "button",
            tabIndex: 0,
            "aria-pressed": picker.isOn(code),
            "aria-label": code,
            onClick: (e) => { e.stopPropagation(); fire(); },
            onKeyDown: (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
            },
        },
    };
}

// Buttons positioned by their centre. square is capture, paddle is a back paddle (dashed)
function Btn({ x, y, w = 27, h = 27, shape = "round", label, on, rotate = 0, picker, code }) {
    // Text labels sit visually low by the font's baseline, so apply an optical correction
    // (icons are fine as they are)
    const content = typeof label === "string"
        ? <span className="p2v-btn__text">{label}</span>
        : label;
    const { cls, props } = pickProps(picker, code);
    return (
        <span
            className={`p2v-el p2v-btn p2v-btn--${shape}${on ? " is-on" : ""}${cls}`}
            style={{
                left: x,
                top: y,
                width: w,
                height: h,
                // The rotation goes here too, since it overrides .p2v-el's centring transform
                ...(rotate ? { transform: `translate(-50%, -50%) rotate(${rotate}deg)` } : {}),
            }}
            {...props}
        >
            {content}
        </span>
    );
}

function Stick({ x, y, pos, pressed, picker, code }) {
    const size = 62;
    const thumb = 36;
    const radius = (size - thumb) / 2 + 5;
    const ox = ((pos.x - 128) / 127) * radius;
    const oy = ((pos.y - 128) / 127) * radius;
    const { cls, props } = pickProps(picker, code);
    return (
        <span
            className={`p2v-el p2v-stick${pressed ? " is-on" : ""}${cls}`}
            style={{ left: x, top: y, width: size, height: size }}
            {...props}
        >
            <span
                className="p2v-stick__thumb"
                style={{
                    width: thumb,
                    height: thumb,
                    transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
                }}
            />
        </span>
    );
}

// The D-Pad. A centre plus four arms make the same cross shape as the hardware
function Dpad({ x, y, dirs, picker }) {
    const arm = (dir) => {
        const { cls, props } = pickProps(picker, dir);
        return {
            className: `p2v-dpad__arm p2v-dpad__arm--${dir.toLowerCase()}${dirs.has(dir) ? " is-on" : ""}${cls}`,
            ...props,
        };
    };
    return (
        <span className="p2v-el p2v-dpad" style={{ left: x, top: y, width: 57, height: 57 }}>
            <span {...arm("UP")}>▲</span>
            <span {...arm("LEFT")}>◀</span>
            <span className="p2v-dpad__center" />
            <span {...arm("RIGHT")}>▶</span>
            <span {...arm("DOWN")}>▼</span>
        </span>
    );
}

// Back paddles (GL/GR). The outer end bulges vertically and tapers towards the inside.
// The paddle shape is dashed to convey that it is on the back
function Paddle({ d, lx, ly, label, on, picker }) {
    const { cls, props } = pickProps(picker, label);
    return (
        <g className={`p2v-hit${cls}`} {...props}>
            <path className={`p2v-paddle${on ? " is-on" : ""}`} d={d} />
            <text className={`p2v-shoulder-label${on ? " is-on" : ""}`} x={lx} y={ly}>
                {label}
            </text>
        </g>
    );
}

// Shoulder buttons: arcs following the top corners of the body. Drawn as two paths, an outline plus a band
function Shoulder({ d, w, label, lx, ly, on, picker }) {
    const { cls, props } = pickProps(picker, label);
    return (
        <g className={`p2v-hit${cls}`} {...props}>
            <path className={`p2v-shoulder-border${on ? " is-on" : ""}`} d={d} strokeWidth={w + 2.5} />
            <path className="p2v-shoulder-fill" d={d} strokeWidth={w} />
            <text className={`p2v-shoulder-label${on ? " is-on" : ""}`} x={lx} y={ly}>
                {label}
            </text>
        </g>
    );
}

export function Procon2View({ buttons, dpad, sticks, selectable, onToggle }) {
    const on = (code) => buttons.has(code);
    const dirs = dpad instanceof Set ? dpad : new Set(dpad ? [dpad] : []);
    // One object shared by every element, so an ordinary render allocates nothing extra
    const picker = selectable instanceof Set
        ? { selectable, onToggle, isOn: (code) => (dirs.has(code) ? true : on(code)) }
        : null;

    return (
        <div className={`p2v${picker ? " p2v--picker" : ""}`} style={{ width: W, height: H }}>
            {/* aria-hidden only while the SVG is decoration; in picker mode it holds controls */}
            <svg className="p2v__body" viewBox={`0 0 ${W} ${H}`} aria-hidden={picker ? undefined : "true"}>
                {/* Body: a shallow top edge, thick grips flaring outwards, and a raised centre bottom */}
                <path
                    className="p2v__shell"
                    d="M220,44
                       C266,44 300,46 321,48
                       C354,53 379,73 389,112
                       C396,160 402,209 409,258
                       C412,275 407,288 393,293
                       C381,299 363,293 353,276
                       L325,212
                       L115,212
                       L87,276
                       C77,293 59,299 47,293
                       C33,288 28,275 31,258
                       C38,209 44,160 51,112
                       C61,73 86,53 119,48
                       C140,46 174,44 220,44 Z"
                />
                {/* Shoulder buttons: two rows following the top-left and top-right edges.
                    ZL/ZR at the back are short, thick triggers; L/R at the front are long, thin bumpers */}
                <Shoulder d="M127,24 C108,26 91,32 76,40" w={20} label="ZL" lx={101.5} ly={30} on={on("ZL")} picker={picker} />
                <Shoulder d="M141,40 C119,41 94,48 71,64" w={14} label="L" lx={105.5} ly={48} on={on("L")} picker={picker} />
                <Shoulder d="M313,24 C332,26 349,32 364,40" w={20} label="ZR" lx={339.5} ly={30} on={on("ZR")} picker={picker} />
                <Shoulder d="M299,40 C321,41 346,48 369,64" w={14} label="R" lx={335.5} ly={48} on={on("R")} picker={picker} />
                {/* Back paddles: at the inner base of each grip, tilted so the outer end sits higher */}
                <Paddle
                    d="M106,204 C93,199 79,191 68,185 C56,182 50,198 61,207 C73,215 90,216 102,216 C108,214 109,208 106,204 Z"
                    label="GL" lx={80.5} ly={204} on={on("GL")} picker={picker}
                />
                <Paddle
                    d="M334,204 C347,199 361,191 372,185 C384,182 390,198 379,207 C367,215 350,216 338,216 C332,214 331,208 334,204 Z"
                    label="GR" lx={360.5} ly={204} on={on("GR")} picker={picker}
                />
            </svg>

            {/* Top centre: -,+ with capture and HOME below them (the second row is narrower than the first) */}
            <Btn x={183} y={70} w={18} h={18} label={<FaMinus />} on={on("MINUS")} picker={picker} code="MINUS" />
            <Btn x={257} y={70} w={18} h={18} label={<FaPlus />} on={on("PLUS")} picker={picker} code="PLUS" />
            <Btn x={196} y={103} w={17} h={17} shape="square" label={<FaCamera />} on={on("CAPTURE")} picker={picker} code="CAPTURE" />
            <Btn x={244} y={103} w={19} h={19} label={<FaHome />} on={on("HOME")} picker={picker} code="HOME" />

            {/* Left stick (top left) and ABXY (the diamond at the top right) */}
            <Stick x={106} y={112} pos={sticks.L} pressed={on("LSTICK")} picker={picker} code="LSTICK" />
            <Btn x={332} y={84} label="X" on={on("X")} picker={picker} code="X" />
            <Btn x={304} y={112} label="Y" on={on("Y")} picker={picker} code="Y" />
            <Btn x={360} y={112} label="A" on={on("A")} picker={picker} code="A" />
            <Btn x={332} y={140} label="B" on={on("B")} picker={picker} code="B" />

            {/* Bottom row: D-Pad / C (between the D-Pad and the right stick) / right stick */}
            <Dpad x={165} y={162} dirs={dirs} picker={picker} />
            <Btn x={220} y={190} w={18} h={18} label="C" on={on("C")} picker={picker} code="C" />
            <Stick x={275} y={162} pos={sticks.R} pressed={on("RSTICK")} picker={picker} code="RSTICK" />

        </div>
    );
}
