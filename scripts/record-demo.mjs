/**
 * Records the demo video with Playwright.
 *
 *   node scripts/record-demo.mjs [--url https://...] [--lang en|zh]
 *
 * Produces a .webm in docs/. Playwright records the whole browser session, so the
 * script drives the page at a pace a viewer can follow rather than as fast as the
 * automation allows — every pause below exists so something on screen has time to
 * land before the next thing happens.
 *
 * The run is real: it spends testnet mUSD and produces settlements verifiable on
 * BscScan. Nothing is faked for the camera.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "docs", "recording");

/** 720p keeps the file small enough to attach to a tweet. */
const VIEWPORT = { width: 1280, height: 720 };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const targetUrl = arg("url", "https://agentmesh-x402.vercel.app");
const language = arg("lang", "en");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scrolls smoothly to a CSS selector.
 *
 * Playwright's scrollIntoViewIfNeeded jumps instantly, which looks like a cut in
 * a recording. This eases instead, and waits for the scroll to actually finish.
 *
 * CSS only: this runs inside the page, where Playwright's own selector engines
 * (text=, has-text) do not exist. Use glideToText for those.
 */
async function glideTo(page, selector, block = "center") {
  await page.evaluate(
    ({ selector, block }) => {
      document.querySelector(selector)?.scrollIntoView({
        behavior: "smooth",
        block,
      });
    },
    { selector, block },
  );
  await wait(1100);
}

/**
 * Scrolls smoothly to whatever matches a Playwright locator.
 *
 * Resolves the element with Playwright, then eases to it via an evaluate on that
 * handle — so text= and regex matching work, but the scroll still animates.
 * Missing content is skipped rather than fatal: a recording that stops halfway is
 * worse than one that omits a panel.
 */
async function glideToText(page, pattern, block = "center") {
  const target = page.locator(pattern).first();
  if ((await target.count()) === 0) {
    console.warn(`  [skip] no match for ${pattern}`);
    return false;
  }
  await target.evaluate((element, block) => {
    element.scrollIntoView({ behavior: "smooth", block });
  }, block);
  await wait(1100);
  return true;
}

/** Sweeps the cursor across a box so the hover interaction is visible. */
async function sweepCursor(page, box, steps = 28) {
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    await page.mouse.move(
      box.x + 60 + progress * (box.width - 120),
      box.y + box.height * 0.5 + Math.sin(progress * Math.PI * 2) * 70,
    );
    await wait(28);
  }
}

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: outputDir, size: VIEWPORT },
  // The picker and report follow this, so the recording is in one language.
  locale: language === "zh" ? "zh-CN" : "en-US",
});

const page = await context.newPage();

// Surface page errors rather than recording a broken run silently.
page.on("pageerror", (error) => console.warn("  [page error]", error.message));

console.log(`Recording ${targetUrl} (${language})`);

await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
await wait(1400);

// ---- 1. Hero: the claim, then the interactive backdrop ----
console.log("  hero");
const hero = await page.locator("header").boundingBox();
if (hero) await sweepCursor(page, hero, 34);
await wait(700);

// ---- 2. How it works: the five protocol steps ----
console.log("  protocol steps");
await glideTo(page, "section", "start");
await wait(1600);

// ---- 3. Console: pair picker with Alpha filter ----
console.log("  pair picker");
await glideTo(page, "#console", "start");
await wait(900);

const picker = page.locator("#symbol-picker");
await picker.click();
await wait(1200);

await picker.fill("BTC");
await wait(1300);

// Show the Alpha filter, which is the part reviewers will not expect.
const alphaButton = page.locator('button:has-text("Alpha only"), button:has-text("仅看 Alpha")');
if (await alphaButton.count()) {
  await alphaButton.first().click();
  await wait(1600);
  await alphaButton.first().click();
  await wait(600);
}

await picker.fill("BTCUSDT");
await wait(600);
await page.keyboard.press("Enter");
await wait(800);

// ---- 4. Live chart ----
console.log("  live chart");
await glideTo(page, "#console", "start");
await wait(1800);

// ---- 5. Start the run: this spends real testnet funds ----
console.log("  starting paid run");
const startButton = page.locator('button:has-text("Start run"), button:has-text("开始运行")');
await startButton.first().click();

// Follow the payments as they settle. The graph and log are the point here.
await wait(2600);
await glideTo(page, '[role="log"]', "center");
await wait(5200);

// ---- 6. Wait for the report, then show the grade ----
console.log("  waiting for report");
await page
  .locator('text=/Delivered report|交付的报告/')
  .first()
  .waitFor({ timeout: 120_000 })
  .catch(() => console.warn("  report did not appear in time"));

await wait(1200);
await glideTo(page, '[role="img"][aria-label^="Grade"]', "center");
await wait(2600);

// ---- 7. Report and order preview ----
console.log("  report");
await page.evaluate(() => window.scrollBy({ top: 460, behavior: "smooth" }));
await wait(2800);

await page.evaluate(() => window.scrollBy({ top: 460, behavior: "smooth" }));
await wait(2400);

// ---- 8. Cross-vendor interop: strangers' endpoints ----
console.log("  interop");
await glideToText(page, 'text=/Cross-vendor|跨厂商/', "center");
await wait(2600);

// ---- 9. Roadmap panel, ending on what ships next ----
console.log("  roadmap");
await glideToText(page, 'text=/Shipped today|当前已上线/', "center");
await wait(2800);

await context.close();
await browser.close();

console.log(`\nVideo written to ${outputDir}`);
