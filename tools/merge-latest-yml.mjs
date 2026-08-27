#!/usr/bin/env node
// When the multi-arch builds for Windows / Linux run as separate legs on separate runners,
// they read-modify-write latest*.yml in parallel and one arch's entry overwrites the other's.
// To avoid that race, this script runs after every leg has finished, rebuilds latest*.yml from
// the installers actually present on the release and uploads it with --clobber (i.e. it makes
// "last writer wins" deterministic).
//
// macOS builds both arches in a single leg, so there is no race there and it is out of scope.
//
// Usage:
//   node tools/merge-latest-yml.mjs <tag> <platform>
//     <tag>      : v1.0.1 and the like
//     <platform> : win | linux
//
// Assumes:
//   - `gh` is on PATH and authenticated (env GH_TOKEN)
//   - a draft release already exists for the tag (created by the create-draft job)
//   - every platform leg has finished publishing (waited on through `needs`)

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , tag, platform] = process.argv;
if (!tag || !platform) {
    console.error("usage: node tools/merge-latest-yml.mjs <tag> <win|linux>");
    process.exit(1);
}
if (!["win", "linux"].includes(platform)) {
    console.error(`unsupported platform: ${platform} (macOS builds in a single leg and needs no merge)`);
    process.exit(1);
}

const REPO = process.env.MERGE_REPO || process.env.GITHUB_REPOSITORY;
if (!REPO) {
    console.error("MERGE_REPO or GITHUB_REPOSITORY must be set");
    process.exit(1);
}

// The installers electron-updater deals with:
//   - win  : the NSIS `.exe`
//   - linux: the AppImage (deb and rpm are the system package manager's business, and
//            electron-updater resolves those through the package-type file rather than latest-linux.yml)
// The file name patterns come from the artifactName settings in package.json. They carry no
// version, so that `releases/latest/download/<name>` stays a permanent URL:
//   - win  nsis: `karakuri-pad-setup-<arch>.exe`
//   - linux    : `karakuri-pad-linux-<arch>.AppImage`
const INSTALLER_SPEC = {
    win: { pattern: "*.exe", filter: (f) => /-setup-/.test(f), ymlName: "latest.yml" },
    linux: { pattern: "*.AppImage", filter: () => true, ymlName: "latest-linux.yml" },
};
const spec = INSTALLER_SPEC[platform];

// The arch suffix follows each ecosystem's convention rather than electron-builder's own arch
// names, so an AppImage reads x86_64 where the nsis .exe reads x64.
function detectArch(filename) {
    if (/-(arm64|aarch64)\./.test(filename)) return "arm64";
    if (/-(x64|x86_64|amd64)\./.test(filename)) return "x64";
    return "x64";
}

// 1. Download every installer
const tmp = mkdtempSync(path.join(tmpdir(), "kp-merge-"));
console.log(`[merge] tag=${tag} platform=${platform} tmp=${tmp}`);
execSync(
    `gh release download "${tag}" --repo "${REPO}" --pattern "${spec.pattern}" -D "${tmp}"`,
    { stdio: "inherit" },
);

// 2. Keep only the installers and work out each one's arch
const candidates = readdirSync(tmp).filter(spec.filter);
if (candidates.length === 0) {
    console.error(`[merge] no installer files matched (pattern=${spec.pattern}, filter applied)`);
    process.exit(1);
}
console.log(`[merge] candidates: ${candidates.join(", ")}`);

// 3. Compute the sha512 (base64) and the size
const files = candidates.map((name) => {
    const buf = readFileSync(path.join(tmp, name));
    return {
        url: name,
        sha512: createHash("sha512").update(buf).digest("base64"),
        size: buf.length,
        arch: detectArch(name),
    };
});

// 4. The primary entry (for the legacy `path`/`sha512` keys) prefers x64, falling back to the first
const primary = files.find((f) => f.arch === "x64") || files[0];

// 5. The version comes from package.json (it matches the tag, which the workflow verifies)
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 6. Assemble the YAML (the format electron-updater expects is simple enough to write by hand)
const lines = [
    `version: ${pkg.version}`,
    "files:",
    ...files.flatMap((f) => [
        `  - url: ${f.url}`,
        `    sha512: ${f.sha512}`,
        `    size: ${f.size}`,
    ]),
    `path: ${primary.url}`,
    `sha512: ${primary.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    "",
];
const yml = lines.join("\n");
const ymlPath = path.join(tmp, spec.ymlName);
writeFileSync(ymlPath, yml);
console.log(`[merge] --- ${spec.ymlName} ---`);
console.log(yml);

// 7. Upload with --clobber, overwriting whatever the race left behind
execSync(
    `gh release upload "${tag}" "${ymlPath}" --repo "${REPO}" --clobber`,
    { stdio: "inherit" },
);
console.log(`[merge] uploaded ${spec.ymlName} to ${REPO}@${tag} (${files.length} archs)`);
