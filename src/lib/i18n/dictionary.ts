/**
 * UI copy in both languages.
 *
 * One flat object per language, shape-checked against the English one, so a
 * missing or misspelled Chinese key is a compile error rather than a blank spot
 * on the page.
 *
 * Deliberately excluded: protocol nouns (`402 Payment Required`, `EIP-712`,
 * `Permit2`, `x402`, tool names, error reasons) stay in English in both. A
 * translated wire format would misrepresent what is actually on the wire, and
 * Chinese-speaking developers read these terms in English anyway.
 */

const en = {
  // Hero
  heroBadge: "Built with Binance Agent OS",
  heroTitleA: "Agents that hire each other",
  heroTitleB: "and settle the bill on-chain",
  heroBodyA:
    "AgentMesh is a network of specialist agents that sell their work over HTTP. An orchestrator discovers what it needs, receives a",
  heroBodyB:
    ", signs an EIP-712 authorisation, and the invoice settles on BNB Smart Chain in seconds. Every hop is a real transfer with a verifiable receipt, and no step waits on a human.",
  heroCta: "Watch a live run",
  heroSource: "Source",
  proofSettlement: "Settlement",
  proofSettlementValue: "BNB Smart Chain",
  proofProtocol: "Protocol",
  proofCost: "Cost per run",
  proofGas: "Gas paid by payer",
  proofGasValue: "None",

  // How it works
  howBadge: "How a payment happens",
  howTitle: "Five steps, none of them human",
  howBody:
    "This is the x402 v2 flow as specified, with Binance B402 as the reference implementation. AgentMesh runs both sides of it: the agents that charge, and the orchestrator that pays.",
  step1Tag: "Bazaar API",
  step1Title: "Discover",
  step1Body:
    "The orchestrator queries Binance's public B402 Bazaar for endpoints that accept x402 payment. No API key, no pre-configured list.",
  step2Tag: "HTTP 402",
  step2Title: "Get quoted",
  step2Body:
    "It requests an agent's resource and receives 402 Payment Required, carrying the amount, token, network and Permit2 spender address.",
  step3Tag: "EIP-712",
  step3Title: "Sign offline",
  step3Body:
    "It signs an EIP-712 Permit2 authorisation locally. No RPC call, no gas, no wallet popup — a few milliseconds of local cryptography.",
  step4Tag: "Permit2",
  step4Title: "Verify and settle",
  step4Body:
    "The facilitator checks the signature off-chain, then submits the transfer to Permit2 on BNB Smart Chain and sponsors the gas itself.",
  step5Tag: "Receipt",
  step5Title: "Deliver",
  step5Body:
    "Once settlement confirms, the agent releases its analysis and returns the transaction hash. Anyone can verify the payment on BscScan.",

  // Console
  consoleBadge: "Live on BNB Smart Chain",
  consoleTitle: "Run the mesh",
  consoleBody:
    "Pick a market and start a run. The orchestrator discovers what it can pay for, then buys five analyses — signing an EIP-712 authorisation per invoice and settling each one on-chain before the resource is released.",
  fieldPair: "Trading pair",
  fieldPairPlaceholder: "Search 800+ pairs…",
  fieldPairMeta: "pairs · live from exchangeInfo",
  fieldAlphaOnly: "Alpha only",
  fieldAlphaNote:
    "Alpha volume is 24h, from Binance's public Alpha catalog.",
  fieldPairSearching: "Searching…",
  fieldPairNoMatch: "No pair matches",
  fieldPairOpen: "Open pair list",
  fieldPairClose: "Close pair list",
  fieldNotional: "Position size (USD)",
  actionStart: "Start run",
  actionStop: "Stop",

  // Metrics
  metricSpent: "Spent on-chain",
  metricSpentHint: "of {total} budget",
  metricAgents: "Agents paid",
  metricAgentsHint: "settlements confirmed",
  metricClock: "Wall clock",
  metricClockHint: "discovery to report",
  metricApprovals: "Human approvals",
  metricApprovalsHint: "fully autonomous",

  // Panels
  panelTopology: "Payment topology",
  panelTopologyBody: "Edges animate while a settlement is in flight.",
  panelBazaar: "B402 Bazaar discovery",
  panelBazaarBody: "Public catalog, no API key required.",
  panelBazaarIdle: "Discovery runs before the first payment.",
  panelBazaarEmpty:
    "The Bazaar returned no matching listings for this query. Discovery is additive here — the mesh still runs against its own agents.",
  panelBazaarFoundA: "third-party endpoints on Binance B402 Bazaar accept x402 payment for this query. Any of them is callable by the same signing path used below.",
  panelInterop: "Cross-vendor interoperability",
  panelInteropBody: "Our client reading strangers' 402 challenges, live.",
  panelInteropIdle: "Calling endpoints strangers listed on the Bazaar.",
  panelInteropSummary:
    "{ok}/{total} third-party endpoints returned a valid 402 our client can read. Nothing was paid.",
  panelInteropReprobe: "Re-probe",
  interopPayable: "Payable",
  interopIncompatible: "Incompatible",
  interopUnreachable: "Unreachable",
  panelAgents: "Agents",
  panelAgentsBody: "Each one returns 402 until its invoice settles.",
  panelLog: "Protocol log",
  panelLogBody: "Raw x402 events, newest last.",
  panelLogIdle: "Protocol events appear here once a run starts.",
  logPaused: "Auto-scroll paused while hovering",
  logJumpLatest: "Jump to latest",

  // Agent statuses
  statusIdle: "Idle",
  statusQuoted: "402 quoted",
  statusSigned: "Signed",
  statusSettled: "Settled on-chain",
  statusDelivered: "Delivered",
  statusFailed: "Failed",
  badgeLiveData: "Live data",
  agentSignedIn: "signed in",
  agentSettledIn: "settled in",
  viewOnBscScan: "View settlement on BscScan",

  // Report
  panelReport: "Delivered report",
  panelReportBody: "Released after the final settlement confirmed.",
  reportConfidence: "Confidence",
  directionLong: "Long bias",
  directionShort: "Short bias",
  directionNeutral: "No edge",
  panelOrder: "Order preview",
  panelOrderBody: "What the mesh concluded, as executable parameters.",
  panelOrderNoneTitle: "No order proposed.",
  panelOrderNone:
    "The report found no directional edge, so the mesh proposes no trade. Manufacturing one would contradict the analysis it was just paid for.",
  panelOrderNoDepthTitle: "Order could not be priced.",
  panelOrderNoDepth:
    "The report has a direction, but the limit price is derived from the live spread and the Orderbook Depth agent's payment did not settle this run. Rather than guess a price, the mesh proposes nothing — retry the run to price it.",
  orderAwaiting: "Awaiting your approval",
  orderQuantity: "Quantity",
  orderLimit: "Limit price",
  orderStop: "Stop loss",
  orderTarget: "Take profit",
  orderNotional: "Notional",
  orderScopeNote:
    "Executing this would need the Agent OS trade scope. AgentMesh requests market_data and account only, so no code path here can place an order. The mesh sells the decision; you keep the trigger.",

  // Stack note
  panelStack: "Shipped today, and what's coming next",
  panelStackBody: "Every claim on this page is checkable in the repo.",
  statusLive: "Live",
  statusShipped: "Shipped",
  statusNext: "Coming next",

  // Footer
  footerLeft:
    "AgentMesh · x402 v2 payment mesh on BNB Smart Chain · Binance Agent OS Mini Hackathon",
  footerRight:
    "Demo software. Testnet by default. Not financial advice, and not audited.",
  // Chart
  chartTitle: "Live market",
  chartBody: "The market the report was written against, still moving.",
  chartLoading: "Loading…",
  chartLive: "Live",
  chartPolling: "Polling",
  chartError: "Unavailable",
  chartFooter: "1m candles · seeded over REST, streamed over WebSocket.",

  // Signals
  panelSignals: "Early signal scan",
  panelSignalsBody: "Open interest, funding and taker flow, graded A to E.",
  signalGrade: "Grade",
  signalScore: "Composite score",
  signalRegime: "Regime",
  signalComponents: "Components",
  signalDegraded: "No futures market for this symbol — the grade reflects spot data only.",
  signalWeight: "weight",
  signalExcludedNote:
    "Dimmed components had no data this run and are excluded from the score, which is normalised over the weight actually available.",

  // Report export
  reportDownload: "Download PDF",
  reportOpen: "Open in new tab",
  reportGenerating: "Generating…",
  pdfLanguageNote:
    "PDF is issued in English — jsPDF's built-in fonts cannot draw CJK glyphs, and embedding a Chinese font would add megabytes to the bundle. The Chinese headline travels in the document metadata.",

  langSwitch: "Switch language",
} as const;

/** Chinese copy. Keys are enforced to match `en` exactly. */
const zh: Record<keyof typeof en, string> = {
  heroBadge: "基于 Binance Agent OS 构建",
  heroTitleA: "让 Agent 互相雇佣",
  heroTitleB: "并在链上自动结账",
  heroBodyA:
    "AgentMesh 是一个专业 Agent 通过 HTTP 出售自身能力的网络。编排方发现所需服务后，会收到一个",
  heroBodyB:
    "，随即签署 EIP-712 授权，几秒内在 BNB Smart Chain 完成结算。每一跳都是真实转账、都有可验证的链上凭证，全程无需人工介入。",
  heroCta: "观看实时运行",
  heroSource: "源码",
  proofSettlement: "结算网络",
  proofSettlementValue: "BNB Smart Chain",
  proofProtocol: "协议",
  proofCost: "单次成本",
  proofGas: "付款方 Gas",
  proofGasValue: "无需支付",

  howBadge: "一笔支付如何发生",
  howTitle: "五个步骤，没有一步需要人",
  howBody:
    "这是 x402 v2 规范定义的流程，以 Binance B402 作为参考实现。AgentMesh 同时运行两端：收费的 Agent，以及付款的编排方。",
  step1Tag: "Bazaar API",
  step1Title: "发现",
  step1Body:
    "编排方查询 Binance 公开的 B402 Bazaar，寻找接受 x402 付款的端点。无需 API key，也无需预先配置清单。",
  step2Tag: "HTTP 402",
  step2Title: "获取报价",
  step2Body:
    "请求 Agent 资源后收到 402 Payment Required，其中携带金额、代币、网络以及 Permit2 spender 地址。",
  step3Tag: "EIP-712",
  step3Title: "离线签名",
  step3Body:
    "本地签署 EIP-712 Permit2 授权。无 RPC 调用、无需 Gas、无钱包弹窗——只是几毫秒的本地密码学运算。",
  step4Tag: "Permit2",
  step4Title: "验证与结算",
  step4Body:
    "Facilitator 先离链校验签名，再把转账提交到 BNB Smart Chain 上的 Permit2，并自行承担 Gas。",
  step5Tag: "链上凭证",
  step5Title: "交付",
  step5Body:
    "结算确认后，Agent 释放分析结果并返回交易哈希。任何人都可以在 BscScan 上核验这笔支付。",

  consoleBadge: "运行于 BNB Smart Chain",
  consoleTitle: "运行支付网络",
  consoleBody:
    "选择一个交易对并启动运行。编排方会先发现可付费的服务，然后购买五份分析——每张账单签署一次 EIP-712 授权，逐笔在链上结算后才释放数据。",
  fieldPair: "交易对",
  fieldPairPlaceholder: "搜索 800+ 交易对…",
  fieldPairMeta: "个交易对 · 实时来自 exchangeInfo",
  fieldAlphaOnly: "仅看 Alpha",
  fieldAlphaNote: "Alpha 成交量为 24 小时数据，来自币安公开 Alpha 目录。",
  fieldPairSearching: "搜索中…",
  fieldPairNoMatch: "没有匹配的交易对",
  fieldPairOpen: "展开交易对列表",
  fieldPairClose: "收起交易对列表",
  fieldNotional: "仓位规模（美元）",
  actionStart: "开始运行",
  actionStop: "停止",

  metricSpent: "链上已花费",
  metricSpentHint: "预算共 {total}",
  metricAgents: "已付费 Agent",
  metricAgentsHint: "笔结算已确认",
  metricClock: "总耗时",
  metricClockHint: "从发现到出报告",
  metricApprovals: "人工确认次数",
  metricApprovalsHint: "完全自主执行",

  panelTopology: "支付拓扑",
  panelTopologyBody: "结算在途时，对应连线会流动。",
  panelBazaar: "B402 Bazaar 发现",
  panelBazaarBody: "公开目录，无需 API key。",
  panelBazaarIdle: "首次付款前会先执行发现。",
  panelBazaarEmpty:
    "本次查询在 Bazaar 上没有匹配的挂牌。发现是增量能力——即使为空，网络依然会调用自有 Agent。",
  panelBazaarFoundA: "个第三方端点在 Binance B402 Bazaar 上接受 x402 付款。它们都可以用下方同一套签名流程直接调用。",
  panelInterop: "跨厂商互操作",
  panelInteropBody: "我们的客户端实时解析陌生端点的 402 挑战。",
  panelInteropIdle: "正在调用他人挂在 Bazaar 上的端点。",
  panelInteropSummary:
    "{ok}/{total} 个第三方端点返回了我们客户端可解析的有效 402。本次未支付任何费用。",
  panelInteropReprobe: "重新探测",
  interopPayable: "可付款",
  interopIncompatible: "不兼容",
  interopUnreachable: "不可达",
  panelAgents: "Agent 列表",
  panelAgentsBody: "每个 Agent 在账单结算前都返回 402。",
  panelLog: "协议日志",
  panelLogBody: "原始 x402 事件，最新在下。",
  panelLogIdle: "运行开始后，协议事件会出现在这里。",
  logPaused: "悬停时已暂停自动滚动",
  logJumpLatest: "跳到最新",

  statusIdle: "空闲",
  statusQuoted: "已报价 402",
  statusSigned: "已签名",
  statusSettled: "链上已结算",
  statusDelivered: "已交付",
  statusFailed: "失败",
  badgeLiveData: "实时数据",
  agentSignedIn: "签名耗时",
  agentSettledIn: "结算耗时",
  viewOnBscScan: "在 BscScan 上查看结算",

  panelReport: "交付的报告",
  panelReportBody: "在最后一笔结算确认后释放。",
  reportConfidence: "置信度",
  directionLong: "偏多",
  directionShort: "偏空",
  directionNeutral: "无明显边际",
  panelOrder: "下单预览",
  panelOrderBody: "网络得出的结论，转化为可执行参数。",
  panelOrderNoneTitle: "未提出订单。",
  panelOrderNone:
    "报告未发现方向性边际，因此不提出任何交易。硬凑一笔会与刚刚付费得到的分析自相矛盾。",
  panelOrderNoDepthTitle: "无法为订单定价。",
  panelOrderNoDepth:
    "报告已给出方向，但限价需要依据实时价差推算，而本次运行中盘口深度 Agent 的支付未能结算。与其凭空猜一个价格，网络选择不提出订单——重跑一次即可定价。",
  orderAwaiting: "等待你确认",
  orderQuantity: "数量",
  orderLimit: "限价",
  orderStop: "止损价",
  orderTarget: "止盈价",
  orderNotional: "名义金额",
  orderScopeNote:
    "真正执行需要 Agent OS 的 trade 权限。AgentMesh 只申请 market_data 与 account 权限，因此代码里不存在任何能下单的路径。网络出售决策，扳机始终在你手上。",

  panelStack: "当前已上线，以及接下来",
  panelStackBody: "本页每一条声明都可以在仓库里核对。",
  statusLive: "已上线",
  statusShipped: "已交付",
  statusNext: "敬请期待",

  footerLeft:
    "AgentMesh · 运行于 BNB Smart Chain 的 x402 v2 支付网络 · Binance Agent OS Mini Hackathon",
  footerRight: "演示软件，默认测试网。不构成投资建议，未经审计。",
  chartTitle: "实时行情",
  chartBody: "报告所依据的市场，仍在变动。",
  chartLoading: "加载中…",
  chartLive: "实时",
  chartPolling: "轮询中",
  chartError: "不可用",
  chartFooter: "1 分钟 K 线 · REST 初始化，WebSocket 推送。",

  panelSignals: "早期信号扫描",
  panelSignalsBody: "持仓量、资金费率与主动成交流向，给出 A 至 E 评级。",
  signalGrade: "评级",
  signalScore: "综合评分",
  signalRegime: "市场状态",
  signalComponents: "分项指标",
  signalDegraded: "该交易对没有合约市场——评级仅依据现货数据。",
  signalWeight: "权重",
  signalExcludedNote:
    "变暗的分项本次运行没有取到数据，已从评分中排除；总分按实际可用的权重归一化。",

  reportDownload: "下载 PDF",
  reportOpen: "新标签页打开",
  reportGenerating: "生成中…",
  pdfLanguageNote:
    "PDF 以英文输出——jsPDF 内置字体无法绘制中日韩字形，而嵌入中文字体会让打包体积增加数兆字节。中文标题保存在文档元数据中。",

  langSwitch: "切换语言",
};

export type Dictionary = typeof en;
export type MessageKey = keyof Dictionary;

export const DICTIONARIES: Record<"en" | "zh", Dictionary> = {
  en,
  zh: zh as Dictionary,
};
