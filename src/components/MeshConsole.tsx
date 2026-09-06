"use client";

/**
 * The interactive console: input, graph, agent rows, log, report.
 *
 * Everything below the hero is driven by one SSE stream, so this is the only
 * stateful component on the page. Kept in one place deliberately — splitting the
 * run state across providers would buy nothing at this size.
 */

import { useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { useOrchestration } from "@/hooks/useOrchestration";
import { AGENT_LIST } from "@/lib/agents/registry";
import type { ReportResult } from "@/lib/agents/analysis";
import { AgentCard } from "./AgentCard";
import { BazaarPanel } from "./BazaarPanel";
import { MeshGraph } from "./MeshGraph";
import { ProtocolLog } from "./ProtocolLog";
import { OrderPreviewPanel } from "./OrderPreviewPanel";
import { ReportPanel } from "./ReportPanel";
import { RunStats } from "./RunStats";
import { Button } from "./ui/Button";
import { Card, CardBody, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";

/** Pairs that are liquid enough for the depth analysis to say something useful. */
const SUGGESTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];

export function MeshConsole() {
  const { state, start, stop } = useOrchestration();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [notional, setNotional] = useState(10_000);

  const running = state.status === "running";
  const report = state.agents.report.data as ReportResult | undefined;

  return (
    <div id="console" className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
      <div className="flex flex-col gap-2">
        <Badge tone="brand" className="w-fit">
          Live on BNB Smart Chain
        </Badge>
        <h2 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">
          Run the mesh
        </h2>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          Pick a market and start a run. The orchestrator discovers what it can
          pay for, then buys five analyses in sequence — signing an EIP-712
          authorisation per invoice and settling each one on-chain before the
          resource is released.
        </p>
      </div>

      {/* Controls. */}
      <Card className="mt-7">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="symbol"
              className="block text-[11px] font-medium text-[var(--muted)]"
            >
              Trading pair
            </label>
            <input
              id="symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              disabled={running}
              spellCheck={false}
              className="numeric mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13px] font-medium outline-none transition-shadow focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-ring)] disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_SYMBOLS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSymbol(option)}
                  disabled={running}
                  className="numeric rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:w-44">
            <label
              htmlFor="notional"
              className="block text-[11px] font-medium text-[var(--muted)]"
            >
              Position size (USD)
            </label>
            <input
              id="notional"
              type="number"
              min={100}
              step={1000}
              value={notional}
              onChange={(event) => setNotional(Number(event.target.value))}
              disabled={running}
              className="numeric mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13px] font-medium outline-none transition-shadow focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-ring)] disabled:opacity-60"
            />
          </div>

          {running ? (
            <Button variant="secondary" onClick={stop}>
              <Square aria-hidden className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button onClick={() => start(symbol, notional)}>
              <Play aria-hidden className="size-3.5" />
              Start run
            </Button>
          )}
        </CardBody>
      </Card>

      {state.error ? (
        <div className="mt-4 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
          {state.error}
        </div>
      ) : null}

      {/* Metrics. */}
      <Card className="mt-5">
        <RunStats state={state} />
      </Card>

      {/* Graph and discovery. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            title="Payment topology"
            description="Edges animate while a settlement is in flight."
            action={
              running ? (
                <Loader2
                  aria-hidden
                  className="size-3.5 animate-spin text-[var(--brand)]"
                />
              ) : null
            }
          />
          <CardBody className="pt-2">
            <MeshGraph agents={state.agents} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="B402 Bazaar discovery"
            description="Public catalog, no API key required."
          />
          <BazaarPanel bazaar={state.bazaar} />
        </Card>
      </div>

      {/* Agents and log. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Agents"
            description="Each one returns 402 until its invoice settles."
          />
          <CardBody className="space-y-2">
            {AGENT_LIST.map((agent) => (
              <AgentCard key={agent.skill} state={state.agents[agent.skill]} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Protocol log"
            description="Raw x402 events, newest last."
          />
          <ProtocolLog events={state.log} />
        </Card>
      </div>

      {report ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Delivered report"
              description="Released after the final settlement confirmed."
            />
            <ReportPanel report={report} />
          </Card>

          {report.orderPreview ? (
            <Card>
              <CardHeader
                title="Order preview"
                description="What the mesh concluded, as executable parameters."
              />
              <OrderPreviewPanel order={report.orderPreview} />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Order preview"
                description="No order proposed."
              />
              <CardBody>
                <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                  The report found no directional edge, so the mesh proposes no
                  trade. Manufacturing one would contradict the analysis it was
                  just paid for.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
