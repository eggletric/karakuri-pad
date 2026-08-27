// Standalone UI check without Electron or real hardware: drives the Vite dev server
// (renderer + devMock) with Playwright's bundled Chromium and saves screenshots.
//
//   1. yarn dev:renderer          (or yarn dev)
//   2. node tools/ui-preview.mjs [scenario] [outDir]
//
// Scenarios:
//   welcome         - the first-launch welcome modal
//   config          - Config tab, dongle mode selected (mock serial connected)
//   config-loading  - the cover loading while the CFG GET reply is pending
//   macro-manual    - the macro recorder manual modal (default)
//
// The viewport matches the app's minimum window size (1130px wide), so layout
// overflow at the minimum width shows up here too.
import { chromium } from "playwright";

const BASE_URL = process.env.UI_PREVIEW_URL || "http://localhost:5173";
const scenario = process.argv[2] || "macro-manual";
const outDir = process.argv[3] || "tools/ui-preview-out";
const lang = process.env.UI_PREVIEW_LANG || "ja";

const LABELS = {
    ja: { tabConfig: "設定", connect: "接続", manual: "操作方法について", getStarted: "はじめる" },
    en: { tabConfig: "Config", connect: "Connect", manual: "How to use", getStarted: "Get started" },
}[lang];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1130, height: 820 } });
await page.addInitScript(([l, slowCfg]) => {
    window.localStorage.setItem("picoLanguage", l);
    // Keep the CFG GET reply pending so the cover loading stays visible
    if (slowCfg) window.__mockCfgDelayMs = 60000;
}, [lang, scenario === "config-loading"]);

await page.goto(BASE_URL, { waitUntil: "networkidle" });

// A fresh browser context has no localStorage, so the welcome modal auto-shows.
// It is the subject of the "welcome" scenario; every other scenario dismisses it.
if (scenario === "welcome") {
    await page.getByRole("button", { name: LABELS.getStarted }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${scenario}-${lang}.png`, fullPage: false });
    console.log(`saved: ${outDir}/${scenario}-${lang}.png`);
    await browser.close();
    process.exit(0);
}
await page.getByRole("button", { name: LABELS.getStarted }).click();
await page.waitForTimeout(400);

// Config tab -> connect the devMock serial port. The mock's CFG GET reply
// (window.__mockCfg: mode=dongle, macro=on) switches the form to the dongle panel.
await page.getByText(LABELS.tabConfig, { exact: true }).click();
await page.locator(".config-conn-bar").getByRole("button", { name: LABELS.connect }).click();
if (scenario === "config-loading") {
    await page.locator(".config-cover-loading").waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
} else {
    await page.getByRole("button", { name: LABELS.manual }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
}

if (scenario === "macro-manual") {
    await page.getByRole("button", { name: LABELS.manual }).click();
    await page.waitForTimeout(500); // the modal open animation
}

await page.screenshot({ path: `${outDir}/${scenario}-${lang}.png`, fullPage: false });
console.log(`saved: ${outDir}/${scenario}-${lang}.png`);

await browser.close();
