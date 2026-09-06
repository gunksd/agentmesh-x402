"use client";

/**
 * The mesh visualisation.
 *
 * Layout is a fixed SVG viewBox rather than a force simulation: five agents in a
 * known topology look better hand-placed, and a deterministic layout means the
 * demo video is reproducible.
 *
 * Edges carry the payment. An edge animates only while its agent's settlement is
 * in flight, so what moves on screen corresponds to money actually moving.
 */

import { AGENTS, type AgentSkill } from "@/lib/agents/registry";
import type { AgentState, AgentStatus } from "@/hooks/useOrchestration";
import { cn, formatUsd, shortHash } from "@/lib/utils";

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 400;

/** Orchestrator sits left, market readers stack centre, report closes right. */
const ORCHESTRATOR = { x: 96, y: VIEW_HEIGHT / 2 };
const REPORT = { x: 624, y: VIEW_HEIGHT / 2 };

const COLUMN_X = 360;
const PARALLEL_SKILLS: AgentSkill[] = [
  "market-data",
  "orderbook-depth",
  "sentiment",
  "risk",
];

/** Evenly distributes the four parallel agents down the middle column. */
const NODE_POSITIONS: Record<AgentSkill, { x: number; y: number }> = {
  ...(Object.fromEntries(
    PARALLEL_SKILLS.map((skill, index) => [
      skill,
      { x: COLUMN_X, y: 62 + index * ((VIEW_HEIGHT - 124) / 3) },
    ]),
  ) as Record<AgentSkill, { x: number; y: number }>),
  report: REPORT,
};

const ACCENT_VARS: Record<AgentSkill, string> = {
  "market-data": "var(--accent-market)",
  "orderbook-depth": "var(--accent-depth)",
  sentiment: "var(--accent-sentiment)",
  risk: "var(--accent-risk)",
  report: "var(--accent-report)",
};

/** Payment is in flight between quote and settlement. */
function isInFlight(status: AgentStatus): boolean {
  return status === "quoted" || status === "signed";
}

function isPaid(status: AgentStatus): boolean {
  return status === "settled" || status === "delivered";
}

function edgeStyle(status: AgentStatus) {
  if (status === "failed") {
    return { stroke: "var(--danger)", width: 1.5, opacity: 0.55, flowing: false };
  }
  if (isPaid(status)) {
    return { stroke: "var(--success)", width: 2, opacity: 0.9, flowing: false };
  }
  if (isInFlight(status)) {
    return { stroke: "var(--brand)", width: 2, opacity: 1, flowing: true };
  }
  return { stroke: "var(--border-strong)", width: 1.25, opacity: 1, flowing: false };
}

/** Cubic Bézier with horizontal control points, so edges leave nodes sideways. */
function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

export function MeshGraph({
  agents,
  className,
}: {
  agents: Record<AgentSkill, AgentState>;
  className?: string;
}) {
  const reportState = agents.report;

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Agent payment mesh"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Orchestrator → each parallel agent. */}
        {PARALLEL_SKILLS.map((skill) => {
          const style = edgeStyle(agents[skill].status);
          return (
            <path
              key={`in-${skill}`}
              d={curve(ORCHESTRATOR, NODE_POSITIONS[skill])}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeOpacity={style.opacity}
              strokeLinecap="round"
              className={style.flowing ? "edge-flowing" : undefined}
            />
          );
        })}

        {/* Each parallel agent → report writer. */}
        {PARALLEL_SKILLS.map((skill) => {
          // This edge represents findings flowing onward, so it lights up once
          // the upstream agent has delivered.
          const upstreamDone = isPaid(agents[skill].status);
          const style = edgeStyle(
            upstreamDone ? reportState.status : agents[skill].status,
          );
          return (
            <path
              key={`out-${skill}`}
              d={curve(NODE_POSITIONS[skill], REPORT)}
              fill="none"
              stroke={upstreamDone ? style.stroke : "var(--border)"}
              strokeWidth={upstreamDone ? style.width : 1}
              strokeOpacity={upstreamDone ? style.opacity : 0.7}
              strokeLinecap="round"
              className={
                upstreamDone && isInFlight(reportState.status)
                  ? "edge-flowing"
                  : undefined
              }
            />
          );
        })}

        {/* Orchestrator node. */}
        <g>
          <circle
            cx={ORCHESTRATOR.x}
            cy={ORCHESTRATOR.y}
            r={30}
            fill="var(--brand-soft)"
            stroke="var(--brand)"
            strokeWidth={1.5}
          />
          <text
            x={ORCHESTRATOR.x}
            y={ORCHESTRATOR.y + 4}
            textAnchor="middle"
            className="fill-[var(--brand-hover)] text-[11px] font-semibold"
          >
            Payer
          </text>
          <text
            x={ORCHESTRATOR.x}
            y={ORCHESTRATOR.y + 50}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[10px]"
          >
            Orchestrator
          </text>
        </g>

        {/* Agent nodes. */}
        {(Object.keys(NODE_POSITIONS) as AgentSkill[]).map((skill) => {
          const position = NODE_POSITIONS[skill];
          const state = agents[skill];
          const agent = AGENTS[skill];
          const accent = ACCENT_VARS[skill];
          const paid = isPaid(state.status);
          const flight = isInFlight(state.status);
          const failed = state.status === "failed";

          return (
            <g key={skill}>
              <circle
                cx={position.x}
                cy={position.y}
                r={22}
                fill={paid ? "var(--success-soft)" : "var(--surface-raised)"}
                stroke={failed ? "var(--danger)" : paid ? "var(--success)" : accent}
                strokeWidth={flight ? 2.5 : 1.5}
                strokeOpacity={state.status === "idle" ? 0.4 : 1}
              />
              {/* Expanding ring while a settlement is pending. */}
              {flight ? (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={22}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  opacity={0.5}
                  className="settling"
                />
              ) : null}

              <text
                x={position.x}
                y={position.y + 4}
                textAnchor="middle"
                className="numeric fill-[var(--foreground)] text-[10px] font-semibold"
              >
                {formatUsd(agent.priceUsd)}
              </text>

              <text
                x={position.x}
                y={position.y - 32}
                textAnchor="middle"
                className="fill-[var(--foreground)] text-[10px] font-medium"
              >
                {agent.name.replace(" Agent", "")}
              </text>

              {state.transaction ? (
                <text
                  x={position.x}
                  y={position.y + 38}
                  textAnchor="middle"
                  className="numeric fill-[var(--success)] text-[9px]"
                >
                  {shortHash(state.transaction)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
