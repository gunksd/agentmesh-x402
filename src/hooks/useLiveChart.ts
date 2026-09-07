"use client";

/**
 * Live price series for a symbol.
 *
 * Seeds from /api/chart, then keeps it current over Binance's public kline
 * WebSocket. The socket sends an update roughly twice a second for the candle in
 * progress, which is what gives the chart its continuous drift rather than a
 * once-a-minute jump.
 *
 * Updates go into a ref and are flushed on an animation frame. Calling setState
 * on every socket message would re-render several times per second and fight the
 * chart's own animation.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface LiveChartState {
  candles: Candle[];
  /** Latest trade price, which leads the last candle's close. */
  price: number | null;
  /** Percentage change across the loaded window. */
  changePercent: number;
  status: "loading" | "live" | "polling" | "error";
}

const WS_BASE = "wss://stream.binance.com:9443/ws";

/** Cap the window so the socket cannot grow the array without bound. */
const MAX_CANDLES = 180;

/** Fallback poll interval when the socket will not connect. */
const POLL_MS = 15_000;

interface KlineMessage {
  k?: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    /** True once the candle has closed. */
    x: boolean;
  };
}

export function useLiveChart(symbol: string, interval = "1m") {
  const [state, setState] = useState<LiveChartState>({
    candles: [],
    price: null,
    changePercent: 0,
    status: "loading",
  });

  /** Authoritative series; state is a throttled view of this. */
  const candlesRef = useRef<Candle[]>([]);
  const frameRef = useRef(0);
  const dirtyRef = useRef(false);

  const flush = useCallback(() => {
    frameRef.current = 0;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;

    const candles = candlesRef.current;
    const first = candles[0]?.o;
    const last = candles.at(-1)?.c ?? null;

    setState((current) => ({
      ...current,
      candles: [...candles],
      price: last,
      changePercent:
        first && last && first > 0 ? ((last - first) / first) * 100 : 0,
    }));
  }, []);

  /** Marks the series dirty and schedules one repaint. */
  const schedule = useCallback(() => {
    dirtyRef.current = true;
    if (frameRef.current === 0) {
      frameRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  /** Merges a candle by open time: replace when known, append when new. */
  const upsert = useCallback((candle: Candle) => {
    const candles = candlesRef.current;
    const last = candles.at(-1);

    if (last && last.t === candle.t) {
      candles[candles.length - 1] = candle;
    } else if (!last || candle.t > last.t) {
      candles.push(candle);
      if (candles.length > MAX_CANDLES) candles.shift();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    candlesRef.current = [];
    setState({ candles: [], price: null, changePercent: 0, status: "loading" });

    async function seed(): Promise<boolean> {
      try {
        const response = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=120`,
        );
        if (!response.ok) throw new Error(String(response.status));

        const data = (await response.json()) as { candles?: Candle[] };
        if (cancelled) return false;

        candlesRef.current = data.candles ?? [];
        schedule();
        return (data.candles?.length ?? 0) > 0;
      } catch {
        if (!cancelled) {
          setState((current) => ({ ...current, status: "error" }));
        }
        return false;
      }
    }

    function startPolling() {
      if (pollTimer) return;
      setState((current) => ({ ...current, status: "polling" }));
      pollTimer = setInterval(() => void seed(), POLL_MS);
    }

    function connect() {
      const stream = `${symbol.toLowerCase()}@kline_${interval}`;

      try {
        socket = new WebSocket(`${WS_BASE}/${stream}`);
      } catch {
        startPolling();
        return;
      }

      socket.onopen = () => {
        if (!cancelled) setState((current) => ({ ...current, status: "live" }));
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(event.data as string) as KlineMessage;
          const k = message.k;
          if (!k) return;

          upsert({
            t: k.t,
            o: Number(k.o),
            h: Number(k.h),
            l: Number(k.l),
            c: Number(k.c),
            v: Number(k.v),
          });
          schedule();
        } catch {
          // A malformed frame is not worth tearing the connection down for.
        }
      };

      // Binance closes idle sockets; polling keeps the chart alive either way.
      socket.onerror = () => startPolling();
      socket.onclose = () => {
        if (!cancelled) startPolling();
      };
    }

    void seed().then((ok) => {
      if (cancelled) return;
      if (ok) connect();
      else startPolling();
    });

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (pollTimer) clearInterval(pollTimer);
      if (socket) {
        // Drop handlers before closing so onclose does not restart polling.
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [symbol, interval, schedule, upsert]);

  return state;
}
