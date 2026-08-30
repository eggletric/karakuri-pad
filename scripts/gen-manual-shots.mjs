// Regenerates the LP manual screenshots of the Config tab.
//
// They are captured from the renderer's dev server (the same React app Electron
// loads) at the Electron window's minimum content size, with deviceScaleFactor 2 so
// the output matches the existing 2x assets. The dev mock stands in for the serial
// bridge, so the app reaches the "connected, dongle mode" state without hardware.
//
//   npm run dev:renderer          # in another shell
//   node scripts/gen-manual-shots.mjs [outDir] [baseUrl]
//
// Defaults write straight into the LP repo next door.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = process.argv[2] || path.resolve(process.cwd(), '../karakuri-pad-lp/public/manual');
const BASE = process.argv[3] || 'http://localhost:5173/';

// Electron's minimum window is 1165x810 (electron/main.js). The existing shots are
// 1130 wide, i.e. the content box inside that window.
const VIEWPORT = { width: 1130, height: 810 };
const VIEWPORT_W = VIEWPORT.width;
const VIEWPORT_H = VIEWPORT.height;

/** usbmode + language per screenshot pair, matching the articles that use them */
const SHOTS = [
  { usbmode: 'procon', lang: 'ja', full: 'dongle-config-switch-ja', closeup: 'cu-config-dongle-switch-ja' },
  { usbmode: 'procon', lang: 'en', full: 'dongle-config-switch-en', closeup: 'cu-config-dongle-switch-en' },
  { usbmode: 'sinput', lang: 'ja', full: 'dongle-config-pc-ja', closeup: 'cu-config-dongle-pc-ja' },
  { usbmode: 'sinput', lang: 'en', full: 'dongle-config-pc-en', closeup: 'cu-config-dongle-pc-en' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // the assets are 2x: 1130x810 -> 2260x1620
    colorScheme: 'dark',
  });

  for (const shot of SHOTS) {
    const page = await context.newPage();

    // Seed before the app boots: language, and skip the first-launch modal
    await page.addInitScript(({ lang }) => {
      window.localStorage.setItem('picoLanguage', lang);
      window.localStorage.setItem('picoWelcomeSeen', '1');
    }, { lang: shot.lang });

    await page.goto(BASE, { waitUntil: 'networkidle' });

    // devMock exposes the config CFG GET answers through window.__mockCfg
    await page.evaluate(({ usbmode }) => {
      window.__mockCfg.usbmode = usbmode;
      window.__mockCfg.macro = 'on';
    }, { usbmode: shot.usbmode });

    // The welcome modal still renders on a fresh profile in some builds
    const started = page.getByRole('button', { name: /はじめる|Get started/ });
    if (await started.count()) await started.first().click().catch(() => {});

    // The top tabs are .chrome-tab elements, not buttons
    await page.locator('.chrome-tab', { hasText: /^(設定|Config)$/ }).first().click();

    // Two buttons read "接続"/"Connect": the app-link bar at the top right (disabled
    // until a connection is picked) and the serial bar. Take the enabled one, once the
    // port has settled past ConfigTab's connect cooldown.
    await page.waitForFunction(() => {
      const t = (el) => (el.textContent || '').trim();
      return [...document.querySelectorAll('button')]
        .some((b) => /^(接続|Connect)$/.test(t(b)) && !b.disabled);
    }, null, { timeout: 20000 });
    await page.evaluate(() => {
      const t = (el) => (el.textContent || '').trim();
      [...document.querySelectorAll('button')]
        .find((b) => /^(接続|Connect)$/.test(t(b)) && !b.disabled)
        .click();
    });

    // Wait for CFG GET to land, then empty the monitor: the existing shots show it blank
    await page.waitForSelector('text=/USB: connected/', { timeout: 10000 });
    await sleep(1200);
    await page.getByRole('button', { name: /^(クリア|Clear)$/ }).first().click();

    // Leave no trace of the automation in the frame: drop the focus ring the click
    // leaves on "clear", park the pointer off any control, and let the "serial
    // connected" toast finish before shooting
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(VIEWPORT_W / 2, VIEWPORT_H - 40);
    await page.waitForSelector('.toast', { state: 'detached', timeout: 15000 }).catch(() => {});
    await sleep(400);

    await page.screenshot({ path: path.join(OUT, `${shot.full}.png`) });

    // Close-up: the connection settings card cropped to its own bounding box, which is
    // how the existing crops are framed (960 device px wide, card edge to card edge)
    const card = page.locator('.card').filter({ hasText: /接続設定|Connection Settings/ }).first();
    const box = await card.boundingBox();
    await page.screenshot({
      path: path.join(OUT, `${shot.closeup}.png`),
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });

    console.log(`captured ${shot.full} / ${shot.closeup}`);
    await page.close();
  }

  await browser.close();
  console.log(`\nPNGs written to ${OUT}. Convert them with:\n  cwebp -q 92 <file>.png -o <file>.webp`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
