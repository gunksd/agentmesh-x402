/**
 * Synthesises the Chinese voice-over and builds the subtitle files.
 *
 *   node scripts/build-narration.mjs
 *
 * Writes to docs/narration/:
 *   voice.m4a       one continuous track, segments padded to their slot
 *   timings.json    measured start/end per segment, consumed by the recorder
 *   subs.zh.ass     Chinese captions, styling baked in
 *   subs.en.ass     English captions, styling baked in
 *
 * Why measure rather than assume: `say` decides its own pace, so a line budgeted
 * 7s may take 8.4s. Each segment's real duration is read back from the rendered
 * audio, and the slot is widened when speech overruns it. The recorder then holds
 * each view for the measured time, which is what keeps voice, picture and captions
 * locked together.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEGMENTS } from "./narration.mjs";
import { writeAss } from "./subtitles.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "narration");
const tmpDir = join(outDir, "tmp");

/** Standard-Mandarin female voice, the clearest of the zh_CN set for narration. */
const VOICE = "Tingting";

/** Words per minute. Slower than the 180 default so technical terms land. */
const RATE = 168;

/** Breathing room after each line, so segments do not run together. */
const TAIL_PADDING_SECONDS = 0.55;

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 32 << 20 });
}

/** Duration of a media file in seconds. */
function durationOf(path) {
  const output = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  return Number.parseFloat(output.trim());
}

/** Formats seconds as an SRT timestamp: HH:MM:SS,mmm */
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const milli = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${milli}`;
}

/**
 * Wraps a caption onto at most two lines.
 *
 * Chinese has no spaces to break on, so it splits by character count; English
 * breaks on the space nearest the midpoint. Two lines is the practical ceiling
 * before captions start covering the UI they describe.
 */
function wrapCaption(text, isChinese) {
  const limit = isChinese ? 26 : 62;
  if (text.length <= limit) return text;

  if (isChinese) {
    const mid = Math.ceil(text.length / 2);
    // Prefer breaking after punctuation near the middle.
    const punctuation = ["，", "。", "、", "——", "："];
    for (let offset = 0; offset < 8; offset += 1) {
      for (const sign of punctuation) {
        if (text[mid + offset] === sign) {
          return `${text.slice(0, mid + offset + 1)}\n${text.slice(mid + offset + 1)}`;
        }
        if (text[mid - offset] === sign) {
          return `${text.slice(0, mid - offset + 1)}\n${text.slice(mid - offset + 1)}`;
        }
      }
    }
    return `${text.slice(0, mid)}\n${text.slice(mid)}`;
  }

  const words = text.split(" ");
  let head = "";
  for (const word of words) {
    if ((head + word).length > text.length / 2) break;
    head += `${word} `;
  }
  return `${head.trim()}\n${text.slice(head.length).trim()}`;
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

console.log(`Synthesising ${SEGMENTS.length} segments with ${VOICE} at ${RATE}wpm\n`);

const timings = [];
let cursor = 0;

for (const segment of SEGMENTS) {
  const aiff = join(tmpDir, `${segment.id}.aiff`);
  const padded = join(tmpDir, `${segment.id}.wav`);

  run("say", ["-v", VOICE, "-r", String(RATE), "-o", aiff, segment.zh]);
  const spoken = durationOf(aiff);

  // The slot is whichever is longer: the budget, or what the voice actually took
  // plus a breath. Budgeting alone would clip the tail of a long line.
  const slot = Math.max(segment.seconds, spoken + TAIL_PADDING_SECONDS);

  // Pad with silence to fill the slot exactly, so concatenation needs no offsets.
  run("ffmpeg", [
    "-v", "error", "-y",
    "-i", aiff,
    "-af", `apad=whole_dur=${slot.toFixed(3)}`,
    "-ar", "44100", "-ac", "2",
    padded,
  ]);

  timings.push({
    id: segment.id,
    start: Number(cursor.toFixed(3)),
    end: Number((cursor + slot).toFixed(3)),
    seconds: Number(slot.toFixed(3)),
    spoken: Number(spoken.toFixed(3)),
    zh: segment.zh,
    en: segment.en,
  });

  const overrun = spoken + TAIL_PADDING_SECONDS > segment.seconds;
  console.log(
    `  ${segment.id.padEnd(10)} spoken ${spoken.toFixed(1)}s  slot ${slot.toFixed(1)}s` +
      (overrun ? "  (widened)" : ""),
  );

  cursor += slot;
}

// Concatenate in order. The list file avoids a shell-quoting minefield with
// filenames and keeps the command length bounded.
const listPath = join(tmpDir, "concat.txt");
writeFileSync(
  listPath,
  timings.map((t) => `file '${join(tmpDir, `${t.id}.wav`)}'`).join("\n"),
);

const voicePath = join(outDir, "voice.m4a");
run("ffmpeg", [
  "-v", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", listPath,
  "-c:a", "aac", "-b:a", "128k",
  voicePath,
]);

// Build both subtitle tracks off the measured offsets. ASS rather than SRT so the
// styling lives in the file instead of in the ffmpeg filtergraph, where every
// comma in force_style= gets parsed as an argument separator.
const wrapped = timings.map((t) => ({
  ...t,
  zh: wrapCaption(t.zh, true),
  en: wrapCaption(t.en, false),
}));
writeAss(join(outDir, "subs.zh.ass"), "zh", wrapped);
writeAss(join(outDir, "subs.en.ass"), "en", wrapped);

writeFileSync(
  join(outDir, "timings.json"),
  `${JSON.stringify({ voice: VOICE, rate: RATE, total: cursor, segments: timings }, null, 2)}\n`,
);

const audioDuration = durationOf(voicePath);
console.log(`\nvoice.m4a   ${audioDuration.toFixed(1)}s`);
console.log(`timings.json  ${timings.length} segments, ${cursor.toFixed(1)}s planned`);
console.log(`subtitles     subs.zh.ass, subs.en.ass`);

// A mismatch here means padding failed and the captions would drift.
if (Math.abs(audioDuration - cursor) > 0.5) {
  console.warn(
    `\nWARNING: audio is ${audioDuration.toFixed(1)}s but timeline expects ${cursor.toFixed(1)}s`,
  );
}
