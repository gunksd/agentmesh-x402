"use client";

/**
 * Squircle Shift — morphing squircle background.
 *
 * A hand-written stand-in for React Bits Pro's component of the same name, which
 * needs a license key this project does not have. Same idea, built on the CSS
 * primitive rather than a bundled library:
 *
 *   `corner-shape: superellipse(k)` controls how square a corner is. k=2 is a
 *   plain circular round; higher values push toward a squircle and then a square.
 *   Animating k is what "morphing squircle" means here — the silhouette changes
 *   without the box ever resizing.
 *
 * Two motions run at once. An ambient diagonal wave keeps every tile slowly
 * shifting between near-square and squircle, so the surface is alive before
 * anyone touches it. On top of that, tiles near the cursor lift with a hard
 * offset shadow and tilt in 3D toward the pointer, morphing rounder as they rise.
 *
 * Browsers without `corner-shape` still get the wave through border-radius, which
 * is why the radius is animated alongside k rather than instead of it.
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

/** Superellipse exponent: ambient midpoint, wave amplitude, and lifted target. */
const AMBIENT_K = 4.4;
const AMBIENT_K_SWING = 0.9;
const LIFT_K = 1.9;

/** Corner radius, in px, at ambient midpoint and fully lifted. */
const AMBIENT_RADIUS = 7.5;
const AMBIENT_RADIUS_SWING = 1.5;
const LIFT_RADIUS = 15;

/** Ambient wave speed and how much phase each cell adds along the diagonal. */
const WAVE_SPEED = 0.00055;
const WAVE_PHASE_PER_CELL = 0.5;

/** Spring constants. Damping under 1 leaves slight overshoot so tiles settle. */
const STIFFNESS = 0.16;
const DAMPING = 0.78;

/** Below this a tile counts as resting. */
const REST_EPSILON = 0.002;

const REST_SHADOW = "2px 2px 0 rgba(10,22,40,0.045)";
const REST_BORDER = "rgba(10,22,40,0.05)";

/** Detected once: writing an unsupported property every frame is wasted work. */
const SUPPORTS_SQUIRCLE =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("corner-shape", "superellipse(2)");

interface Tile {
  element: HTMLDivElement;
  /** Centre in layer coordinates, for distance and tilt maths. */
  centreX: number;
  centreY: number;
  /** Phase offset along the diagonal, so the ambient wave travels. */
  phase: number;
  /** Current lift, 0..1. */
  lift: number;
  velocity: number;
  /** Smoothed tilt in degrees, so direction changes ease rather than snap. */
  tiltX: number;
  tiltY: number;
}

export function SquircleShift() {
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

    // Off-layer until the pointer arrives, so nothing lifts on load.
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
            `border-radius:${AMBIENT_RADIUS}px;background:#fff;` +
            (SUPPORTS_SQUIRCLE ? `corner-shape:superellipse(${AMBIENT_K});` : "") +
            `border:1px solid ${REST_BORDER};box-shadow:${REST_SHADOW};` +
            `transform-style:preserve-3d;will-change:transform,box-shadow;`;

          fragment.appendChild(element);
          tiles.push({
            element,
            centreX: x + CELL / 2,
            centreY: y + CELL / 2,
            // Diagonal phase makes the wave sweep rather than pulse in unison.
            phase: (column + row) * WAVE_PHASE_PER_CELL,
            lift: 0,
            velocity: 0,
            tiltX: 0,
            tiltY: 0,
          });
        }
      }

      host!.appendChild(fragment);
    }

    function render(time: number) {
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

            // Tilt so the edge nearest the cursor comes forward: with the cursor
            // to a tile's left, the tile leans right.
            const reach = INFLUENCE * 0.75;
            tiltTargetX = (dy / reach) * MAX_TILT_DEG * target;
            tiltTargetY = (-dx / reach) * MAX_TILT_DEG * target;
          }
        }

        const displacement = target - tile.lift;
        tile.velocity = (tile.velocity + displacement * STIFFNESS) * DAMPING;
        tile.lift = Math.min(1, Math.max(0, tile.lift + tile.velocity));

        // Ease tilt separately so sweeping across a tile does not flip its lean.
        tile.tiltX += (tiltTargetX - tile.tiltX) * 0.18;
        tile.tiltY += (tiltTargetY - tile.tiltY) * 0.18;

        const fade = verticalFade(tile.centreY);
        const amount = tile.lift * fade;

        // Ambient wave: a slow travelling shift between square and squircle.
        const wave = Math.sin(time * WAVE_SPEED + tile.phase);
        const ambientK = AMBIENT_K + wave * AMBIENT_K_SWING;
        const ambientRadius = AMBIENT_RADIUS + wave * AMBIENT_RADIUS_SWING;

        // Lift pulls the corners rounder, overriding the ambient value.
        const k = ambientK + (LIFT_K - ambientK) * amount;
        const radius = ambientRadius + (LIFT_RADIUS - ambientRadius) * amount;

        const style = tile.element.style;
        style.borderRadius = `${radius.toFixed(2)}px`;
        if (SUPPORTS_SQUIRCLE) {
          style.setProperty("corner-shape", `superellipse(${k.toFixed(2)})`);
        }

        if (tile.lift < REST_EPSILON) {
          // Resting: clear the lift styling but leave the ambient morph running.
          style.transform = "";
          style.boxShadow = REST_SHADOW;
          style.borderColor = REST_BORDER;
          style.zIndex = "";
          continue;
        }

        const shift = amount * MAX_SHIFT_PX;
        const shadow = 2 + amount * MAX_SHADOW_PX;

        // Move up-left and forward in Z, then tilt: the classic hard-shadow lift.
        style.transform =
          `perspective(620px) translate3d(${-shift}px,${-shift}px,${amount * MAX_LIFT_Z}px) ` +
          `rotateX(${tile.tiltX.toFixed(2)}deg) rotateY(${tile.tiltY.toFixed(2)}deg)`;
        style.boxShadow =
          `${shadow.toFixed(1)}px ${shadow.toFixed(1)}px 0 rgba(10,22,40,${(0.055 + amount * 0.5).toFixed(3)})`;
        style.borderColor = `rgba(10,22,40,${(0.05 + amount * 0.55).toFixed(3)})`;
        style.zIndex = String(1 + Math.round(amount * 10));
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
    // per-tile :hover would go dead wherever content covers a tile.
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
