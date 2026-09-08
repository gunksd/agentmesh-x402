/**
 * Renders the deck to PDF and per-slide PNGs.
 *
 *   node scripts/build-deck.mjs
 *
 * Writes docs/deck/AgentMesh.pdf and docs/deck/slides/NN.png
 *
 * Chromium rather than a slide framework: the deck is plain HTML with fixed
 * 1920x1080 sections, so the browser that will render it is also the one that
 * lays it out — no chance of a framework's own print stylesheet reflowing a page.
 *
 * PNGs are emitted alongside the PDF because most submission forms and social
 * posts want images, not a document.
 */

import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deckDir = join(root, "docs", "deck");
const slidesDir = join(deckDir, "slides");
const pdfPath = join(deckDir, "AgentMesh.pdf");

/** Matches the .slide dimensions in deck.css. */
const SLIDE = { width: 1920, height: 1080 };

rmSync(slidesDir, { recursive: true, force: true });
mkdirSync(slidesDir, { recursive: true });

const browser = await chromium.launch();

// deviceScaleFactor 2 gives retina-sharp PNGs; the PDF is vector regardless.
const context = await browser.newContext({
  viewport: SLIDE,
  deviceScaleFactor: 2,
});

const page = await context.newPage();
page.on("pageerror", (error) => console.warn("  [page error]", error.message));

await page.goto(`file://${join(deckDir, "index.html")}`, {
  waitUntil: "networkidle",
});

// Fonts must be resolved before measuring or shooting anything, or the first
// slide renders in a fallback face and the layout shifts under it.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const slides = page.locator("section.slide");
const count = await slides.count();
console.log(`Rendering ${count} slides\n`);

/** Warn on overflow rather than silently shipping a clipped slide. */
const overflows = await page.evaluate(() => {
  const report = [];
  document.querySelectorAll("section.slide").forEach((slide, index) => {
    if (slide.scrollHeight > slide.clientHeight + 2) {
      report.push({
        slide: index + 1,
        overflowPx: slide.scrollHeight - slide.clientHeight,
      });
    }
  });
  return report;
});

for (let i = 0; i < count; i += 1) {
  const name = String(i + 1).padStart(2, "0");
  await slides.nth(i).screenshot({ path: join(slidesDir, `${name}.png`) });
  const size = (statSync(join(slidesDir, `${name}.png`)).size / 1024).toFixed(0);
  console.log(`  ${name}.png  ${size}KB`);
}

// printBackground keeps the tints and dark code blocks; preferCSSPageSize picks
// up the print rules in deck.css so one section becomes exactly one page.
await page.pdf({
  path: pdfPath,
  width: `${SLIDE.width}px`,
  height: `${SLIDE.height}px`,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await context.close();
await browser.close();

const pdfSize = (statSync(pdfPath).size / 1e6).toFixed(2);
const pngCount = readdirSync(slidesDir).filter((f) => f.endsWith(".png")).length;

console.log(`\nAgentMesh.pdf   ${pdfSize}MB`);
console.log(`slides/         ${pngCount} PNGs at ${SLIDE.width * 2}x${SLIDE.height * 2}`);

if (overflows.length > 0) {
  console.warn("\nWARNING: content overflows these slides, so it is being clipped:");
  for (const item of overflows) {
    console.warn(`  slide ${item.slide}: ${item.overflowPx}px too tall`);
  }
}
