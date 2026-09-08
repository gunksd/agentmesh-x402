/**
 * Writes ASS subtitle files with styling baked into the header.
 *
 * Not force_style. Passing styles through the ffmpeg filtergraph means every
 * comma inside `force_style=` reads as a filter argument separator, and quoting
 * around it does not survive the parser — that is what broke the first mux
 * attempt. Styling in the file itself removes the escaping problem entirely: the
 * filter becomes `subtitles=path.ass` with no options to mis-parse.
 *
 * Colours are ASS's &HAABBGGRR — alpha first, then blue, green, red, which is
 * reversed from CSS. With BorderStyle=3 libass fills the caption box using
 * OutlineColour and treats Outline as its padding.
 */

import { writeFileSync } from "node:fs";

/** Matches the recording, so PlayRes maps 1:1 onto video pixels. */
const PLAY_RES = { x: 1280, y: 720 };

/** ASS timestamps are H:MM:SS.cc — centiseconds, single-digit hour. */
function assTime(seconds) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    cs === 100 ? 99 : cs,
  ).padStart(2, "0")}`;
}

/**
 * Style presets.
 *
 * Chinese sits above English because the voice-over is Mandarin — the line being
 * spoken should be nearer the action. English is smaller and dimmer so the pair
 * reads as primary plus gloss rather than two lines competing for attention.
 */
const STYLES = {
  zh: {
    fontName: "PingFang SC",
    fontSize: 30,
    primary: "&H00FFFFFF",
    outline: "&H96140A0A",
    bold: -1,
    marginV: 96,
    outlineWidth: 6,
  },
  en: {
    fontName: "Helvetica Neue",
    fontSize: 21,
    primary: "&H00DCDCDC",
    outline: "&H8C140A0A",
    bold: 0,
    marginV: 44,
    outlineWidth: 5,
  },
};

/**
 * Builds one ASS file.
 *
 * @param {string} path      Output path.
 * @param {'zh'|'en'} lang   Which style preset and which text field to use.
 * @param {{start:number,end:number,zh:string,en:string}[]} segments
 */
export function writeAss(path, lang, segments) {
  const style = STYLES[lang];

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${PLAY_RES.x}`,
    `PlayResY: ${PLAY_RES.y}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Alignment 2 = bottom centre. BorderStyle 3 = opaque box behind the text.
    `Style: Caption,${style.fontName},${style.fontSize},${style.primary},&H000000FF,${style.outline},&H00000000,${style.bold},0,0,0,100,100,0,0,3,${style.outlineWidth},0,2,80,80,${style.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = segments.map((segment) => {
    // ASS uses \N for a hard line break, and commas would split the event fields.
    const text = segment[lang].replace(/\n/g, "\\N").replace(/,/g, "，");
    // Trim the tail so consecutive captions do not visually overlap.
    return `Dialogue: 0,${assTime(segment.start)},${assTime(
      segment.end - 0.1,
    )},Caption,,0,0,0,,${text}`;
  });

  writeFileSync(path, `${[...header, ...events].join("\n")}\n`);
}
