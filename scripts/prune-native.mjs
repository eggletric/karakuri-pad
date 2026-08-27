#!/usr/bin/env node
// Removes native artefacts that the target platform will never use, before packaging.
//
//   node scripts/prune-native.mjs <darwin|win32|linux>
//
// Several dependencies (@stoprocent/noble, @stoprocent/bluetooth-hci-socket, usb,
// @serialport/bindings-cpp) ship prebuilt binaries for every platform in one tarball. That is
// what lets a build compile nothing at all, but shipping all of them to end users wastes about
// 9MB per package.
//
// Why not an electron-builder hook: `beforeBuild` is only invoked as part of the dependency
// rebuild, which npmRebuild:false skips entirely, and by `afterPack` the asar is already
// written so deleting from app.asar.unpacked leaves the copies inside the archive. Nor can it
// be done through `files`, because a platform-specific `files` list REPLACES the top-level one
// instead of extending it, which would silently pack the whole repository.
//
// node_modules is modified in place; `yarn install` puts back whatever is removed. Arch is not
// filtered, only platform, because macOS packages both arches in a single run.
import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv[2];
if (!["darwin", "win32", "linux"].includes(keep)) {
    console.error("usage: node scripts/prune-native.mjs <darwin|win32|linux>");
    process.exit(1);
}

async function* findPrebuildDirs(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const full = join(dir, e.name);
        if (e.name === "prebuilds") yield full;
        else yield* findPrebuildDirs(full, depth + 1);
    }
}

async function dirSize(dir) {
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = join(dir, e.name);
        total += e.isDirectory() ? await dirSize(full) : (await stat(full).catch(() => ({ size: 0 }))).size;
    }
    return total;
}

let removed = 0;
let bytes = 0;

for await (const prebuilds of findPrebuildDirs(join(ROOT, "node_modules"))) {
    for (const tuple of await readdir(prebuilds)) {
        if (tuple.split("-")[0] === keep) continue;
        const target = join(prebuilds, tuple);
        bytes += await dirSize(target);
        await rm(target, { recursive: true, force: true });
        removed++;
    }
}

// Packages that only one platform ever loads. noble picks its binding at runtime
// (lib/mac on macOS, lib/win on Windows 10.0.15063+, hci-socket elsewhere), and hci-socket is
// an optional dependency, so dropping it off Linux is safe. `usb` only exists to serve it.
const LINUX_ONLY = ["@stoprocent/bluetooth-hci-socket", "usb"];
if (keep !== "linux") {
    for (const dir of LINUX_ONLY) {
        const target = join(ROOT, "node_modules", dir);
        const size = await dirSize(target);
        if (!size) continue;
        bytes += size;
        await rm(target, { recursive: true, force: true });
        removed++;
        console.log(`  dropped ${dir} (${(size / 1048576).toFixed(1)} MB, linux-only)`);
    }
}

console.log(`prune-native: removed ${removed} entries (${(bytes / 1048576).toFixed(1)} MB), kept ${keep}`);
