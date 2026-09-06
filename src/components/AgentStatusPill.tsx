"use client";

import { useLanguage } from "./LanguageProvider";
import { Badge, type BadgeTone } from "./ui/Badge";
import type { AgentStatus } from "@/hooks/useOrchestration";
import type { MessageKey } from "@/lib/i18n/dictionary";

/**
 * Labels for the payment state machine. Wording tracks the x402 protocol steps
 * so the UI teaches the flow while it runs.
 */
const STATUS_META: Record<
  AgentStatus,
  { key: MessageKey; tone: BadgeTone }
> = {
  idle: { key: "statusIdle", tone: "neutral" },
  quoted: { key: "statusQuoted", tone: "warning" },
  signed: { key: "statusSigned", tone: "brand" },
  settled: { key: "statusSettled", tone: "success" },
  delivered: { key: "statusDelivered", tone: "success" },
  failed: { key: "statusFailed", tone: "danger" },
};

export function AgentStatusPill({ status }: { status: AgentStatus }) {
  const { t } = useLanguage();
  const { key, tone } = STATUS_META[status];
  return <Badge tone={tone}>{t(key)}</Badge>;
}

export { STATUS_META };
