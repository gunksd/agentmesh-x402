"use client";

/**
 * Interactive grid backdrop, neo-brutalist tiles.
 *
 * Each tile rests almost flat, then lifts toward the cursor with a hard black
 * offset shadow and tilts in 3D around the point the cursor sits over — with the
 * cursor to a tile's left, its left edge comes forward and the tile appears to
 * lean right.
 *
 * Driven from one pointer listener rather than CSS `:hover`. The hero's headline
 * and buttons sit above this layer, and `:hover` would leave a dead zone wherever
 * text covers a tile; one listener keeps the whole surface responsive.
 *
 * Tiles are real DOM nodes because the effect needs per-tile 3D transforms and
 * box shadows, which a canvas cannot express. Cost stays low by writing styles
 * only for tiles inside the cursor's radius — roughly 25 of ~300 per frame — and
 * writing a resting state once as each one settles.
 */

import { useEffect, useRef } from "react";

/** Matches the 56px background-size of `.grid-backdrop` so tiles sit on the lines. */
const CELL = 56;

/** Inset inside each cell, leaving the underlying grid line visible as a gutter. */
const INSET = 3;

/** Reach of the cursor's influence, in pixels. */
const INFLUENCE = 150;

/** Peak values for a tile directly under the cursor. */
const MAX_SHIFT_PX = 4;
const MAX_SHADOW_PX = 9;
const MAX_LIFT_Z = 26;
const MAX_TILT_DEG = 14;

/** Spring constants. Damping under 1 leaves slight overshoot so tiles settle. */
const STIFFNESS = 0.16;
const DAMPING = 0.78;

/** Below this a tile counts as resting and stops being written to. */
const REST_EPSILON = 0.002;

/** Resting shadow and border, near-invisible against the white hero. */
const REST_SHADOW = "2px 2px 0 rgba(10,22,40,0.045)";
const REST_BORDER = "rgba(10,22,40,0.05)";

interface Tile {
  element: HTMLDivElement;
  /** Centre in layer coordinates, for distance and tilt maths. */
  centreX: number;
  centreY: number;
  /** Current lift, 0..1. */
  lift: number;
  velocity: number;
  /** Smoothed tilt in degrees, so direction changes ease rather than snap. */
  tiltX: number;
  tiltY: number;
  /** Whether the resting style has already been written. */
  resting: boolean;
}

export function GridBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let tiles: Tile[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    // Off-layer until the pointer actually arrives, so nothing lifts on load.
    let pointerX = -9999;
    let pointerY = -9999;
    let pointerInside = false;

    /**
     * Fades tiles out toward the bottom, matching the CSS mask on the static grid
     * so the two layers blend instead of stacking into a hard edge.
     */
    function verticalFade(y: number): number {
      return Math.max(0, 1 - Math.min(1, y / height) * 1.3);
    }

    function build() {
      const rect = host!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      host!.textContent = "";
      tiles = [];

      const columns = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);

      const fragment = document.createDocumentFragment();

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * CELL;
          const y = row * CELL;

          // Skip tiles the mask would hide anyway.
          if (verticalFade(y) <= 0) continue;

          const element = document.createElement("div");
          element.style.cssText =
            `position:absolute;left:${x + INSET}px;top:${y + INSET}px;` +
            `width:${CELL - INSET * 2}px;height:${CELL - INSET * 2}px;` +
            `border-radius:7px;background:#fff;` +
            `border:1px solid ${REST_BORDER};box-shadow:${REST_SHADOW};` +
            `transform-style:preserve-3d;will-change:transform,box-shadow;`;

          fragment.appendChild(element);
          tiles.push({
            element,
            centreX: x + CELL / 2,
            centreY: y + CELL / 2,
            lift: 0,
            velocity: 0,
            tiltX: 0,
            tiltY: 0,
            resting: true,
          });
        }
      }

      host!.appendChild(fragment);
    }

    /** Writes the neutral style once, when a tile finishes settling. */
    function rest(tile: Tile) {
      tile.element.style.transform = "";
      tile.element.style.boxShadow = REST_SHADOW;
      tile.element.style.borderColor = REST_BORDER;
      tile.element.style.zIndex = "";
      tile.resting = true;
    }

    function render() {
      for (const tile of tiles) {
        let target = 0;
        let tiltTargetX = 0;
        let tiltTargetY = 0;

        if (pointerInside) {
          const dx = pointerX - tile.centreX;
          const dy = pointerY - tile.centreY;
          const distance = Math.hypot(dx, dy);

          if (distance < INFLUENCE) {
            // Cosine falloff: flat-topped near the cursor, easing to zero at the
            // edge, so the influence circle shows no visible rim.
            target = (Math.cos((distance / INFLUENCE) * Math.PI) + 1) / 2;

            // Tilt away from the cursor. rotateY follows horizontal offset and
            // rotateX inverts vertical offset, so the edge nearest the cursor
            // comes forward — cursor on the left tilts the tile to lean right.
            const reach = INFLUENCE * 0.75;
            tiltTargetX =
              (-dy / reach) * MAX_TILT_DEG * target * -1;
            tiltTargetY = (dx / reach) * MAX_TILT_DEG * target * -1;
          }
        }

        const displacement = target - tile.lift;
        tile.velocity = (tile.velocity + displacement * STIFFNESS) * DAMPING;
        tile.lift = Math.min(1, Math.max(0, tile.lift + tile.velocity));

        // Ease the tilt separately so swinging the cursor across a tile does not
        // flip its lean instantly.
        tile.tiltX += (tiltTargetX - tile.tiltX) * 0.18;
        tile.tiltY += (tiltTargetY - tile.tiltY) * 0.18;

        if (tile.lift < REST_EPSILON) {
          if (!tile.resting) rest(tile);
          continue;
        }

        const amount = tile.lift * verticalFade(tile.centreY);
        if (amount <= 0) {
          if (!tile.resting) rest(tile);
          continue;
        }

        const shift = amount * MAX_SHIFT_PX;
        const shadow = 2 + amount * MAX_SHADOW_PX;

        const style = tile.element.style;
        // Move up-left and forward in Z, then tilt: the classic hard-shadow lift.
        style.transform =
          `perspective(620px) translate3d(${-shift}px,${-shift}px,${amount * MAX_LIFT_Z}px) ` +
          `rotateX(${tile.tiltX.toFixed(2)}deg) rotateY(${tile.tiltY.toFixed(2)}deg)`;
        style.boxShadow =
          `${shadow.toFixed(1)}px ${shadow.toFixed(1)}px 0 rgba(10,22,40,${(0.055 + amount * 0.5).toFixed(3)})`;
        style.borderColor = `rgba(10,22,40,${(0.05 + amount * 0.55).toFixed(3)})`;
        style.zIndex = String(1 + Math.round(amount * 10));
        tile.resting = false;
      }

      frame = requestAnimationFrame(render);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      pointerInside =
        pointerX >= 0 && pointerX <= width && pointerY >= 0 && pointerY <= height;
    }

    function onPointerLeave() {
      pointerInside = false;
    }

    build();

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      build();
      if (!reduceMotion) frame = requestAnimationFrame(render);
    });
    observer.observe(host);

    // A static grid with no motion satisfies the reduced-motion preference.
    if (reduceMotion) {
      return () => observer.disconnect();
    }

    // Listen on the window: the headline and buttons sit above this layer, and a
    // per-tile hover would go dead wherever content covers a tile.
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
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ perspective: "620px" }}
    />
  );
}
