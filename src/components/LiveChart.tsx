"use client";

/**
 * Live price chart, drawn in the flowing style Polymarket uses.
 *
 * A smoothed area line rather than candlesticks: the point of this chart is to
 * show that the report was written against a market moving in real time, and a
 * continuous line carries that better than discrete bars. The leading edge keeps
 * a pulsing dot and a price tag so the movement is legible even when the last few
 * ticks are small.
 *
 * Canvas rather than SVG or Recharts. Updates land roughly twice a second and the
 * y-axis eases toward each new range, so this repaints continuously — reconciling
 * a few hundred SVG nodes at that rate is wasted work.
 */

import { useEffect, useRef } from "react";
import type { Candle } from "@/hooks/useLiveChart";

/** How quickly the visible price range eases toward the true one, per frame. */
const RANGE_EASING = 0.12;

/** Padding above and below the series, as a fraction of its range. */
const RANGE_PADDING = 0.12;

const PADDING = { top: 14, right: 62, bottom: 18, left: 8 };

interface Bounds {
  min: number;
  max: number;
}

export function LiveChart({
  candles,
  rising,
  className,
}: {
  candles: Candle[];
  /** Drives the palette; passed in so it matches the header's change figure. */
  rising: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Latest props, read inside the animation loop without restarting it. */
  const dataRef = useRef({ candles, rising });
  dataRef.current = { candles, rising };

  /** Eased bounds, so the axis glides when a new high or low arrives. */
  const boundsRef = useRef<Bounds | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let frame = 0;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;

      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** True range of the series, with headroom so the line never touches an edge. */
    function trueBounds(series: Candle[]): Bounds {
      let min = Infinity;
      let max = -Infinity;

      for (const candle of series) {
        if (candle.l < min) min = candle.l;
        if (candle.h > max) max = candle.h;
      }

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: 0, max: 1 };
      }
      // A flat series would divide by zero; give it artificial height.
      if (max - min < 1e-9) {
        const nudge = Math.abs(max) * 0.001 || 1;
        return { min: min - nudge, max: max + nudge };
      }

      const pad = (max - min) * RANGE_PADDING;
      return { min: min - pad, max: max + pad };
    }

    function render() {
      const { candles: series, rising: up } = dataRef.current;
      const ctx = context!;

      ctx.clearRect(0, 0, width, height);

      if (series.length < 2) {
        frame = requestAnimationFrame(render);
        return;
      }

      // Ease the axis toward the true range rather than snapping to it.
      const target = trueBounds(series);
      const current = boundsRef.current;
      const bounds: Bounds = current
        ? {
            min: current.min + (target.min - current.min) * RANGE_EASING,
            max: current.max + (target.max - current.max) * RANGE_EASING,
          }
        : target;
      boundsRef.current = bounds;

      const plotWidth = width - PADDING.left - PADDING.right;
      const plotHeight = height - PADDING.top - PADDING.bottom;
      const span = bounds.max - bounds.min || 1;

      const xAt = (index: number) =>
        PADDING.left + (index / (series.length - 1)) * plotWidth;
      const yAt = (price: number) =>
        PADDING.top + (1 - (price - bounds.min) / span) * plotHeight;

      const stroke = up ? "#0F9D58" : "#D93025";
      const fillTop = up ? "rgba(15,157,88,0.16)" : "rgba(217,48,37,0.16)";
      const fillBottom = up ? "rgba(15,157,88,0)" : "rgba(217,48,37,0)";

      // Build the smoothed path once and reuse it for fill, line, and glow.
      const trace = (close: boolean) => {
        ctx.beginPath();
        ctx.moveTo(xAt(0), yAt(series[0].c));

        for (let i = 1; i < series.length; i += 1) {
          const x = xAt(i);
          const y = yAt(series[i].c);
          const previousX = xAt(i - 1);
          const previousY = yAt(series[i - 1].c);
          // Horizontal control points give the eased, flowing curve without the
          // overshoot a cardinal spline would introduce on spiky data.
          const midX = (previousX + x) / 2;
          ctx.bezierCurveTo(midX, previousY, midX, y, x, y);
        }

        if (close) {
          ctx.lineTo(xAt(series.length - 1), PADDING.top + plotHeight);
          ctx.lineTo(xAt(0), PADDING.top + plotHeight);
          ctx.closePath();
        }
      };

      // Gradient fill under the line.
      const gradient = ctx.createLinearGradient(
        0,
        PADDING.top,
        0,
        PADDING.top + plotHeight,
      );
      gradient.addColorStop(0, fillTop);
      gradient.addColorStop(1, fillBottom);
      trace(true);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Soft glow beneath the stroke, which is what reads as "live".
      trace(false);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.14;
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.75;
      ctx.stroke();

      // Leading edge: pulsing dot plus price tag.
      const lastIndex = series.length - 1;
      const lastX = xAt(lastIndex);
      const lastY = yAt(series[lastIndex].c);

      const pulse = reduceMotion
        ? 0.5
        : (Math.sin(performance.now() / 420) + 1) / 2;

      ctx.beginPath();
      ctx.arc(lastX, lastY, 4.5 + pulse * 4.5, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.globalAlpha = 0.16 * (1 - pulse);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = stroke;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Dashed guide across to the price tag.
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(lastX + 6, lastY);
      ctx.lineTo(width - PADDING.right + 2, lastY);
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      const price = series[lastIndex].c;
      const label = price >= 1000 ? price.toFixed(1) : price.toPrecision(6);

      ctx.font =
        '600 10.5px ui-monospace, SFMono-Regular, "Geist Mono", monospace';
      const textWidth = ctx.measureText(label).width;
      const tagX = width - PADDING.right + 6;
      const tagY = lastY - 8.5;

      ctx.beginPath();
      ctx.roundRect(tagX, tagY, textWidth + 10, 17, 4);
      ctx.fillStyle = stroke;
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.fillText(label, tagX + 5, tagY + 12);

      frame = requestAnimationFrame(render);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
