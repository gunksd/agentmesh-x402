/**
 * Localised structured content: agent descriptions and the surface roadmap.
 *
 * Kept apart from `dictionary.ts` because these are content records rather than
 * UI chrome — each entry pairs an identifier with prose in both languages, and
 * folding 30+ such strings into the flat dictionary would bury the interface
 * copy. The registry stays the single source of truth for skills and pricing;
 * this only supplies display text.
 */

import type { AgentSkill } from "@/lib/agents/registry";
import type { LocalisedText } from "./types";

// Re-exported so UI components keep importing both from one place.
export { pick, type LocalisedText } from "./types";

/**
 * Agent names and descriptions.
 *
 * Names stay recognisable across languages: "Market Data" reads the same to a
 * developer in either, so the Chinese keeps the domain term and translates the
 * role suffix.
 */
export const AGENT_COPY: Record<
  AgentSkill,
  { name: LocalisedText; description: LocalisedText }
> = {
  "market-data": {
    name: { en: "Market Data Agent", zh: "行情数据 Agent" },
    description: {
      en: "Live spot price, 24h range and funding for any Binance trading pair.",
      zh: "任意币安交易对的实时价格、24 小时区间与资金费率。",
    },
  },
  "orderbook-depth": {
    name: { en: "Orderbook Depth Agent", zh: "盘口深度 Agent" },
    description: {
      en: "Bid/ask imbalance, liquidity walls and slippage estimates from live depth.",
      zh: "基于实时盘口的买卖失衡、流动性墙与滑点估算。",
    },
  },
  sentiment: {
    name: { en: "Momentum Agent", zh: "动量 Agent" },
    description: {
      en: "Composite momentum score from 24h return, range position and volume trend.",
      zh: "综合 24 小时涨跌、区间位置与量能趋势的动量评分。",
    },
  },
  risk: {
    name: { en: "Risk Agent", zh: "风险 Agent" },
    description: {
      en: "Position sizing, liquidation distance and volatility-adjusted exposure.",
      zh: "仓位规模、清算距离与按波动率调整后的敞口。",
    },
  },
  report: {
    name: { en: "Report Writer Agent", zh: "报告撰写 Agent" },
    description: {
      en: "Synthesises upstream agent output into a single directional briefing.",
      zh: "将上游 Agent 的产出汇总为一份方向性研判。",
    },
  },
};

export type SurfaceStatus = "live" | "shipped" | "next";

export interface Surface {
  status: SurfaceStatus;
  name: LocalisedText;
  detail: LocalisedText;
}

export const SURFACES: Surface[] = [
  {
    status: "live",
    name: { en: "B402 Bazaar discovery", zh: "B402 Bazaar 发现" },
    detail: {
      en: "Public catalog, queried at runtime on every run. No credentials needed.",
      zh: "公开目录，每次运行时实时查询，无需任何凭证。",
    },
  },
  {
    status: "live",
    name: { en: "Cross-vendor payment", zh: "跨厂商支付" },
    detail: {
      en: "Our client reads and validates 402 challenges from third-party endpoints listed on the Bazaar — x402 v2 on BNB Smart Chain, decoded straight off their wire.",
      zh: "我们的客户端可读取并校验 Bazaar 上第三方端点返回的 402 挑战——BNB Smart Chain 上的 x402 v2，直接从对方响应中解析。",
    },
  },
  {
    status: "live",
    name: { en: "Permit2 settlement", zh: "Permit2 结算" },
    detail: {
      en: "Real transfers on BNB Smart Chain via Uniswap's canonical Permit2 deployment, with the facilitator sponsoring gas.",
      zh: "通过 Uniswap 官方 Permit2 合约在 BNB Smart Chain 上完成真实转账，Gas 由 facilitator 代付。",
    },
  },
  {
    status: "live",
    name: { en: "Binance market data", zh: "币安行情数据" },
    detail: {
      en: "Spot tickers, order book depth and klines behind every paid agent response.",
      zh: "每个付费 Agent 的响应背后都是现货行情、盘口深度与 K 线数据。",
    },
  },
  {
    status: "shipped",
    name: { en: "Order preview", zh: "下单预览" },
    detail: {
      en: "The report agent emits executable order parameters — side, limit inside the spread, volatility-scaled stop — marked awaiting_human_approval. The mesh sells the decision; you keep the trigger.",
      zh: "报告 Agent 输出可执行的订单参数——方向、价差内侧限价、按波动率缩放的止损——并标记为 awaiting_human_approval。网络出售决策，扳机在你手上。",
    },
  },
  {
    status: "next",
    name: { en: "Agent OS MCP server", zh: "Agent OS MCP 服务" },
    detail: {
      en: "OAuth 2.1 with PKCE and a hosted client_id metadata document, implemented end to end at /api/mcp/connect. Binance currently admits a fixed set of MCP clients; market reads switch over the moment self-hosted agents are eligible.",
      zh: "已完整实现 OAuth 2.1 + PKCE 与托管的 client_id 元数据文档，入口在 /api/mcp/connect。币安目前仅接入固定名单内的 MCP 客户端；一旦自建 Agent 获得资格，行情读取会立即切换过去。",
    },
  },
  {
    status: "next",
    name: { en: "B402 facilitator", zh: "B402 Facilitator" },
    detail: {
      en: "verify/settle client written against Binance's spec including RSA-SHA256 request signing. Activates on merchant onboarding — one environment variable moves settlement from our facilitator to Binance's, and the paying agent never notices.",
      zh: "已按币安规范实现 verify/settle 客户端，含 RSA-SHA256 请求签名。商户接入后即可启用——一个环境变量就能把结算从自建 facilitator 切到币安，付款方完全无感。",
    },
  },
  {
    status: "next",
    name: { en: "Bazaar listing", zh: "Bazaar 上架" },
    detail: {
      en: "Publishing our own five agents to the Bazaar so third parties can discover and pay them. Listing metadata attaches to a V2 settle, so it follows directly from facilitator access.",
      zh: "把我们自己的五个 Agent 上架到 Bazaar，让第三方也能发现并付费调用。上架元数据附着在 V2 settle 上，因此紧随 facilitator 权限之后。",
    },
  },
];
