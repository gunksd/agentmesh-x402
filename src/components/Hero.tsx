"use client";

/**
 * Landing hero.
 *
 * The one claim that matters is in the headline: agents pay each other, on-chain,
 * with no human in the loop. Everything else on this page is evidence for it.
 *
 * A client component because it reads the language dictionary. The language
 * toggle lives here so it is the first control a visitor meets.
 */

import { ArrowRight } from "lucide-react";
import GlassSurface from "./reactbits/GlassSurface";
import { SquircleShift } from "./SquircleShift";
import { PIPELINE_TOTAL_USD } from "@/lib/agents/registry";
import { formatUsd } from "@/lib/utils";
import { useLanguage } from "./LanguageProvider";
import { LanguageToggle } from "./LanguageToggle";
import { Badge } from "./ui/Badge";
import { GithubMark } from "./ui/GithubMark";

const REPO_URL = "https://github.com/gunksd/agentmesh-x402";

export function Hero() {
  const { t } = useLanguage();

  const proofPoints = [
    { label: t("proofSettlement"), value: t("proofSettlementValue") },
    { label: t("proofProtocol"), value: "x402 v2 · Permit2" },
    { label: t("proofCost"), value: formatUsd(PIPELINE_TOTAL_USD) },
    { label: t("proofGas"), value: t("proofGasValue") },
  ];

  return (
    <header className="relative overflow-hidden border-b border-[var(--border)]">
      <div aria-hidden className="grid-backdrop absolute inset-0" />
      <SquircleShift />

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-16 sm:pb-24 sm:pt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="brand" className="gap-1.5">
            {t("heroBadge")}
          </Badge>
          <LanguageToggle />
        </div>

        <h1 className="mt-5 max-w-3xl text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[52px]">
          {t("heroTitleA")}
          <span className="block text-[var(--brand)]">{t("heroTitleB")}</span>
        </h1>

        <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)] sm:text-[15px]">
          {t("heroBodyA")}{" "}
          <span className="numeric text-[var(--foreground)]">
            402 Payment Required
          </span>
          {t("heroBodyB")}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#console"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(11,99,246,0.24),0_10px_24px_-14px_rgba(11,99,246,0.6)] transition-colors hover:bg-[var(--brand-hover)]"
          >
            {t("heroCta")}
            <ArrowRight aria-hidden className="size-3.5" />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-3 text-[13px] font-semibold transition-colors hover:bg-[var(--surface)]"
          >
            <GithubMark />
            {t("heroSource")}
          </a>
        </div>

        {/*
          Glass over the proof points, which is the one place on the page with
          something worth refracting: the squircle tiles are moving directly
          behind this strip. backdrop-filter bends what is behind it, so the same
          panel over flat white would be invisible.
        */}
        <GlassSurface
          width="100%"
          height="auto"
          borderRadius={18}
          backgroundOpacity={0.42}
          saturation={1.35}
          blur={13}
          displace={0.6}
          distortionScale={-140}
          className="mt-12 !block"
        >
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-4">
            {proofPoints.map((point) => (
              <div key={point.label}>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">
                  {point.label}
                </dt>
                <dd className="numeric mt-1 text-[13px] font-semibold tracking-tight">
                  {point.value}
                </dd>
              </div>
            ))}
          </dl>
        </GlassSurface>
      </div>
    </header>
  );
}
