"use client";

/**
 * Order preview.
 *
 * The point of the mesh: five paid analyses converge into parameters a human can
 * approve. Framed as a pending action rather than a completed one, because this
 * project holds read-only MCP scopes and has no code path that could submit.
 */

import { ShieldCheck } from "lucide-react";
import type { OrderPreview } from "@/lib/agents/order";
import { Badge } from "./ui/Badge";
import { useLanguage } from "./LanguageProvider";
import { pick } from "@/lib/i18n/content";
import { cn, formatPrice, formatUsd } from "@/lib/utils";

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">
        {label}
      </dt>
      <dd
        className={cn(
          "numeric mt-0.5 text-[13px] font-semibold",
          tone === "danger" && "text-[var(--danger)]",
          tone === "success" && "text-[var(--success)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function OrderPreviewPanel({ order }: { order: OrderPreview }) {
  const { t, lang } = useLanguage();
  const isBuy = order.side === "BUY";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={isBuy ? "success" : "danger"}>{order.side}</Badge>
          <span className="numeric text-[14px] font-semibold tracking-tight">
            {order.symbol}
          </span>
          <span className="text-[11px] text-[var(--subtle)]">
            {order.type} · {order.leverage.toFixed(1)}x
          </span>
        </div>
        <Badge tone="warning">{t("orderAwaiting")}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Field label={t("orderQuantity")} value={String(order.quantity)} />
        <Field label={t("orderLimit")} value={formatPrice(order.price)} />
        <Field label={t("orderStop")} value={formatPrice(order.stopLossPrice)} tone="danger" />
        <Field
          label={t("orderTarget")}
          value={formatPrice(order.takeProfitPrice)}
          tone="success"
        />
      </dl>

      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] text-[var(--subtle)]">
          {t("orderNotional")}{" "}
          <span className="numeric font-semibold text-[var(--foreground)]">
            {formatUsd(order.notionalUsd)}
          </span>
        </p>
        <ul className="mt-2 space-y-1">
          {order.rationale.map((line, index) => (
            <li
              key={index}
              className="text-[12px] leading-relaxed text-[var(--muted)]"
            >
              {pick(line, lang)}
            </li>
          ))}
        </ul>
      </div>

      {/* The guarantee, stated where someone evaluating the demo will read it. */}
      <div className="mt-4 flex gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <ShieldCheck
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
        />
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          {t("orderScopeNote")}
        </p>
      </div>
    </div>
  );
}
