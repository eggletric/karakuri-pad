# Releasing

Releases are built by [`.github/workflows/release.yml`](../.github/workflows/release.yml) and
published from this repository's own Releases. Pushing a `v*` tag builds every platform and
uploads the artifacts into a **draft** release; a human publishes the draft once all legs are
green. A draft is invisible to electron-updater, so a broken build never reaches anyone.

## Steps

1. Bump `version` in `package.json` and commit it.
2. Tag and push:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
   The workflow refuses to run if the tag and `package.json` version disagree — electron-updater
   compares the version baked into the app against the feed, so a mismatch would produce an
   update that installs and then still reports itself as out of date.
3. Wait for all five legs to go green.
4. Check the release page has, per platform:
   - macOS: `karakuri-pad-mac-{arm64,x64}.{dmg,zip}`, plus `latest-mac.yml`
   - Windows: `karakuri-pad-setup-{x64,arm64}.exe`, plus `latest.yml`
   - Linux: `karakuri-pad-linux-<arch>.{AppImage,deb,rpm}`, plus `latest-linux.yml`

`${arch}` expands per file extension, following each ecosystem's own convention
(`getArtifactArchName` in builder-util):

| ext | x64 | arm64 |
|---|---|---|
| dmg / zip / exe | `x64` | `arm64` |
| AppImage | `x86_64` | `arm64` |
| deb | `amd64` | `arm64` |
| rpm | `x86_64` | `aarch64` |
5. Publish the draft.

The artifact names carry no version number, so `releases/latest/download/<name>` is a permanent
link that never has to be updated when a new version ships. electron-updater resolves the
download through the tagged URL inside `latest*.yml`, so it never mistakes one release for
another.

`latest*.yml` is what electron-updater reads. Publishing the draft is what makes the update
visible to everyone running an older build.

## The legs

| Leg | Runner | Output |
|---|---|---|
| mac | self-hosted (`self-hosted`, `macos`, `release`) | dmg + zip, arm64 and x64 |
| win-x64 | `windows-latest` | nsis |
| win-arm64 | `windows-11-arm` | nsis |
| linux-x64 | `ubuntu-22.04` | AppImage + deb + rpm |
| linux-arm64 | `ubuntu-22.04-arm` | AppImage + deb + rpm |

The native modules (node-hid / serialport / noble) cannot be cross-compiled, so each arch has
to build on its own runner. macOS is the exception: one leg builds both arches, which is also
why it is the only platform whose `latest*.yml` needs no merging afterwards.

### Why latest.yml gets rebuilt

Both arch legs of a platform publish into the same release and each one read-modify-writes the
same `latest*.yml`, so whichever finishes second drops the other's entry. The
`merge-latest-yml` job runs after every leg and rebuilds the file from the installers actually
present on the release, uploading it with `--clobber`. See
[`tools/merge-latest-yml.mjs`](../tools/merge-latest-yml.mjs).

## Signing

**macOS** is signed and notarized. The self-hosted runner already has the Developer ID
Application identity in its System keychain, so the workflow does not install one — it only
verifies the identity is visible and extracts `CSC_NAME` from it. Notarization needs three
repository secrets:

| Secret | What it is |
|---|---|
| `APPLE_API_KEY_B64` | The App Store Connect API key (`.p8`), base64 encoded |
| `APPLE_API_KEY_ID` | The key ID |
| `APPLE_API_ISSUER` | The issuer ID |

After the build, `codesign` / `stapler` / `spctl` all have to pass, so a missed signature or a
failed notarization turns the leg red rather than reaching the draft.

**Windows and Linux ship unsigned.** SmartScreen warns on first run of the Windows installer;
the README tells people how to get past it.

## Testing a build without publishing

Run the workflow manually (`workflow_dispatch`) and pick a leg. It builds with
`--publish never` and touches no release. Locally, `yarn dist` (or `dist:mac` / `dist:win` /
`dist:linux`) does the same thing.

## Checking the update UI

Set `KARAKURI_FAKE_UPDATE` in an unpackaged run to inject a state without needing a real
release:

```bash
KARAKURI_FAKE_UPDATE=available yarn dev    # available | downloaded | error
```

Clicking through replays a fake download and `quitAndInstall` becomes a no-op, so the whole
chip flow can be checked. In a browser-only session, `window.__emitUpdateState({ status: "available", version: "9.9.9" })`
does the same against the dev mock.

## Icons

`design/icon.png` (1024x1024, no margin) is the source. `yarn build:icons` regenerates
`build/icon-mac.png`, `build/icon-win.png` and `build/icon.png` from it. It is macOS only (the
rounding uses CoreGraphics), and the generated files are committed — the Windows and Linux
runners cannot regenerate them.

## Native prebuilds

Three dependencies ship native code:

| Package | Prebuilds | Gap |
|---|---|---|
| `@serialport/bindings-cpp` | ships them for every platform | none |
| `@stoprocent/noble` (+ `@stoprocent/bluetooth-hci-socket`) | ships them for every platform | **win32-arm64** |
| `node-hid` | fetched at install time via `prebuild-install` | not in the tarball |

So in normal use almost nothing is compiled from source. Two gaps remain, and
`vendor/native-prebuilds/` covers both:

- **win32-arm64** is the one arch the @stoprocent packages publish no prebuild for, so it is
  built from source and there is no upstream binary to fall back on.
- `node-hid` downloads its prebuilds rather than shipping them, so they depend on GitHub
  Releases still serving that version.

Everything involved is N-API, so the files stay valid across Electron upgrades and only need
regenerating when one of the packages is updated.

> Until 2026-08 this project used `@abandonware/noble`, whose last release was two years old and
> which published no prebuilds at all — every install compiled it from source. That is exactly
> how a Visual Studio 18 runner image broke the Windows build. `@stoprocent/noble` is the
> actively maintained fork and is API-compatible bar the removed `read` event, which was unused
> here.

### Why nothing is compiled at build time

`npmRebuild` is off. Every native dependency is N-API and ships (or fetches) prebuilt binaries,
so rebuilding against the Electron ABI buys nothing — and `@electron/rebuild` currently fails on
`usb` under the macOS 26 SDK. Turning it off also keeps the Windows legs from needing a Visual
Studio that node-gyp can locate.

The cost is that every package's prebuilds for *all* platforms end up in node_modules.
`scripts/prune-native.mjs <darwin|win32|linux>` runs before packaging and removes what the
target will never load: other platforms' prebuilds, plus `@stoprocent/bluetooth-hci-socket` and
`usb` off non-Linux builds (noble uses its CoreBluetooth binding on macOS and its WinRT binding
on Windows 10.0.15063+, so the HCI socket is Linux-only). That is about 10MB per package. The
`dist:*` scripts and the release workflow both call it; `yarn install` restores whatever it
removed.

It cannot be an electron-builder hook: `beforeBuild` only runs as part of the dependency
rebuild that `npmRebuild: false` skips, and by `afterPack` the asar is already written.

### Regenerating them

1. Run the **Collect native prebuilds** workflow (`workflow_dispatch`). It builds on all five
   platform/arch combinations and merges the results into one `native-prebuilds` artifact.
2. Download the artifact and unpack it over `vendor/native-prebuilds/`.
3. Commit the result.

Locally, `yarn prebuilds:collect` files whatever is currently built in `node_modules` under the
host's platform-arch. Pass `--tuple` when the products are for another arch, e.g. after
`npx electron-builder install-app-deps --arch=x64` on an Apple Silicon machine:

```bash
npx electron-builder install-app-deps --arch=x64
node scripts/native-prebuilds.mjs collect --tuple darwin-x64
npx electron-builder install-app-deps --arch=arm64   # put the workspace back
```

### Recovering when a build stops compiling

`node-gyp-build` resolves `build/Release` first and falls back to `prebuilds/<platform>-<arch>/`
on its own, so a package that failed to build picks up the vendored file with no further work.
When a partially built `build/` directory gets in the way, `PREBUILDS_ONLY=1` skips it outright.

```bash
yarn install --ignore-scripts     # skip the compile that is failing
yarn prebuilds:restore            # vendor/ -> node_modules/
PREBUILDS_ONLY=1 yarn dist        # ignore any half-built build/ directory
```

`node-hid` resolves through the `bindings` package, which only looks in `build/Release/`, so
`prebuilds:restore` puts its file straight back there rather than under `prebuilds/`.
