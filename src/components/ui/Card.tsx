import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Surface primitive. Hairline border plus a barely-there shadow — depth comes
 * from the border, not from a drop shadow, which keeps a page full of these from
 * looking muddy.
 */
export function Card({
  children,
  className,
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]",
        "shadow-[0_1px_2px_rgba(10,22,40,0.04),0_8px_24px_-16px_rgba(10,22,40,0.10)]",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
