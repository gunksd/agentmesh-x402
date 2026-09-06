import { Badge, type BadgeTone } from "./ui/Badge";
import type { AgentStatus } from "@/hooks/useOrchestration";

/**
 * Human labels for the payment state machine. Wording tracks the x402 protocol
 * steps so the UI teaches the flow while it runs.
 */
const STATUS_META: Record<AgentStatus, { label: string; tone: BadgeTone }> = {
  idle: { label: "Idle", tone: "neutral" },
  quoted: { label: "402 quoted", tone: "warning" },
  signed: { label: "Signed", tone: "brand" },
  settled: { label: "Settled on-chain", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function AgentStatusPill({ status }: { status: AgentStatus }) {
  const { label, tone } = STATUS_META[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export { STATUS_META };
