/**
 * Synthesises the Chinese voice-over with Fish Audio, then builds subtitles.
 *
 *   FISH_API_KEY=sk-... node scripts/build-narration-fish.mjs
 *
 * Replaces the macOS `say` path in build-narration.mjs. Same contract: reads the
 * shared timeline in narration.mjs, writes voice.m4a plus measured timings.json
 * and the two .ass subtitle files, so the recorder and mux steps are unchanged.
 *
 * Two things this has to get right that a local synthesiser did not:
 *
 *   Durations are unknown until the API answers, and Fish's pacing differs from
 *   `say`, so every slot is derived from the returned audio rather than the
 *   script's estimate. The video is then cut to those measurements.
 *
 *   Requests can fail halfway through a 17-segment run. Each segment is cached on
 *   disk by a hash of its text, so a re-run only re-synthesises what changed and
 *   a transient failure costs one segment instead of the whole track.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEGMENTS } from "./narration.mjs";
import { writeAss } from "./subtitles.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "narration");
const cacheDir = join(outDir, "cache");

const API_KEY = process.env.FISH_API_KEY;
const VOICE_ID = process.env.FISH_VOICE_ID ?? "7bdb279a081e48549b0613749e1fc996";

/** The free tier. Paid backends (s1, speech-1.6) need API credit on the account. */
const BACKEND = process.env.FISH_MODEL ?? "s2.1-pro-free";

/** Breathing room after each line so segments do not run together. */
const TAIL_PADDING_SECONDS = 0.5;

/** Retries per segment, for transient 5xx and network drops. */
const MAX_ATTEMPTS = 4;

if (!API_KEY) {
  console.error("FISH_API_KEY is not set.");
  process.exit(1);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 << 20 });
}

function durationOf(path) {
  return Number.parseFloat(
    run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ]).trim(),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches one segment, using the on-disk cache when the text is unchanged.
 *
 * The cache key covers the voice and backend as well as the text, so switching
 * either invalidates it rather than silently serving the old voice.
 */
async function synthesise(segment) {
  // The voice reads `speak` when the caption text would be mispronounced —
  // "402" is a protocol name, not the number four hundred and two.
  const spokenText = segment.speak ?? segment.zh;

  const key = createHash("sha256")
    .update(`${BACKEND}:${VOICE_ID}:${spokenText}`)
    .digest("hex")
    .slice(0, 16);
  const cached = join(cacheDir, `${segment.id}-${key}.mp3`);

  if (existsSync(cached) && durationOf(cached) > 0.4) {
    return { path: cached, fromCache: true };
  }

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json",
          // Selects the TTS backend; reference_id below selects the voice.
          model: BACKEND,
        },
        body: JSON.stringify({
          text: spokenText,
          reference_id: VOICE_ID,
          format: "mp3",
          mp3_bitrate: 128,
          normalize: true,
          latency: "normal",
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = `${response.status} ${body.slice(0, 140)}`;
        // Quota and auth failures will not fix themselves; stop retrying.
        if (response.status === 401 || response.status === 402) break;
        await sleep(1200 * attempt);
        continue;
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length < 2000) {
        lastError = `suspiciously small response (${audio.length} bytes)`;
        await sleep(1200 * attempt);
        continue;
      }

      writeFileSync(cached, audio);

      // A valid container that ffprobe cannot read means a truncated download.
      const seconds = durationOf(cached);
      if (!Number.isFinite(seconds) || seconds < 0.4) {
        lastError = `undecodable audio (${seconds}s)`;
        await sleep(1200 * attempt);
        continue;
      }

      return { path: cached, fromCache: false };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(1200 * attempt);
    }
  }

  throw new Error(`${segment.id}: ${lastError}`);
}

mkdirSync(cacheDir, { recursive: true });

console.log(`Fish Audio · backend ${BACKEND} · voice ${VOICE_ID}`);
console.log(`${SEGMENTS.length} segments\n`);

const timings = [];
const paddedPaths = [];
let cursor = 0;

for (const segment of SEGMENTS) {
  const { path, fromCache } = await synthesise(segment);
  const spoken = durationOf(path);

  // The slot is whichever is longer: the script's budget, or what the voice
  // actually took plus a breath. Budget alone would clip a long line's tail.
  const slot = Math.max(segment.seconds, spoken + TAIL_PADDING_SECONDS);

  // Pad to the slot exactly, so concatenation needs no offset bookkeeping.
  const padded = join(cacheDir, `${segment.id}-padded.wav`);
  run("ffmpeg", [
    "-v", "error", "-y",
    "-i", path,
    "-af", `apad=whole_dur=${slot.toFixed(3)}`,
    "-ar", "44100", "-ac", "2",
    padded,
  ]);
  paddedPaths.push(padded);

  timings.push({
    id: segment.id,
    start: Number(cursor.toFixed(3)),
    end: Number((cursor + slot).toFixed(3)),
    seconds: Number(slot.toFixed(3)),
    spoken: Number(spoken.toFixed(3)),
    zh: segment.zh,
    en: segment.en,
  });

  const flag = fromCache ? "cached" : "synthesised";
  const widened = spoken + TAIL_PADDING_SECONDS > segment.seconds ? " (widened)" : "";
  console.log(
    `  ${segment.id.padEnd(10)} ${spoken.toFixed(1)}s → slot ${slot.toFixed(1)}s  ${flag}${widened}`,
  );

  cursor += slot;
}

// Concatenate in order. A list file avoids shell-quoting problems with paths.
const listPath = join(cacheDir, "concat.txt");
writeFileSync(listPath, paddedPaths.map((p) => `file '${p}'`).join("\n"));

const voicePath = join(outDir, "voice.m4a");
run("ffmpeg", [
  "-v", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", listPath,
  "-c:a", "aac", "-b:a", "160k",
  voicePath,
]);

// Subtitles come off the measured offsets, so they cannot drift from the audio.
const wrapped = timings.map((t) => ({
  ...t,
  zh: wrapCaption(t.zh, true),
  en: wrapCaption(t.en, false),
}));
writeAss(join(outDir, "subs.zh.ass"), "zh", wrapped);
writeAss(join(outDir, "subs.en.ass"), "en", wrapped);

writeFileSync(
  join(outDir, "timings.json"),
  `${JSON.stringify(
    { provider: "fish.audio", backend: BACKEND, voice: VOICE_ID, total: cursor, segments: timings },
    null,
    2,
  )}\n`,
);

const audioDuration = durationOf(voicePath);
console.log(`\nvoice.m4a     ${audioDuration.toFixed(1)}s`);
console.log(`timings.json  ${timings.length} segments, ${cursor.toFixed(1)}s`);
console.log(`subtitles     subs.zh.ass, subs.en.ass`);

if (Math.abs(audioDuration - cursor) > 0.5) {
  console.warn(
    `\nWARNING: audio is ${audioDuration.toFixed(1)}s but the timeline expects ${cursor.toFixed(1)}s`,
  );
}

/**
 * Wraps a caption onto at most two lines.
 *
 * Chinese has no spaces to break on, so it splits near the midpoint, preferring a
 * punctuation mark; English breaks on the space nearest the middle. Two lines is
 * the ceiling before captions start covering the UI they describe.
 */
function wrapCaption(text, isChinese) {
  const limit = isChinese ? 26 : 62;
  if (text.length <= limit) return text;

  if (isChinese) {
    const mid = Math.ceil(text.length / 2);
    for (let offset = 0; offset < 8; offset += 1) {
      for (const sign of ["，", "。", "、", "：", "——"]) {
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
