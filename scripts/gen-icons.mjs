// Regenerates the per-OS app icons from design/icon.png (1024x1024, no margin).
//   yarn build:icons
// Output:
//   build/icon-mac.png  - rounded corners plus transparent margin, matching the Apple
//                         template (inner 824 / radius 185.4). Processed by gen-icons.swift
//   build/icon-win.png  - drawn edge to edge with a light rounding (inner 1024 /
//                         radius 102.4 = 10%). Processed by gen-icons.swift
//   build/icon.png      - for Linux (512x512). Just icon-win.png scaled down with sips
//                         (it shares the win rounding)
// The rounding uses CoreGraphics and the downscale uses sips, so this is macOS only
// (it is meant to be run on the main development machine).
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "design", "icon.png");
const dstMac = join(root, "build", "icon-mac.png");
const dstWin = join(root, "build", "icon-win.png");
const dstLinux = join(root, "build", "icon.png");

function fail(msg) {
    console.error(`gen-icons: ${msg}`);
    process.exit(1);
}

// Read the width and height from the PNG's IHDR (size validation with no dependencies)
function pngSize(path) {
    const buf = readFileSync(path);
    if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
        fail(`${path} could not be read as a PNG`);
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

if (process.platform !== "darwin") fail("macOS only (the rounding uses CoreGraphics)");

let size;
try {
    size = pngSize(src);
} catch {
    fail(`${src} is missing. Export it at 1024x1024 with no margin.`);
}
if (size.width !== 1024 || size.height !== 1024) {
    fail(`design/icon.png must be 1024x1024 (it is currently ${size.width}x${size.height})`);
}

mkdirSync(join(root, "build"), { recursive: true });

const TARGETS = [
    { label: "mac", dst: dstMac, inner: "824", radius: "185.4" },
    { label: "win", dst: dstWin, inner: "1024", radius: "102.4" },
];

for (const { label, dst, inner, radius } of TARGETS) {
    const swift = spawnSync("swift", [join(root, "scripts", "gen-icons.swift"), src, dst, inner, radius], { stdio: "inherit" });
    if (swift.status !== 0) fail(`rounding the ${label} icon failed`);
    const { width, height } = pngSize(dst);
    console.log(`gen-icons: ${label} -> ${dst} (${width}x${height})`);
}

// Linux (build/icon.png 512x512): just icon-win.png (already rounded at 1024) scaled with sips.
// electron-builder's linux.icon points at it, and deb/rpm install it under /usr/share/icons/hicolor.
const resize = spawnSync("sips", ["-s", "format", "png", "-Z", "512", dstWin, "--out", dstLinux], { stdio: ["ignore", "ignore", "inherit"] });
if (resize.status !== 0) fail(`sips resize failed: ${dstLinux}`);
{
    const s = pngSize(dstLinux);
    console.log(`gen-icons: linux -> ${dstLinux} (${s.width}x${s.height})`);
}
