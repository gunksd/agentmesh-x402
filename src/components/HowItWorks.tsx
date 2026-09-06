/**
 * Protocol explainer.
 *
 * A reviewer watching the demo needs to know what they are looking at before the
 * log scrolls past. Five steps, matching the five event types in the log.
 */

import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

const STEPS = [
  {
    step: "01",
    title: "Discover",
    body:
      "The orchestrator queries Binance's public B402 Bazaar for endpoints that " +
      "accept x402 payment. No API key, no pre-configured list.",
    tag: "Bazaar API",
  },
  {
    step: "02",
    title: "Get quoted",
    body:
      "It requests an agent's resource and receives 402 Payment Required, " +
      "carrying the amount, token, network and Permit2 spender address.",
    tag: "HTTP 402",
  },
  {
    step: "03",
    title: "Sign offline",
    body:
      "It signs an EIP-712 Permit2 authorisation locally. No RPC call, no gas, " +
      "no wallet popup — a few milliseconds of local cryptography.",
    tag: "EIP-712",
  },
  {
    step: "04",
    title: "Verify and settle",
    body:
      "The facilitator checks the signature off-chain, then submits the transfer " +
      "to Permit2 on BNB Smart Chain and sponsors the gas itself.",
    tag: "Permit2",
  },
  {
    step: "05",
    title: "Deliver",
    body:
      "Once settlement confirms, the agent releases its analysis and returns the " +
      "transaction hash. Anyone can verify the payment on BscScan.",
    tag: "Receipt",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
        <Badge tone="brand" className="w-fit">
          How a payment happens
        </Badge>
        <h2 className="mt-3 max-w-2xl text-[26px] font-semibold tracking-tight sm:text-[30px]">
          Five steps, none of them human
        </h2>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          This is the x402 v2 flow as specified, with Binance B402 as the
          reference implementation. AgentMesh runs both sides of it: the agents
          that charge, and the orchestrator that pays.
        </p>

        <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((item) => (
            <Card key={item.step} as="article" className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="numeric text-[11px] font-semibold text-[var(--brand)]">
                  {item.step}
                </span>
                <Badge>{item.tag}</Badge>
              </div>
              <h3 className="mt-2.5 text-[13px] font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
                {item.body}
              </p>
            </Card>
          ))}
        </ol>
      </div>
    </section>
  );
}
