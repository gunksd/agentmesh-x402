/**
 * Narration script: the timeline shared by the recorder, the voice-over, and the
 * subtitles.
 *
 * One source of truth on purpose. The recorder waits out each segment's duration,
 * `say` renders the Chinese line, and the subtitle files are generated from the
 * same offsets — so audio, video and captions cannot drift apart the way they
 * would if each were authored separately.
 *
 * Durations are measured from the synthesised audio rather than guessed: see
 * scripts/build-narration.mjs, which stretches any segment whose speech runs
 * longer than its allotted slot.
 */

/**
 * @typedef {object} Segment
 * @property {string} id            Stable key, used for the audio filename.
 * @property {string} zh            Chinese subtitle text.
 * @property {string} en            English subtitle.
 * @property {string} [speak]       What the voice actually says, when it must
 *                                  differ from the caption. TTS reads "402" as
 *                                  "四百零二" — four hundred and two — but the
 *                                  protocol is spoken "四零二", digit by digit.
 *                                  The caption still shows "402", since that is
 *                                  what a reader needs to see.
 * @property {number} seconds       Minimum on-screen duration for this segment.
 */

/** @type {Segment[]} */
export const SEGMENTS = [
  {
    id: "intro",
    zh: "AgentMesh，一个让 AI Agent 互相雇佣、并在链上自动结账的网络。",
    en: "AgentMesh — a network where AI agents hire each other and settle on-chain.",
    seconds: 6,
  },
  {
    id: "problem",
    zh: "Agent 协作的断点在付费。要么人工预先充值订阅，要么走中心化结算。",
    en: "Agent collaboration breaks at payment: prepaid subscriptions, or a centralised clearer.",
    seconds: 7,
  },
  {
    id: "solution",
    zh: "这里每个 Agent 都是一个付费 HTTP 端点，按次收费，全程无需人工介入。",
    en: "Here every agent is a paid HTTP endpoint, charging per request, with no human in the loop.",
    seconds: 7,
  },
  {
    id: "protocol",
    zh: "流程是 x402 协议：请求资源，收到 402，本地签署 EIP-712 授权，链上结算，然后交付数据。",
    speak:
      "流程是 x 四零二 协议：请求资源，收到 四零二，本地签署 E I P 七一二 授权，链上结算，然后交付数据。",
    en: "The flow is x402: request, receive 402, sign EIP-712 locally, settle on-chain, then deliver.",
    seconds: 9,
  },
  {
    id: "picker",
    zh: "交易对来自 exchangeInfo 实时获取，八百多个，其中一百七十九个同时在币安 Alpha 上交易。",
    en: "Pairs come live from exchangeInfo — 834 of them, 179 also trading on Binance Alpha.",
    seconds: 8,
  },
  {
    id: "chart",
    zh: "报告上方是实时行情。REST 初始化，WebSocket 推送，市场一直在动。",
    en: "Live market above the report: seeded over REST, streamed over WebSocket.",
    seconds: 7,
  },
  {
    id: "run",
    zh: "现在启动一次真实付费运行。六个 Agent，花的是真的测试币。",
    en: "Starting a real paid run. Six agents, spending real testnet funds.",
    seconds: 6,
  },
  {
    id: "parallel",
    zh: "前五个读取市场的 Agent 并行付费，五笔结算同时在途。连线只在真的在转账时才流动。",
    en: "The five market readers are paid concurrently. Edges animate only while money actually moves.",
    seconds: 9,
  },
  {
    id: "log",
    zh: "协议日志逐条记录：402 报价、EIP-712 签名、Permit2 链上结算、资源交付。",
    speak:
      "协议日志逐条记录：四零二 报价、E I P 七一二 签名、Permit 二 链上结算、资源交付。",
    en: "The protocol log records each step: 402 quoted, signed, settled, delivered.",
    seconds: 8,
  },
  {
    id: "grade",
    zh: "第六个 Agent 读取合约持仓量、资金费率和主动成交流向，给出 A 到 E 的评级。",
    en: "The sixth agent reads open interest, funding and taker flow, then grades A to E.",
    seconds: 8,
  },
  {
    id: "regime",
    zh: "价格配合持仓量方向，能区分是新钱进场还是旧仓平掉——这是单看价格得不到的信息。",
    en: "Price paired with open interest separates fresh money from closing positions.",
    seconds: 8,
  },
  {
    id: "report",
    zh: "报告服务端生成中英双语，并输出可执行的下单参数，标记为等待人工确认。",
    en: "The report is generated bilingually server-side, with order parameters awaiting your approval.",
    seconds: 8,
  },
  {
    id: "scope",
    zh: "项目只申请只读权限，代码里不存在任何能下单的路径。网络出售决策，扳机在你手上。",
    en: "Read-only scopes only — no code path can place an order. The mesh sells the decision.",
    seconds: 8,
  },
  {
    id: "interop",
    zh: "这一栏是跨厂商互操作：用我们的客户端解析陌生人挂在 B402 Bazaar 上的付费端点。",
    speak:
      "这一栏是跨厂商互操作：用我们的客户端解析陌生人挂在 B 四零二 Bazaar 上的付费端点。",
    en: "Cross-vendor interop: our client reading 402 challenges from strangers' Bazaar endpoints.",
    seconds: 8,
  },
  {
    id: "roadmap",
    zh: "MCP 与 B402 Facilitator 的代码已经写好，等接入权限落地，切换只需一个环境变量。",
    speak:
      "M C P 与 B 四零二 Facilitator 的代码已经写好，等接入权限落地，切换只需一个环境变量。",
    en: "MCP and the B402 facilitator are written and waiting — the switch is one env var.",
    seconds: 8,
  },
  {
    id: "code",
    zh: "代码全部开源。协议层、六个付费端点、自建 facilitator，README 里写清了每个设计决定的成因。",
    en: "Fully open source: protocol layer, six paid endpoints, self-built facilitator.",
    seconds: 9,
  },
  {
    id: "proof",
    zh: "每一笔支付都在 BSC 测试网留下可验证的收据。一次完整运行零点一四五美元，十秒，零次人工确认。",
    en: "Every payment leaves a verifiable receipt. $0.145 per run, 10 seconds, zero approvals.",
    seconds: 10,
  },
];

/** Total runtime if every segment plays for its minimum duration. */
export const TOTAL_SECONDS = SEGMENTS.reduce((sum, s) => sum + s.seconds, 0);
