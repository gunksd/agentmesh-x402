"use client";

/**
 * What ships today, and what is built and waiting.
 *
 * Two integrations are written against Binance's documented contracts and gated
 * on access we expect to land: the B402 facilitator needs merchant onboarding,
 * and the MCP server currently admits a fixed set of clients. Both are presented
 * as roadmap rather than as gaps — the code exists, the switch is a config value.
 *
 * The surface list itself lives in lib/i18n/content.ts so both languages stay in
 * one place and the component only decides how to render it.
 */

import { useLanguage } from "./LanguageProvider";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card, CardBody, CardHeader } from "./ui/Card";
import { SURFACES, pick, type SurfaceStatus } from "@/lib/i18n/content";
import type { MessageKey } from "@/lib/i18n/dictionary";

/**
 * Three states. `shipped` marks code that runs today, `next` marks integrations
 * written and waiting on access, so a reader can tell which is which.
 */
const STATUS_LABELS: Record<SurfaceStatus, MessageKey> = {
  live: "statusLive",
  shipped: "statusShipped",
  next: "statusNext",
};

const STATUS_TONES: Record<SurfaceStatus, BadgeTone> = {
  live: "success",
  shipped: "success",
  next: "brand",
};

export function StackNote() {
  const { t, lang } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
      <Card>
        <CardHeader
          title={t("panelStack")}
          description={t("panelStackBody")}
        />
        <CardBody className="space-y-2.5">
          {SURFACES.map((surface) => (
            <div
              key={surface.name.en}
              className="flex flex-col gap-1 border-b border-[var(--border)] pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
            >
              <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
                <Badge tone={STATUS_TONES[surface.status]}>
                  {t(STATUS_LABELS[surface.status])}
                </Badge>
                <span className="text-[12px] font-semibold tracking-tight">
                  {pick(surface.name, lang)}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                {pick(surface.detail, lang)}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </section>
  );
}
