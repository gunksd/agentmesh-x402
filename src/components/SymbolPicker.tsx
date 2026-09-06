"use client";

/**
 * Trading pair picker: searchable combobox over the live spot catalog.
 *
 * The catalog is 834 pairs, so this fetches from /api/symbols on each query
 * rather than shipping the whole list. Requests are debounced and stale
 * responses are discarded — typing "BTCUSDT" fires several lookups and only the
 * last one should paint.
 *
 * Keyboard behaviour follows the ARIA combobox pattern, since a picker that
 * needs a mouse is a picker half the reviewers can't use.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import type { TradingPair } from "@/lib/agents/symbols";
import { Badge } from "./ui/Badge";
import { useLanguage } from "./LanguageProvider";
import { cn, formatCompact } from "@/lib/utils";

/** Long enough to skip intermediate keystrokes, short enough to feel live. */
const DEBOUNCE_MS = 180;

interface SymbolResponse {
  total: number;
  alphaCount: number;
  pairs: TradingPair[];
  error?: string;
}

export function SymbolPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (symbol: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alphaOnly, setAlphaOnly] = useState(false);
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [meta, setMeta] = useState({ total: 0, alphaCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** Monotonic token so a slow response cannot overwrite a newer one. */
  const requestRef = useRef(0);

  const load = useCallback(
    async (search: string, onlyAlpha: boolean) => {
      const token = ++requestRef.current;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ query: search, limit: "60" });
        if (onlyAlpha) params.set("alpha", "1");

        const response = await fetch(`/api/symbols?${params}`);
        const data = (await response.json()) as SymbolResponse;

        // A newer query has been issued; drop this result.
        if (token !== requestRef.current) return;

        if (!response.ok || data.error) {
          throw new Error(data.error ?? `lookup failed (${response.status})`);
        }

        setPairs(data.pairs);
        setMeta({ total: data.total, alphaCount: data.alphaCount });
        setActiveIndex(0);
      } catch (cause) {
        if (token !== requestRef.current) return;
        setError(cause instanceof Error ? cause.message : "lookup failed");
        setPairs([]);
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    },
    [],
  );

  // Debounced fetch while the list is open.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(query, alphaOnly), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, alphaOnly, load]);

  // Dismiss on outside click.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted option in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = useCallback(
    (pair: TradingPair) => {
      onChange(pair.symbol);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, pairs.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const pair = pairs[activeIndex];
        if (pair) select(pair);
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const listboxId = "symbol-picker-list";
  const alphaShown = useMemo(
    () => pairs.filter((pair) => pair.isAlpha).length,
    [pairs],
  );

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="symbol-picker"
        className="block text-[11px] font-medium text-[var(--muted)]"
      >
        {t("fieldPair")}
      </label>

      <div className="relative mt-1.5">
        <input
          id="symbol-picker"
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && pairs[activeIndex]
              ? `symbol-option-${activeIndex}`
              : undefined
          }
          value={open ? query : value}
          placeholder={open ? t("fieldPairPlaceholder") : value}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value.toUpperCase());
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "numeric w-full rounded-xl border border-[var(--border-strong)]",
            "bg-[var(--surface-raised)] py-2.5 pl-9 pr-9 text-[13px] font-medium",
            "outline-none transition-shadow",
            "focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-ring)]",
            "disabled:opacity-60",
          )}
        />

        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--subtle)]"
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? t("fieldPairClose") : t("fieldPairOpen")}
          disabled={disabled}
          onClick={() => {
            setOpen((next) => !next);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--subtle)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </button>
      </div>

      {open ? (
        <div
          className={cn(
            "absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl",
            "border border-[var(--border-strong)] bg-[var(--surface-raised)]",
            "shadow-[0_4px_24px_-8px_rgba(10,22,40,0.18)]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <span className="text-[10px] text-[var(--subtle)]">
              {meta.total.toLocaleString()} {t("fieldPairMeta")}
            </span>
            <button
              type="button"
              onClick={() => setAlphaOnly((next) => !next)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1",
                "text-[10px] font-medium transition-colors",
                alphaOnly
                  ? "border-transparent bg-[var(--brand-soft)] text-[var(--brand-hover)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              <Sparkles aria-hidden className="size-3" />
              {t("fieldAlphaOnly")}
              {meta.alphaCount > 0 ? ` (${meta.alphaCount})` : ""}
            </button>
          </div>

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Trading pairs"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {error ? (
              <li className="px-3 py-3 text-[11px] text-[var(--danger)]">
                {error}
              </li>
            ) : pairs.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-[var(--subtle)]">
                {loading ? t("fieldPairSearching") : `${t("fieldPairNoMatch")} "${query}"`}
              </li>
            ) : (
              pairs.map((pair, index) => (
                <li
                  key={pair.symbol}
                  id={`symbol-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={pair.symbol === value}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => select(pair)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5",
                    index === activeIndex && "bg-[var(--surface)]",
                    pair.symbol === value && "bg-[var(--brand-soft)]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="numeric truncate text-[12px] font-medium">
                      {pair.baseAsset}
                      <span className="text-[var(--subtle)]">
                        /{pair.quoteAsset}
                      </span>
                    </span>
                    {pair.isAlpha ? (
                      <Badge tone="brand" className="gap-0.5">
                        <Sparkles aria-hidden className="size-2.5" />
                        Alpha
                      </Badge>
                    ) : null}
                  </span>

                  {pair.isAlpha && pair.alphaVolume24h ? (
                    <span className="numeric shrink-0 text-[10px] text-[var(--subtle)]">
                      ${formatCompact(pair.alphaVolume24h)}
                    </span>
                  ) : pair.marginAllowed ? (
                    <span className="shrink-0 text-[10px] text-[var(--subtle)]">
                      margin
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          {alphaOnly && alphaShown > 0 ? (
            <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--subtle)]">
              {t("fieldAlphaNote")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
