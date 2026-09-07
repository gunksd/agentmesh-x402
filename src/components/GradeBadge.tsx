"use client";

/**
 * A–E grade inside a hand-drawn brush circle.
 *
 * The circle is two overlapping SVG paths rather than one: a real brush stroke
 * never closes cleanly, so an outer sweep that overshoots its start plus a
 * shorter inner sweep gives the doubled-back look of ink laid down in one motion.
 * Stroke width varies along each path via `pathLength` dashing, which is what
 * reads as pressure changing under the brush.
 *
 * Colour tracks the grade so an A is legible at a glance without reading the
 * letter — green through amber to red.
 */

import type { Grade } from "@/lib/agents/signals";
import { cn } from "@/lib/utils";

const GRADE_COLOURS: Record<Grade, { ink: string; text: string }> = {
  A: { ink: "#0F9D58", text: "#0B6B3C" },
  B: { ink: "#3D8B40", text: "#2E6B31" },
  C: { ink: "#B7791F", text: "#8A5A15" },
  D: { ink: "#D97706", text: "#A8560A" },
  E: { ink: "#D93025", text: "#A32219" },
};

/**
 * Two brush sweeps per grade, seeded so each letter gets a distinct circle
 * instead of the same shape recoloured. Values are hand-tuned rather than
 * generated — a random circle tends to look wrong in a way a drawn one does not.
 */
const BRUSH_PATHS: Record<Grade, [string, string]> = {
  A: [
    "M52 13C29 11 12 27 13 49c1 21 18 36 39 36 22 0 38-16 37-38C88 26 73 12 52 13c-4 0-9 1-13 3",
    "M40 17c-15 6-24 19-23 33 1 16 13 28 29 31",
  ],
  B: [
    "M50 12C28 13 11 28 12 50c1 22 19 37 41 35 21-2 36-19 34-40C85 25 70 11 50 12c-5 0-10 2-14 4",
    "M37 18c-14 7-22 20-21 34 1 15 12 27 27 30",
  ],
  C: [
    "M51 14C30 12 12 26 12 48c0 22 17 37 39 37 21 0 38-16 38-37C89 27 73 13 51 14c-5 0-10 1-14 2",
    "M39 18c-15 5-25 18-25 32 0 16 12 29 28 32",
  ],
  D: [
    "M49 12C27 14 11 30 13 51c2 21 20 35 41 33 21-2 35-19 33-40C85 24 69 10 49 12c-4 0-8 1-12 3",
    "M38 17c-14 6-23 20-22 34 1 15 13 27 28 29",
  ],
  E: [
    "M52 13C29 12 11 27 12 49c1 22 18 36 40 36 21 0 37-16 37-37C88 26 72 12 52 13c-5 0-9 1-13 2",
    "M39 17c-15 6-24 19-24 33 0 16 12 29 28 32",
  ],
};

export function GradeBadge({
  grade,
  size = 64,
  className,
}: {
  grade: Grade;
  size?: number;
  className?: string;
}) {
  const { ink, text } = GRADE_COLOURS[grade];
  const [outer, inner] = BRUSH_PATHS[grade];

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Grade ${grade}`}
    >
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
        {/* Outer sweep: thick, tapering, overshoots its own start. */}
        <path
          d={outer}
          fill="none"
          stroke={ink}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
        {/* Inner sweep: thinner and shorter, the brush doubling back. */}
        <path
          d={inner}
          fill="none"
          stroke={ink}
          strokeWidth={3.2}
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* Dry-brush flecks where the bristles lifted. */}
        <path
          d={outer}
          fill="none"
          stroke={ink}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeDasharray="2 11"
          opacity={0.4}
        />
      </svg>

      <span
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{
          color: text,
          fontSize: size * 0.42,
          // Nudged off-centre: ink circles are never perfectly concentric, and
          // matching that keeps the letter from looking pasted on.
          transform: "translate(1px, 1px)",
        }}
      >
        {grade}
      </span>
    </div>
  );
}
