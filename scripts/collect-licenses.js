#!/usr/bin/env node
// Collects the license notices of the bundled dependencies into THIRD-PARTY-LICENSES.txt.
// MIT / ISC and friends require the copyright notice and license text to be preserved,
// so they have to be shipped with the distribution.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NM = path.join(ROOT, "node_modules");
const OUT = path.join(ROOT, "THIRD-PARTY-LICENSES.txt");

const LICENSE_FILES = [
    "LICENSE", "LICENSE.md", "LICENSE.txt",
    "License", "license", "LICENCE", "LICENSE-MIT", "COPYING",
];

function readPkg(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
    } catch (e) {
        return null;
    }
}

function findLicenseText(dir) {
    for (const name of LICENSE_FILES) {
        const p = path.join(dir, name);
        try {
            if (fs.statSync(p).isFile()) return fs.readFileSync(p, "utf-8").trim();
        } catch (e) { /* try the next candidate */ }
    }
    return "";
}

function licenseOf(pkg) {
    if (typeof pkg.license === "string") return pkg.license;
    if (pkg.license && pkg.license.type) return pkg.license.type;
    if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(" OR ");
    return "(unknown)";
}

// Walk the production dependencies only (devDependencies are not bundled)
const collected = new Map();
const visited = new Set();

function resolveDir(name, fromDir) {
    let cur = fromDir;
    for (;;) {
        const candidate = path.join(cur, "node_modules", name);
        if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

function walk(name, fromDir) {
    const dir = resolveDir(name, fromDir);
    if (!dir) return;
    const pkg = readPkg(dir);
    if (!pkg) return;

    const key = `${pkg.name}@${pkg.version}`;
    if (visited.has(key)) return;
    visited.add(key);

    collected.set(key, {
        name: pkg.name,
        version: pkg.version,
        license: licenseOf(pkg),
        homepage: pkg.homepage || (pkg.repository && (pkg.repository.url || pkg.repository)) || "",
        text: findLicenseText(dir),
    });

    for (const dep of Object.keys(pkg.dependencies || {})) walk(dep, dir);
}

const rootPkg = readPkg(ROOT);
for (const dep of Object.keys(rootPkg.dependencies || {})) walk(dep, ROOT);

// Bundled assets that do not come from npm. Fonts (SIL OFL 1.1) require the license
// document to be shipped on redistribution, so the full OFL text placed in
// renderer/src/assets is included here
const BUNDLED_ASSETS = [
    {
        name: "Noto Sans (font)",
        license: "OFL-1.1",
        homepage: "https://fonts.google.com/noto/specimen/Noto+Sans",
        file: path.join(ROOT, "renderer", "src", "assets", "OFL-NotoSans.txt"),
    },
    {
        name: "Noto Sans JP (font)",
        license: "OFL-1.1",
        homepage: "https://fonts.google.com/noto/specimen/Noto+Sans+JP",
        file: path.join(ROOT, "renderer", "src", "assets", "OFL-NotoSansJP.txt"),
    },
];
for (const a of BUNDLED_ASSETS) {
    collected.set(a.name, {
        name: a.name,
        version: "",
        license: a.license,
        homepage: a.homepage,
        text: fs.readFileSync(a.file, "utf-8").trim(),
    });
}

const entries = [...collected.values()].sort((a, b) => a.name.localeCompare(b.name));
const label = (e) => (e.version ? `${e.name}@${e.version}` : e.name);

const lines = [];
lines.push("This software includes the open source packages listed below.");
lines.push("They are redistributed under their respective license terms.");
lines.push("");
lines.push(`Packages: ${entries.length}`);
lines.push(`Generated: (at build time)`);
lines.push("");
lines.push("=".repeat(72));
lines.push("Index");
lines.push("=".repeat(72));
for (const e of entries) {
    lines.push(`  ${label(e)}  [${e.license}]`);
}
lines.push("");

for (const e of entries) {
    lines.push("=".repeat(72));
    lines.push(label(e));
    lines.push(`License: ${e.license}`);
    if (e.homepage) lines.push(`Homepage: ${String(e.homepage).replace(/^git\+/, "")}`);
    lines.push("=".repeat(72));
    lines.push("");
    lines.push(e.text || "(The package ships no full license text. See the license type above.)");
    lines.push("");
}

fs.writeFileSync(OUT, lines.join("\n"), "utf-8");
console.log(`Wrote THIRD-PARTY-LICENSES.txt (${entries.length} packages)`);

const unknown = entries.filter((e) => e.license === "(unknown)");
if (unknown.length) {
    console.warn("Some packages have an unknown license:");
    for (const e of unknown) console.warn(`  - ${e.name}@${e.version}`);
}
