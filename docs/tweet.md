# 发推文稿

## 主推文（英文，附视频 + GitHub）

> Agents that hire each other, and settle the bill on-chain.
>
> AgentMesh is a network of 6 specialist agents that sell their work over HTTP.
> An orchestrator discovers what it needs, gets `402 Payment Required`, signs an
> EIP-712 Permit2 authorisation offline, and settles on BNB Smart Chain.
>
> $0.145 per run. 9.8 seconds. Zero human approvals.
>
> Built on Binance Agent OS 🟡
>
> Live → agentmesh-x402.vercel.app
> Code → github.com/gunksd/agentmesh-x402
>
> #BinanceAgentOS #x402 #BNBChain

（附 `docs/agentmesh-demo.mp4`）

---

## 中文版主推文

> 让 AI Agent 互相雇佣，并在链上自动结账。
>
> AgentMesh 是一个由 6 个专业 Agent 组成的网络，每个都通过 HTTP 出售自己的能力。
> 编排方发现所需服务后收到 `402 Payment Required`，本地签署 EIP-712 授权，
> 几秒内在 BNB Smart Chain 完成结算。
>
> 单次运行 $0.145，9.8 秒，零次人工确认。
>
> 基于 Binance Agent OS 构建 🟡
>
> 演示 → agentmesh-x402.vercel.app
> 代码 → github.com/gunksd/agentmesh-x402
>
> #BinanceAgentOS #x402 #BNBChain

---

## 展开长贴（Thread，接在主推文下）

**2/ 用到了哪些 Agent OS 能力**

> 🟢 **B402 Bazaar 发现** — 每次运行实时查询公开目录，无需 API key。上次运行发现 6 个第三方付费端点。
>
> 🟢 **跨厂商支付** — 用我们的客户端去解析陌生人挂在 Bazaar 上的端点，读取对方真实的 402 挑战。4/4 全部兼容。
>
> 🟢 **Permit2 链上结算** — Uniswap 官方合约，relayer 代付 Gas，付款方不需要持有 BNB。
>
> 🟢 **币安行情数据** — 现货价格、盘口深度、K 线，以及合约持仓量、资金费率、主动成交流向。

**3/ 五个 Agent 并行付费**

> 前五个读取市场的 Agent 同时付费，五笔结算同时在途。
>
> 这是工程上最难的部分：同一个 relayer 地址并发发交易，viem 为每笔各自取 pending nonce，于是全部读到同一个值，RPC 只接受一笔。
>
> 而每个 Agent 端点在 serverless 上是独立实例，兄弟实例的 nonce 预留互相看不见。所以做了碰撞重试 + 抖动退避。
>
> 这个 bug 只在生产环境出现——本地单进程共享缓存，从未复现。

**4/ 第六个 Agent：持仓量异动扫描**

> 价格只能说明「发生了什么」，价格配合持仓量方向才能说明「是谁在推动」：
>
> 涨 + 持仓增 → 多头建仓（新钱进场）
> 跌 + 持仓增 → 空头建仓
> 涨 + 持仓减 → 空头挤压（回补，易衰竭）
> 跌 + 持仓减 → 多头平仓（认赔）
>
> 建仓顺势，挤压和平仓逆势。这个判断在报告方向权重里占 0.30，高于 24h 涨跌的 0.18。
>
> 输出 A–E 评级，附全部分项和权重。

**5/ 评级只对「实际可用权重」归一化**

> 信号扫描和盘口 Agent 是并行的，所以它永远拿不到盘口失衡数据。
>
> 把缺失分项当 0 分，会让它恒占 10% 权重却永远拿不到分——系统性压低每一个评级。「数据没取到」被当成了「信号很弱」。
>
> 现在分项自己声明数据是否到位，综合分只除以实际到位的权重。被排除的分项在界面上变暗显示而非隐藏——藏掉会让权重看起来加不到 100%。

**6/ 网络出售决策，扳机在你手上**

> 报告 Agent 输出可执行的订单参数：方向、挂在价差内侧的限价、按实测波动率缩放的止损、2:1 目标位。然后停在这里。
>
> 项目只申请 `market_data` 和 `account` 两个只读权限。真正下单需要 Agent OS 的 `trade` 权限——我们没申请，所以代码里不存在任何能提交订单的路径。
>
> 这是设计，不是未完成。

**7/ 一个我自己的 bug，值得说**

> 做跨厂商验证时发现，Bazaar 上那些第三方端点的 body 和 header 内容不一致：
>
> body 为向后兼容写 x402 v1 / Base 链
> `PAYMENT-REQUIRED` 头里写 v2，并且包含 BNB Smart Chain
>
> 我们的客户端原本只读 body，于是一个**本可以支付**的端点被判成「不支持的方案」。
>
> 改为优先读 header 后：4/4 全部兼容。而只读 body 的版本曾错误标记出 4 处网络不匹配和 4 处版本不匹配。

**8/ 敬请期待**

> 🔜 **Agent OS MCP** — OAuth 2.1 + PKCE 已端到端实现，托管 client_id 元数据文档。币安目前仅接入固定名单内的 MCP 客户端；自建 Agent 获得资格后，行情读取会立即切换过去。
>
> 🔜 **B402 Facilitator** — 含 RSA-SHA256 请求签名的完整客户端已就绪，商户接入后启用。切换只需一个环境变量，付款方完全无感。
>
> 🔜 **Bazaar 上架** — 把自有 Agent 挂上去，让第三方也能发现并付费调用。
>
> 这三项代码都已写好，等的是接入权限，不是开发工作量。

**9/ 技术栈**

> Next.js 16 · React 19 · TypeScript strict · viem 2.x · Permit2
>
> 六个付费 HTTP 端点、自建 facilitator（verify + settle）、SSE 实时协议日志、实时 K 线（REST 初始化 + WebSocket 推送）、834 个交易对可搜索（179 个标记币安 Alpha）、中英双语、PDF 报告导出。
>
> README 里写清了每个设计决定背后的成因，包括踩过的坑。
>
> github.com/gunksd/agentmesh-x402

---

## 备选：单条精简版（不发 thread）

> 🟡 让 AI Agent 互相雇佣，链上自动结账
>
> AgentMesh：6 个 Agent 通过 HTTP 卖能力，收到 402 → 签 EIP-712 → BNB Chain 结算 → 交付数据。全程无人工。
>
> ✅ B402 Bazaar 实时发现
> ✅ 跨厂商 402 验证（4/4 兼容）
> ✅ Permit2 结算，Gas 代付
> ✅ 持仓量异动 A–E 评级
>
> $0.145/次 · 9.8 秒 · 0 次确认
>
> 🔗 agentmesh-x402.vercel.app
> 💻 github.com/gunksd/agentmesh-x402
>
> #BinanceAgentOS #x402 #BNBChain

---

## 发布清单

- [ ] 关注 @Binance
- [ ] 转发活动原帖
- [ ] 回复活动原帖，附上视频 + GitHub 链接
- [ ] 填写问卷
- [ ] 确认所在地区不在排除名单（US、UK、EEA、香港、新加坡）

**截止：9月8日 23:59 UTC**

## 附件

- 视频：`docs/agentmesh-demo.mp4`（138.7s，13MB，中文配音 + 中英字幕）
- PPT：`docs/deck/AgentMesh.pdf`（17 页）
- 单页图：`docs/deck/slides/01-17.png`（3840×2160，适合配图）

## 提醒

主推文如果字数超限，优先删掉 hashtag 那行，保留链接。
X 的视频上传上限是 512MB / 2分20秒——我们 138.7 秒刚好在内。
