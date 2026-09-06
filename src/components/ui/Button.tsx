import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] " +
    "shadow-[0_1px_2px_rgba(11,99,246,0.24),0_8px_20px_-12px_rgba(11,99,246,0.55)]",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--foreground)] border border-[var(--border-strong)] " +
    "hover:bg-[var(--surface)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
};

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5",
        "text-[13px] font-semibold tracking-tight",
        "transition-[background-color,box-shadow,transform] duration-150",
        "active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
