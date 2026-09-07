"use client";

/**
 * ShapeGrid — a drifting grid of outlined shapes that fill under the cursor,
 * leaving a short trail behind it.
 *
 * Replaces the earlier lift/tilt backdrop. That one deformed a lattice under the
 * pointer; this one keeps the surface flat and expresses interaction purely
 * through fill, which is quieter behind a headline and much cheaper to draw.
 *
 * Canvas, one pass per frame. An equivalent DOM version needed a style write per
 * shape per frame and held ~30fps at this density; here a frame is a few hundred
 * stroke calls against a single context, which stays at 60.
 *
 * The drift is done by offsetting the *sample point* rather than moving anything:
 * shapes stay on a fixed pixel grid, and the pattern appears to travel because
 * which grid slot is "on" shifts over time. Nothing is ever re-laid-out.
 */

import { useEffect, useRef } from "react";

export type ShapeKind = "square" | "hexagon" | "circle" | "triangle";
export type Direction = "up" | "down" | "left" | "right" | "diagonal";

export interface ShapeGridProps {
  /** Cells travelled per second. */
  speed?: number;
  /** Cell pitch in CSS pixels. */
  squareSize?: number;
  direction?: Direction;
  borderColor?: string;
  /** Fill for the shape directly under the cursor. */
  hoverFillColor?: string;
  shape?: ShapeKind;
  /** How many previously-hovered shapes stay lit behind the cursor. */
  hoverTrailAmount?: number;
  /** Fill for trailing shapes, which fade out along the trail. */
  hoverColor?: string;
  className?: string;
}

/** Parses #rgb, #rrggbb, or rgb()/rgba() into channels for alpha compositing. */
function parseColour(input: string): { r: number; g: number; b: number; a: number } {
  const value = input.trim();

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = hex.length === 3 || hex.length === 4;
    const step = expand ? 1 : 2;
    const read = (index: number) => {
      const part = hex.slice(index * step, index * step + step);
      const full = expand ? part + part : part;
      return parseInt(full, 16);
    };
    return {
      r: read(0),
      g: read(1),
      b: read(2),
      a: hex.length === 4 || hex.length === 8 ? read(3) / 255 : 1,
    };
  }

  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return {
      r: parts[0] ?? 0,
      g: parts[1] ?? 0,
      b: parts[2] ?? 0,
      a: parts[3] ?? 1,
    };
  }

  // Unrecognised input falls back to the project ink rather than throwing.
  return { r: 10, g: 22, b: 40, a: 1 };
}

/** Traces one shape centred in its cell. Radius is inset so lines never touch. */
function traceShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeKind,
  cx: number,
  cy: number,
  size: number,
) {
  const half = size / 2;

  ctx.beginPath();

  switch (shape) {
    case "circle":
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      break;

    case "triangle": {
      // Centroid-balanced so the shape sits optically centred, not top-heavy.
      const height = size * 0.92;
      ctx.moveTo(cx, cy - height / 2);
      ctx.lineTo(cx + half, cy + height / 2);
      ctx.lineTo(cx - half, cy + height / 2);
      ctx.closePath();
      break;
    }

    case "hexagon": {
      // Flat-top orientation, which tiles more evenly on a square pitch.
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i;
        const x = cx + half * Math.cos(angle);
        const y = cy + half * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }

    default: {
      // Square corners: once cells tile flush, a radius leaves visible gaps at
      // every junction. Offset by half a pixel so a 1px stroke lands on the
      // pixel grid instead of straddling two and rendering soft.
      ctx.rect(
        Math.round(cx - half) + 0.5,
        Math.round(cy - half) + 0.5,
        size,
        size,
      );
      break;
    }
  }
}

export function ShapeGrid({
  speed = 0.5,
  squareSize = 40,
  direction = "diagonal",
  borderColor = "#d4d4d8",
  hoverFillColor = "#222",
  shape = "square",
  hoverTrailAmount = 5,
  hoverColor = "#27272a",
  className,
}: ShapeGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Live props, read inside the loop without restarting it. */
  const propsRef = useRef({
    speed,
    squareSize,
    direction,
    borderColor,
    hoverFillColor,
    shape,
    hoverTrailAmount,
    hoverColor,
  });
  propsRef.current = {
    speed,
    squareSize,
    direction,
    borderColor,
    hoverFillColor,
    shape,
    hoverTrailAmount,
    hoverColor,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let startTime = performance.now();

    let pointerX = -9999;
    let pointerY = -9999;
    let pointerInside = false;

    /** Recently hovered cells, newest first. Length is capped by the trail size. */
    let trail: { column: number; row: number }[] = [];

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;

      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Fades the grid out toward the bottom, matching the CSS mask on the static
     * grid so the layers blend instead of stacking into a hard edge.
     */
    function verticalFade(y: number): number {
      return Math.max(0, 1 - Math.min(1, y / height) * 1.26);
    }

    /** Drift offset in pixels for the current time, per direction. */
    function driftOffset(elapsedSeconds: number, pitch: number) {
      const travelled = elapsedSeconds * propsRef.current.speed * pitch;

      switch (propsRef.current.direction) {
        case "up":
          return { x: 0, y: travelled };
        case "down":
          return { x: 0, y: -travelled };
        case "left":
          return { x: travelled, y: 0 };
        case "right":
          return { x: -travelled, y: 0 };
        default:
          return { x: -travelled, y: -travelled };
      }
    }

    function render(now: number) {
      const {
        squareSize: pitch,
        borderColor: border,
        hoverFillColor: hoverFill,
        hoverColor: trailFill,
        hoverTrailAmount: trailLength,
        shape: kind,
      } = propsRef.current;

      const ctx = context!;
      ctx.clearRect(0, 0, width, height);

      const elapsed = (now - startTime) / 1000;
      const drift = reduceMotion ? { x: 0, y: 0 } : driftOffset(elapsed, pitch);

      // Wrap the drift into one cell: beyond that the pattern repeats, so there
      // is no need to track unbounded travel.
      const offsetX = ((drift.x % pitch) + pitch) % pitch;
      const offsetY = ((drift.y % pitch) + pitch) % pitch;

      const borderRgb = parseColour(border);
      const hoverRgb = parseColour(hoverFill);
      const trailRgb = parseColour(trailFill);

      // Full pitch, so adjacent shapes share an edge and the borders read as one
      // continuous grid rather than a field of separate little boxes. Non-square
      // shapes keep an inset, since circles and triangles cannot tile flush.
      const shapeSize = kind === "square" ? pitch : pitch * 0.72;
      const columns = Math.ceil(width / pitch) + 2;
      const rows = Math.ceil(height / pitch) + 2;

      // Which cell the cursor is over, in the same coordinates the shapes use.
      let hoverColumn = -9999;
      let hoverRow = -9999;
      if (pointerInside) {
        hoverColumn = Math.floor((pointerX - offsetX + pitch) / pitch);
        hoverRow = Math.floor((pointerY - offsetY + pitch) / pitch);
      }

      ctx.lineWidth = 1;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const cx = column * pitch + offsetX - pitch / 2;
          const cy = row * pitch + offsetY - pitch / 2;

          if (cx < -pitch || cx > width + pitch) continue;

          const fade = verticalFade(cy);
          if (fade <= 0.01) continue;

          traceShape(ctx, kind, cx, cy, shapeSize);

          // Fill priority: the hovered cell, then its trail, then nothing.
          if (column === hoverColumn && row === hoverRow) {
            ctx.fillStyle = `rgba(${hoverRgb.r},${hoverRgb.g},${hoverRgb.b},${(hoverRgb.a * fade).toFixed(3)})`;
            ctx.fill();
          } else if (trailLength > 0) {
            const position = trail.findIndex(
              (cell) => cell.column === column && cell.row === row,
            );
            if (position >= 0) {
              // Older entries sit further back and fade toward transparent.
              const strength = 1 - position / (trailLength + 1);
              ctx.fillStyle = `rgba(${trailRgb.r},${trailRgb.g},${trailRgb.b},${(
                trailRgb.a *
                strength *
                0.55 *
                fade
              ).toFixed(3)})`;
              ctx.fill();
            }
          }

          ctx.strokeStyle = `rgba(${borderRgb.r},${borderRgb.g},${borderRgb.b},${(borderRgb.a * fade).toFixed(3)})`;
          ctx.stroke();
        }
      }

      frame = requestAnimationFrame(render);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      pointerInside =
        pointerX >= 0 && pointerX <= width && pointerY >= 0 && pointerY <= height;

      if (!pointerInside) return;

      const { squareSize: pitch, hoverTrailAmount: trailLength } =
        propsRef.current;
      if (trailLength <= 0) return;

      // Record the hovered cell in grid space so the trail drifts with the
      // pattern rather than staying pinned to the screen.
      const elapsed = (performance.now() - startTime) / 1000;
      const drift = reduceMotion ? { x: 0, y: 0 } : driftOffset(elapsed, pitch);
      const offsetX = ((drift.x % pitch) + pitch) % pitch;
      const offsetY = ((drift.y % pitch) + pitch) % pitch;

      const column = Math.floor((pointerX - offsetX + pitch) / pitch);
      const row = Math.floor((pointerY - offsetY + pitch) / pitch);

      const head = trail[0];
      if (head && head.column === column && head.row === row) return;

      trail.unshift({ column, row });
      if (trail.length > trailLength) trail.length = trailLength;
    }

    function onPointerLeave() {
      pointerInside = false;
      trail = [];
    }

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? "pointer-events-none absolute inset-0 size-full"}
    />
  );
}

export default ShapeGrid;
