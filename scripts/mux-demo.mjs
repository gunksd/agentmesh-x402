/**
 * Muxes the recording with the narration track.
 *
 *   node scripts/mux-demo.mjs
 *
 * Produces docs/agentmesh-demo.mp4 — H.264 + AAC, with the bilingual captions
 * already in the picture.
 *
 * Captions are not applied here. Homebrew's ffmpeg is built without libass, so the
 * `subtitles` filter does not exist — `-vf subtitles=…` fails with a misleading
 * "No option name near <path>" that looks like a quoting problem and is really a
 * missing filter. They are drawn as a DOM overlay during recording instead, which
 * also means one timeline drives picture and text so the two cannot drift.
 *
 * The .ass files are still written, for anyone wanting a soft subtitle track.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const recordingDir = join(root, "docs", "recording");
const narrationDir = join(root, "docs", "narration");
const outputPath = join(root, "docs", "agentmesh-demo.mp4");

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

/** Newest .webm in the recording directory. */
function findRecording() {
  if (!existsSync(recordingDir)) return null;
  const files = readdirSync(recordingDir)
    .filter((name) => name.endsWith(".webm"))
    .map((name) => join(recordingDir, name));
  if (files.length === 0) return null;

  return files.sort(
    (a, b) =>
      Number(run("stat", ["-f", "%m", b]).trim()) -
      Number(run("stat", ["-f", "%m", a]).trim()),
  )[0];
}

const videoPath = findRecording();
const voicePath = join(narrationDir, "voice.m4a");
for (const [label, path] of [
  ["recording", videoPath],
  ["voice", voicePath],
]) {
  if (!path || !existsSync(path)) {
    console.error(`Missing ${label}. Run build-narration.mjs then record-demo.mjs.`);
    process.exit(1);
  }
}

const videoDuration = durationOf(videoPath);
const audioDuration = durationOf(voicePath);

/**
 * Head of blank loading page to discard.
 *
 * Playwright starts capturing at newPage(), but narration begins only once the
 * page has loaded and settled. Without trimming, every shot lands that many
 * seconds after the line describing it — measured at a constant +4.1s before this
 * was added. The recorder writes the offset it observed; falling back to 0 keeps
 * an older recording usable.
 */
const offsetPath = join(recordingDir, "offset.json");
const headOffset = existsSync(offsetPath)
  ? (JSON.parse(readFileSync(offsetPath, "utf8")).headOffsetSeconds ?? 0)
  : 0;

console.log(
  `video ${videoDuration.toFixed(1)}s   audio ${audioDuration.toFixed(1)}s   trim ${headOffset.toFixed(2)}s`,
);

if (videoDuration + 1.5 < audioDuration) {
  console.warn(
    `\nWARNING: video is ${(audioDuration - videoDuration).toFixed(1)}s shorter than the\n` +
      `narration, so the closing line would be cut.`,
  );
}

console.log("\nEncoding...");

run("ffmpeg", [
  "-v", "error", "-y",
  // Placed before -i so the seek applies to the input rather than the output.
  ...(headOffset > 0.05 ? ["-ss", headOffset.toFixed(3)] : []),
  "-i", videoPath,
  "-i", voicePath,
  "-vf", "fps=30",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "slow",
  "-c:a", "aac", "-b:a", "128k",
  "-shortest",
  "-movflags", "+faststart",
  outputPath,
]);

const finalDuration = durationOf(outputPath);
const size = (Number(run("stat", ["-f", "%z", outputPath]).trim()) / 1e6).toFixed(1);

console.log(`\n${outputPath}`);
console.log(`  ${finalDuration.toFixed(1)}s   ${size}MB   H.264 + AAC, captions in-frame`);
