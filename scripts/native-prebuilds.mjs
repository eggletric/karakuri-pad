#!/usr/bin/env node
// Preserves the compiled .node files of the native dependencies, so a build can still be
// produced if compiling them ever stops working (a new SDK, a new C++ standard, node-gyp
// breaking, or the package going unmaintained).
//
//   node scripts/native-prebuilds.mjs collect [--tuple <platform-arch>]
//   node scripts/native-prebuilds.mjs restore
//
// collect picks up whatever is built in node_modules right now and files it under the host's
// platform-arch. Pass --tuple when the build products are for another arch than the host — for
// instance after `electron-builder install-app-deps --arch=x64` on an Apple Silicon machine,
// which leaves x64 binaries behind (`--tuple darwin-x64`).
//
// Everything here is N-API, so the files stay valid across Electron upgrades and only need
// regenerating when the package itself is updated.
//
// What actually needs preserving:
//   - @stoprocent/noble and @stoprocent/bluetooth-hci-socket ship prebuilds for every arch
//     except win32-arm64, so that one arch still compiles from source. Collecting the others
//     costs little and keeps the tree uniform, so no arch is special-cased.
//   - node-hid fetches its prebuilds at install time (prebuild-install) rather than shipping
//     them, so a copy is kept for every arch.
//   - @serialport/bindings-cpp is deliberately absent: it ships prebuilds for every platform
//     in its own tarball, so there is nothing to preserve.
//
// Two resolution styles are covered, because the packages do not agree on one:
//   - "prebuilds": node-gyp-build looks in prebuilds/<platform>-<arch>/ and falls back to it
//     automatically when build/ is missing (the @stoprocent packages)
//   - "build": the file is required from build/Release/ directly, so it is restored straight
//     back there (node-hid, via the `bindings` package)
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "native-prebuilds");
const NODE_MODULES = join(ROOT, "node_modules");
const tupleArgIndex = process.argv.indexOf("--tuple");
const TUPLE = tupleArgIndex > -1 ? process.argv[tupleArgIndex + 1] : `${process.platform}-${process.arch}`;
if (!/^[a-z0-9]+-[a-z0-9]+$/.test(TUPLE)) {
    console.error(`invalid tuple: ${TUPLE}`);
    process.exit(1);
}

const TARGETS = [
    { dir: "@stoprocent/noble", style: "prebuilds", files: { "build/Release/noble.node": "node.napi.node" } },
    // Linux, and Windows older than 10.0.15063 (newer Windows uses noble's WinRT binding instead).
    { dir: "@stoprocent/bluetooth-hci-socket", style: "prebuilds", files: { "build/Release/bluetooth_hci_socket.node": "node.napi.node" } },
    // Linux may carry a hidraw variant alongside the libusb one.
    { dir: "node-hid", style: "build", files: { "build/Release/HID.node": "HID.node", "build/Release/HID_hidraw.node": "HID_hidraw.node" } },
];

const vendorDir = (t) => join(VENDOR, t.dir, t.style === "prebuilds" ? "prebuilds" : "build-release", TUPLE);

// Whether a tuple is already covered by the prebuilds a package ships. Directory names follow
// node-gyp-build's convention, where one directory may serve several arches: "darwin-x64+arm64".
function shippedCovers(dir, tuple) {
    const shipped = join(NODE_MODULES, dir, "prebuilds");
    if (!existsSync(shipped)) return false;
    const [platform, arch] = tuple.split("-");
    return readdirSync(shipped).some((name) => {
        const [p, ...rest] = name.split("-");
        return p === platform && rest.join("-").split("+").includes(arch);
    });
}
const restoreDir = (t, tuple) =>
    t.style === "prebuilds"
        ? join(NODE_MODULES, t.dir, "prebuilds", tuple)
        : join(NODE_MODULES, t.dir, "build", "Release");

function copyInto(src, dstDir, dstName) {
    mkdirSync(dstDir, { recursive: true });
    copyFileSync(src, join(dstDir, dstName));
}

function collect() {
    let found = 0;
    for (const t of TARGETS) {
        if (!existsSync(join(NODE_MODULES, t.dir))) {
            console.log(`  skip ${t.dir} (not installed on ${TUPLE})`);
            continue;
        }

        // A package that ships its own prebuilds carries every arch in the tarball, so mirroring
        // that directory preserves all of them from one machine. Android is dropped: it is never
        // a target here.
        const shipped = join(NODE_MODULES, t.dir, "prebuilds");
        if (t.style === "prebuilds" && existsSync(shipped)) {
            for (const tuple of readdirSync(shipped)) {
                if (tuple.startsWith("android-")) continue;
                const from = join(shipped, tuple);
                if (!statSync(from).isDirectory()) continue;
                for (const file of readdirSync(from)) {
                    copyInto(join(from, file), join(VENDOR, t.dir, "prebuilds", tuple), file);
                    found++;
                }
                console.log(`  kept ${t.dir} prebuilds/${tuple} (shipped)`);
            }
        }

        // Anything compiled locally. Skipped when the shipped prebuilds already cover this arch,
        // otherwise a restore would plant a file that the next collect picks straight back up.
        // On an arch with no shipped prebuild (win32-arm64) this is the only copy there is.
        if (t.style === "prebuilds" && shippedCovers(t.dir, TUPLE)) continue;
        for (const [built, as] of Object.entries(t.files)) {
            const src = join(NODE_MODULES, t.dir, built);
            if (!existsSync(src)) continue;
            copyInto(src, vendorDir(t), as);
            console.log(`  kept ${t.dir} ${as} (${(statSync(src).size / 1024).toFixed(0)} KB) built for ${TUPLE}`);
            found++;
        }
    }
    if (found === 0) {
        console.error(`collect: nothing found for ${TUPLE}`);
        process.exit(1);
    }
}

function restore() {
    if (!existsSync(VENDOR)) {
        console.error(`restore: ${VENDOR} does not exist - collect on each platform first`);
        process.exit(1);
    }
    let restored = 0;
    for (const t of TARGETS) {
        const base = join(VENDOR, t.dir, t.style === "prebuilds" ? "prebuilds" : "build-release");
        if (!existsSync(base) || !existsSync(join(NODE_MODULES, t.dir))) continue;
        for (const tuple of readdirSync(base)) {
            const from = join(base, tuple);
            if (!statSync(from).isDirectory()) continue;
            // A "build" style package can only ever use the current platform's file, so skip the rest
            if (t.style === "build" && tuple !== TUPLE) continue;
            // Restore only this platform's tuples, so packaging never carries another OS's
            // binaries. Both arches of the host platform are kept: an Apple Silicon machine
            // still builds the x64 package.
            if (t.style === "prebuilds" && !tuple.startsWith(`${process.platform}-`)) continue;
            for (const file of readdirSync(from)) {
                copyInto(join(from, file), restoreDir(t, tuple), file);
                console.log(`  restored ${t.dir} ${file} (${tuple})`);
                restored++;
            }
        }
    }
    if (restored === 0) console.log("  nothing to restore");
}

const cmd = process.argv[2];
if (cmd === "collect") collect();
else if (cmd === "restore") restore();
else {
    console.error("usage: node scripts/native-prebuilds.mjs <collect|restore>");
    process.exit(1);
}
