import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface)] text-[var(--muted)] border-[var(--border-strong)]",
  brand: "bg-[var(--brand-soft)] text-[var(--brand-hover)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  mono = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium leading-none whitespace-nowrap",
        TONE_CLASSES[tone],
        mono && "numeric",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small filled circle, for status legends and inline indicators. */
export function Dot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", className)}
    />
  );
}
