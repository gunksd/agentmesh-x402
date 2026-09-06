"use client";

/**
 * Interactive grid backdrop.
 *
 * Tiles near the cursor lift, then spring back down when it leaves. Drawn on one
 * canvas rather than a few hundred DOM nodes: transforming that many elements
 * per frame drops frames on a laptop, while a single canvas stays at 60fps and
 * lets the particles share the same loop.
 *
 * The static grid lines stay in CSS (`.grid-backdrop`), so the layout still looks
 * right before this mounts and with JavaScript disabled. This layer only adds
 * what needs to move: tile lift, cursor light, and drifting motes.
 */

import { useEffect, useRef } from "react";

/** Matches the 56px background-size of `.grid-backdrop` so tiles align to it. */
const CELL = 56;

/** How far the cursor's influence reaches, in pixels. */
const INFLUENCE = 168;

/** Peak lift of a tile directly under the cursor. */
const MAX_LIFT_PX = 7;

/**
 * Spring constants. Stiffness sets how eagerly a tile rises; damping below 1
 * leaves a little overshoot so tiles settle rather than snap — that slight
 * bounce is what makes the surface read as physical.
 */
const STIFFNESS = 0.14;
const DAMPING = 0.82;

/** Below this the tile is treated as resting and skipped. */
const REST_EPSILON = 0.0015;

const PARTICLE_COUNT = 26;

interface Particle {
  x: number;
  y: number;
  /** Radius in CSS pixels. */
  radius: number;
  /** Upward drift, px per second. */
  speed: number;
  /** Horizontal sway offset and rate. */
  phase: number;
  sway: number;
  alpha: number;
}

export function GridBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    // Honour the OS setting: paint the grid once, statically, and stop.
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;

    /** Current lift per tile, 0..1, row-major. */
    let lift = new Float32Array(0);
    /** Velocity per tile, for the spring. */
    let velocity = new Float32Array(0);

    let particles: Particle[] = [];

    // Off-canvas by default so nothing lifts until the pointer actually arrives.
    let pointerX = -9999;
    let pointerY = -9999;
    let pointerInside = false;

    let frame = 0;
    let lastTime = performance.now();

    function seedParticles() {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.7 + Math.random() * 1.5,
        speed: 5 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        sway: 0.25 + Math.random() * 0.55,
        alpha: 0.16 + Math.random() * 0.3,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      // Cap DPR at 2: beyond that the extra pixels cost fill rate and buy nothing
      // visible for shapes this soft.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;

      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;

      lift = new Float32Array(columns * rows);
      velocity = new Float32Array(columns * rows);

      seedParticles();
    }

    /**
     * Fades the whole layer out toward the bottom, matching the CSS mask on the
     * static grid so the two blend instead of stacking into a hard edge.
     */
    function verticalFade(y: number): number {
      const t = Math.min(1, Math.max(0, y / height));
      return Math.max(0, 1 - t * 1.35);
    }

    function drawTiles() {
      const ctx = context!;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          const amount = lift[index];
          if (amount < REST_EPSILON) continue;

          const x = column * CELL;
          const y = row * CELL;

          const fade = verticalFade(y);
          if (fade <= 0) continue;

          // Lift reads as a tile rising toward the light: it shifts up, brightens,
          // and gains a soft shadow underneath.
          const rise = amount * MAX_LIFT_PX;
          const inset = 1.5;
          const size = CELL - inset * 2;

          ctx.save();
          ctx.translate(x + inset, y + inset - rise);

          // Shadow cast down onto the surface below.
          ctx.fillStyle = `rgba(10, 22, 40, ${0.05 * amount * fade})`;
          ctx.beginPath();
          ctx.roundRect(0, rise * 0.6, size, size, 7);
          ctx.fill();

          // Tile face, tinted with the brand blue.
          ctx.fillStyle = `rgba(11, 99, 246, ${0.055 * amount * fade})`;
          ctx.beginPath();
          ctx.roundRect(0, 0, size, size, 7);
          ctx.fill();

          // Top edge highlight, the specular hint that sells the lift.
          ctx.strokeStyle = `rgba(11, 99, 246, ${0.3 * amount * fade})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(0.5, 0.5, size - 1, size - 1, 7);
          ctx.stroke();

          ctx.restore();
        }
      }
    }

    /** Soft radial glow following the cursor. */
    function drawCursorLight() {
      if (!pointerInside) return;
      const ctx = context!;

      const fade = verticalFade(pointerY);
      if (fade <= 0) return;

      const gradient = ctx.createRadialGradient(
        pointerX,
        pointerY,
        0,
        pointerX,
        pointerY,
        INFLUENCE * 1.15,
      );
      gradient.addColorStop(0, `rgba(11, 99, 246, ${0.09 * fade})`);
      gradient.addColorStop(0.45, `rgba(11, 99, 246, ${0.035 * fade})`);
      gradient.addColorStop(1, "rgba(11, 99, 246, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(
        pointerX - INFLUENCE * 1.2,
        pointerY - INFLUENCE * 1.2,
        INFLUENCE * 2.4,
        INFLUENCE * 2.4,
      );
    }

    function drawParticles(deltaSeconds: number, time: number) {
      const ctx = context!;

      for (const particle of particles) {
        particle.y -= particle.speed * deltaSeconds;
        // Recycle at the bottom once a mote drifts off the top.
        if (particle.y < -8) {
          particle.y = height + 8;
          particle.x = Math.random() * width;
        }

        const drift =
          Math.sin(time * 0.00042 * particle.sway + particle.phase) * 12;
        const x = particle.x + drift;
        const fade = verticalFade(particle.y);
        if (fade <= 0) continue;

        // Motes brighten near the cursor, tying them to the interaction.
        let boost = 1;
        if (pointerInside) {
          const distance = Math.hypot(x - pointerX, particle.y - pointerY);
          if (distance < INFLUENCE) {
            boost = 1 + (1 - distance / INFLUENCE) * 1.6;
          }
        }

        ctx.fillStyle = `rgba(11, 99, 246, ${Math.min(0.55, particle.alpha * boost * fade)})`;
        ctx.beginPath();
        ctx.arc(x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /** Advances every tile's spring one step. */
    function stepSprings() {
      for (let row = 0; row < rows; row += 1) {
        const centreY = row * CELL + CELL / 2;

        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          const centreX = column * CELL + CELL / 2;

          let target = 0;
          if (pointerInside) {
            const distance = Math.hypot(centreX - pointerX, centreY - pointerY);
            if (distance < INFLUENCE) {
              // Cosine falloff: flat-topped near the cursor, easing to zero at
              // the edge, which avoids a visible rim on the influence circle.
              const normalised = distance / INFLUENCE;
              target = (Math.cos(normalised * Math.PI) + 1) / 2;
            }
          }

          const displacement = target - lift[index];
          velocity[index] = (velocity[index] + displacement * STIFFNESS) * DAMPING;
          lift[index] += velocity[index];

          if (lift[index] < 0) lift[index] = 0;
          else if (lift[index] > 1) lift[index] = 1;
        }
      }
    }

    function render(time: number) {
      const deltaSeconds = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      context!.clearRect(0, 0, width, height);

      stepSprings();
      drawCursorLight();
      drawTiles();
      drawParticles(deltaSeconds, time);

      frame = requestAnimationFrame(render);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      // Only treat the pointer as present while it is over the backdrop.
      pointerInside =
        pointerX >= 0 && pointerX <= width && pointerY >= 0 && pointerY <= height;
    }

    function onPointerLeave() {
      pointerInside = false;
    }

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    if (reduceMotion) {
      // One static pass: particles at rest, no springs, no loop.
      context.clearRect(0, 0, width, height);
      drawParticles(0, 0);
      return () => observer.disconnect();
    }

    // Listen on the window so the effect keeps tracking across the content that
    // sits above the canvas, which is pointer-events:none.
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
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
