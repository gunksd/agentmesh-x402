/**
 * Records the demo video, driven by the narration timeline.
 *
 *   node scripts/build-narration.mjs        # first: voice + measured timings
 *   node scripts/record-demo.mjs            # then: video matching those timings
 *   node scripts/mux-demo.mjs               # finally: audio + burnt-in subtitles
 *
 * Every view is held for the duration its narration segment actually takes, read
 * from docs/narration/timings.json. That is what keeps picture, voice and captions
 * locked: if a spoken line runs long, the shot waits for it rather than cutting
 * away mid-sentence.
 *
 * The run is real. It spends testnet mUSD and produces settlements verifiable on
 * BscScan; nothing is staged for the camera.
 *
 * Captions are drawn as a DOM overlay rather than burnt in afterwards with
 * ffmpeg. Homebrew's ffmpeg ships without libass, so the `subtitles` filter does
 * not exist in this build — and the overlay turns out to be the better option
 * regardless: the same timeline drives picture and captions so they cannot drift,
 * and text renders in the real system font instead of libass's approximation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "docs", "recording");
const timingsPath = join(root, "docs", "narration", "timings.json");

/** 720p keeps the file small enough to attach to a post. */
const VIEWPORT = { width: 1280, height: 720 };

const REPO_URL = "https://github.com/gunksd/agentmesh-x402";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const targetUrl = arg("url", "https://agentmesh-x402.vercel.app");
const language = arg("lang", "zh");

if (!existsSync(timingsPath)) {
  console.error("Missing docs/narration/timings.json — run build-narration.mjs first.");
  process.exit(1);
}

const timeline = JSON.parse(readFileSync(timingsPath, "utf8"));

/** Segment durations by id, so each shot knows how long to hold. */
const slot = new Map(timeline.segments.map((s) => [s.id, s.seconds * 1000]));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: outputDir, size: VIEWPORT },
  locale: language === "zh" ? "zh-CN" : "en-US",
});

/**
 * Caption overlay.
 *
 * addInitScript runs on every new document, which is what makes the captions
 * survive the navigations to GitHub and BscScan at the end. The element is
 * created on demand because this executes before the page's own body exists.
 */
await context.addInitScript(() => {
  const ensure = () => {
    if (document.getElementById("__caption")) return document.getElementById("__caption");
    if (!document.body) return null;

    const box = document.createElement("div");
    box.id = "__caption";
    box.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:34px",
      "z-index:2147483647",
      "pointer-events:none",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "gap:7px",
      "padding:0 72px",
      "font-synthesis:none",
    ].join(";");

    const zh = document.createElement("div");
    zh.id = "__caption_zh";
    // Chinese sits above English because the voice-over is Mandarin: the line
    // being spoken should be the one nearer the action.
    zh.style.cssText = [
      'font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
      "font-size:25px",
      "font-weight:600",
      "line-height:1.45",
      "color:#fff",
      "background:rgba(10,22,40,0.82)",
      "padding:8px 18px",
      "border-radius:10px",
      "text-align:center",
      "max-width:1000px",
      "white-space:pre-wrap",
      "box-shadow:0 6px 24px rgba(0,0,0,0.28)",
    ].join(";");

    const en = document.createElement("div");
    en.id = "__caption_en";
    en.style.cssText = [
      'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif',
      "font-size:17px",
      "font-weight:450",
      "line-height:1.4",
      "color:#e2e8f0",
      "background:rgba(10,22,40,0.7)",
      "padding:6px 15px",
      "border-radius:8px",
      "text-align:center",
      "max-width:940px",
      "white-space:pre-wrap",
    ].join(";");

    box.append(zh, en);
    document.body.appendChild(box);
    return box;
  };

  window.__setCaption = (zhText, enText) => {
    const box = ensure();
    if (!box) return;
    box.querySelector("#__caption_zh").textContent = zhText;
    box.querySelector("#__caption_en").textContent = enText;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure, { once: true });
  } else {
    ensure();
  }
});

const page = await context.newPage();
page.on("pageerror", (error) => console.warn("  [page error]", error.message));

/** Caption text per segment, keyed by id. */
const captions = new Map(timeline.segments.map((s) => [s.id, s]));

/**
 * When the recording began.
 *
 * Playwright starts capturing at newPage(), but the first narration segment does
 * not begin until the page has loaded and settled — roughly four seconds later.
 * That head of blank loading page pushed every shot four seconds later than its
 * audio. The offset is measured here and written out so the mux step can trim it.
 */
const captureStarted = Date.now();
let firstSegmentAt = null;

const started = Date.now();

/**
 * Runs a segment's action, then holds until its narration slot is spent.
 *
 * The action's own time counts toward the slot, so a slow scroll does not push
 * everything after it out of sync.
 */
async function segment(id, action) {
  const budget = slot.get(id);
  if (budget === undefined) {
    console.warn(`  [skip] ${id} not in timeline`);
    return;
  }

  const begin = Date.now();
  if (firstSegmentAt === null) firstSegmentAt = begin;
  const elapsedBefore = ((begin - started) / 1000).toFixed(1);

  const caption = captions.get(id);
  if (caption) {
    await page
      .evaluate(
        ({ zh, en }) => window.__setCaption?.(zh, en),
        { zh: caption.zh, en: caption.en },
      )
      .catch(() => {});
  }

  try {
    if (action) await action();
  } catch (error) {
    // A missing panel should cost one shot, not the whole recording.
    console.warn(`  [warn] ${id}: ${error.message.split("\n")[0]}`);
  }

  const remaining = budget - (Date.now() - begin);
  if (remaining > 0) await wait(remaining);

  console.log(`  ${id.padEnd(10)} @${elapsedBefore}s  (${(budget / 1000).toFixed(1)}s)`);
}

/** Eases to a CSS selector. Instant jumps read as cuts in a recording. */
async function glideTo(selector, block = "center") {
  await page.evaluate(
    ({ selector, block }) => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block });
    },
    { selector, block },
  );
  await wait(900);
}

/**
 * Eases to whatever a Playwright locator matches.
 *
 * Resolves with Playwright, then scrolls via the element handle, so text= and
 * regex selectors work while the scroll still animates. Playwright's selector
 * engines do not exist inside page.evaluate, which is why this is separate.
 */
async function glideToText(pattern, block = "center") {
  const target = page.locator(pattern).first();
  if ((await target.count()) === 0) {
    console.warn(`  [skip] no match for ${pattern}`);
    return false;
  }
  await target.evaluate((element, block) => {
    element.scrollIntoView({ behavior: "smooth", block });
  }, block);
  await wait(900);
  return true;
}

/** Sweeps the cursor so the hover interaction is visible on camera. */
async function sweepCursor(box, steps, durationMs) {
  const step = durationMs / steps;
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    await page.mouse.move(
      box.x + 60 + progress * (box.width - 120),
      box.y + box.height * 0.5 + Math.sin(progress * Math.PI * 2) * 70,
    );
    await wait(step);
  }
}

console.log(`Recording ${targetUrl} (${language}), ${timeline.total.toFixed(1)}s timeline\n`);

await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
await wait(1200);

const hero = await page.locator("header").boundingBox();

// ---- Opening: the claim, over the interactive backdrop ----
await segment("intro", () => (hero ? sweepCursor(hero, 20, 4200) : undefined));
await segment("problem", () => (hero ? sweepCursor(hero, 18, 5200) : undefined));
await segment("solution", async () => {
  if (hero) await sweepCursor(hero, 16, 4200);
  await glideToText('text=/GAS PAID BY PAYER|付款方 GAS/', "center");
});

// ---- The protocol, five steps ----
await segment("protocol", () => glideTo("section", "start"));

// ---- Pair picker, with the Alpha filter ----
await segment("picker", async () => {
  await glideTo("#console", "start");
  const picker = page.locator("#symbol-picker");
  await picker.click();
  await wait(900);
  await picker.fill("BTC");
  await wait(1100);

  const alpha = page.locator('button:has-text("Alpha only"), button:has-text("仅看 Alpha")');
  if (await alpha.count()) {
    await alpha.first().click();
    await wait(2200);
    await alpha.first().click();
    await wait(500);
  }

  await picker.fill("BTCUSDT");
  await wait(400);
  await page.keyboard.press("Enter");
});

// ---- Live chart ----
await segment("chart", () => glideToText('text=/Live market|实时行情/', "start"));

// ---- Start the paid run ----
await segment("run", async () => {
  const start = page.locator('button:has-text("Start run"), button:has-text("开始运行")');
  await start.first().click();
  await wait(2400);
});

// ---- Payments in flight ----
await segment("parallel", () => glideToText('text=/Payment topology|支付拓扑/', "start"));
await segment("log", () => glideTo('[role="log"]', "center"));

// ---- Wait for the report, then the grade ----
const reportReady = page
  .locator("text=/Delivered report|交付的报告/")
  .first()
  .waitFor({ timeout: 90_000 })
  .then(() => true)
  .catch(() => false);

await segment("grade", async () => {
  await reportReady;
  await glideToText('[role="img"][aria-label^="Grade"]', "center");
});

await segment("regime", () => glideToText('text=/Components|分项指标/', "center"));
await segment("report", () => glideToText('text=/Delivered report|交付的报告/', "start"));
await segment("scope", () => glideToText('text=/Order preview|下单预览/', "start"));
await segment("interop", () => glideToText('text=/Cross-vendor|跨厂商/', "start"));
await segment("roadmap", () => glideToText('text=/Shipped today|当前已上线/', "start"));

// ---- The repository ----
await segment("code", async () => {
  await page.goto(REPO_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const code = captions.get("code");
  await page
    .evaluate(({ zh, en }) => window.__setCaption?.(zh, en), { zh: code.zh, en: code.en })
    .catch(() => {});
  await wait(2000);
  // Scroll the README so the novelty section and badges are both seen.
  await page.evaluate(() => window.scrollBy({ top: 620, behavior: "smooth" }));
  await wait(2600);
  await page.evaluate(() => window.scrollBy({ top: 700, behavior: "smooth" }));
});

// ---- On-chain proof ----
await segment("proof", async () => {
  // A settlement from the README, so the shot works even if this run's hashes
  // were not scraped off the page.
  const tx =
    "0x974b4d826eefa41d2b06c66a194e3a8f23da35d737d2fad205b184c25c1ce6fc";
  await page.goto(`https://testnet.bscscan.com/tx/${tx}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  const proof = captions.get("proof");
  await page
    .evaluate(({ zh, en }) => window.__setCaption?.(zh, en), { zh: proof.zh, en: proof.en })
    .catch(() => {});
  await wait(3000);
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: "smooth" }));
});

// Tail padding, so the video is never shorter than the audio track.
await wait(1200);

await context.close();
await browser.close();

// The mux step trims this many seconds off the head so audio and picture align.
const headOffset = ((firstSegmentAt ?? captureStarted) - captureStarted) / 1000;
writeFileSync(
  join(outputDir, "offset.json"),
  `${JSON.stringify({ headOffsetSeconds: Number(headOffset.toFixed(3)) }, null, 2)}\n`,
);

console.log(
  `\nRecorded ${((Date.now() - started) / 1000).toFixed(1)}s (timeline ${timeline.total.toFixed(1)}s)`,
);
console.log(`Head offset ${headOffset.toFixed(2)}s — trimmed during mux`);
console.log(`Video written to ${outputDir}`);
