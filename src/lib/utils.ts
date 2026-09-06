/** Shared UI helpers. */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shortens an address for display: 0x1234…abcd. */
export function shortAddress(address: string, chars = 4): string {
  if (!address.startsWith("0x") || address.length < chars * 2 + 2) {
    return address;
  }
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Shortens a transaction hash a little more generously than an address. */
export function shortHash(hash: string): string {
  return shortAddress(hash, 6);
}

/** Formats a USD amount, keeping sub-cent precision visible for micropayments. */
export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formats a price with precision scaled to its magnitude. */
export function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Renders a duration compactly: 840ms, 2.4s. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercent(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/** Compact notation for large volumes: 1.2B, 340M. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
