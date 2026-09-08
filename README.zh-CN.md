<div align="center">

<img src="src/app/icon.svg" alt="AgentMesh" width="96" height="96">

# AgentMesh

**让 AI Agent 互相雇佣，并在链上自动结账。**

一个专业 AI Agent 通过 HTTP 出售自身能力的网络 —— 按次收费，无需订阅、无需开票、全程无人工介入。

[![在线演示](https://img.shields.io/badge/演示-agentmesh--x402.vercel.app-0B63F6?style=flat-square&logo=vercel&logoColor=white)](https://agentmesh-x402.vercel.app)
[![x402](https://img.shields.io/badge/x402-v2-0B63F6?style=flat-square)](https://github.com/coinbase/x402)
[![BNB Chain](https://img.shields.io/badge/BNB%20Smart%20Chain-测试网-F0B90B?style=flat-square&logo=binance&logoColor=white)](https://testnet.bscscan.com/)
[![Binance Agent OS](https://img.shields.io/badge/Binance-Agent%20OS-0B63F6?style=flat-square&logo=binance&logoColor=white)](https://www.binance.com/en/agent-os)

[![付费 Agent](https://img.shields.io/badge/付费%20Agent-6-0B63F6?style=flat-square)](#六个-agent)
[![单次成本](https://img.shields.io/badge/单次成本-%240.145-0F9D58?style=flat-square)](#实测数据)
[![人工确认](https://img.shields.io/badge/人工确认-0-0F9D58?style=flat-square)](#实测数据)
[![License](https://img.shields.io/badge/license-MIT-8A99B3?style=flat-square)](LICENSE)

[English](README.md) ·
[快速开始](#快速开始) ·
[创新点](#五个创新点) ·
[实测数据](#实测数据)

</div>

---

## 项目简介

### 它解决什么问题

今天两个 AI Agent 想互相调用能力，只有两条路，两条都不成立：

- **人工预先充值订阅** —— 需要人提前开户、充值、配置 API key。Agent 无法自主发现并使用一个它此前不知道的服务，清单必须由人预先写好。
- **走中心化结算方** —— 引入一个必须被双方信任的中间人，它掌握资金、可以审查交易、并对每笔抽成。这与 Agent 自主协作的前提相冲突。

缺的不是算力，也不是模型能力，是**一条 Agent 之间可以直接走通的支付通道**。

### 工作流

AgentMesh 把每个 Agent 做成一个付费 HTTP 端点。编排方需要某项能力时：

```
① 发现   查询币安 B402 Bazaar 公开目录，找到接受 x402 付款的端点
           ↓
② 报价   请求资源 → 收到 402 Payment Required
           携带金额、代币、网络、Permit2 spender 地址
           ↓
③ 签名   本地签署 EIP-712 Permit2 授权
           无 RPC 调用、无需 Gas、无钱包弹窗，耗时几毫秒
           ↓
④ 验证   Facilitator 离链校验签名（免费，先挡掉无效授权）
           ↓
⑤ 结算   提交转账到 BNB Smart Chain 上的 Permit2
           Gas 由 facilitator 代付，付款方不需要持有 BNB
           ↓
⑥ 交付   结算确认后释放数据，返回交易哈希供任何人核验
```

**先验证再结算是有意的**：校验签名免费，能在花掉 Gas 之前挡掉坏签名；而结算是不可逆的一步。顺序反了会持续为无效授权付费。

### 六个 Agent

前五个读取市场，**并行付费**；报告 Agent 消费它们的产出，最后执行。

| Agent | 能力 | 单价 |
|---|---|---|
| 行情数据 | 实时价格、24 小时区间、成交量 | $0.010 |
| 盘口深度 | 买卖失衡、流动性墙、滑点估算 | $0.020 |
| 动量 | 24 小时涨跌、区间位置、量能趋势 | $0.015 |
| 风险 | 已实现波动率、95% VaR、杠杆上限 | $0.020 |
| **信号扫描** | 合约持仓量异动、资金费率、主动成交流向 → A–E 评级 | $0.030 |
| 报告撰写 | 汇总研判、方向判断、可执行下单参数 | $0.050 |

合计 **$0.145** 一次完整运行。

---

## 快速开始

### 前置条件

| 项目 | 要求 |
|---|---|
| Node.js | 20 或更高（项目在 24 上开发） |
| 测试网 BNB | 少量，用于部署合约和代付 Gas |
| 网络 | 需能访问币安 API。中国大陆及部分地区可能需要代理 |

无需币安账号，无需 API key —— 用到的币安接口全部是公开免鉴权的。

### 1. 安装

```bash
git clone https://github.com/gunksd/agentmesh-x402.git
cd agentmesh-x402
npm install
```

### 2. 生成钱包

```bash
npm run wallets
```

输出三个角色的私钥：

- **RELAYER** —— facilitator 的中继钱包，代付每笔结算的 Gas，同时是 Permit2 的 spender
- **ORCHESTRATOR** —— 编排方，为每张账单付费。需要代币，不需要 BNB
- **PAY_TO** —— Agent 收入的收款地址

把输出写入 `.env.local`（可参考 `.env.example`）：

```bash
cp .env.example .env.local
# 然后把 npm run wallets 的输出填进去
```

> **为什么 relayer 同时是 spender**：Permit2 会校验签名里的 `spender` 与 `msg.sender` 是否一致。两者必须是同一个地址，否则结算会 revert。

### 3. 领测试网 BNB

把 **RELAYER 地址**（不是私钥）贴到水龙头：

👉 https://www.bnbchain.org/en/testnet-faucet

领 0.05 tBNB 足够部署加数十次结算。

### 4. 部署结算代币

```bash
npm run deploy:token
```

这一步会依次做四件事：

1. 编译 `contracts/MeshUSD.sol`（6 位小数，对齐 USDC）
2. 部署到 BSC 测试网
3. 给编排方铸 1000 mUSD
4. **对 Permit2 授权** —— 这步容易漏且难排查

> **为什么第 4 步关键**：facilitator 的 `/verify` **不检查 ERC-20 授权**。没有对 Permit2 approve 的钱包能通过验证，但在结算时才报 `TRANSFER_FROM_FAILED`。部署脚本提前授权，规避这个坑。

把输出的代币地址填进 `.env.local`：

```
NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x...
```

### 5. 启动

```bash
npm run dev
```

打开 http://localhost:3000，选一个交易对，点「开始运行」。

---

## 验证是否装对了

按顺序跑这几条，每条都应返回预期结果：

```bash
# ① Agent 应返回 402（付费墙生效）
curl -s http://localhost:3000/api/agents/market-data?symbol=BTCUSDT | head -c 200

# ② Facilitator 配置（应显示 mode: self、gasSponsored: true）
curl -s http://localhost:3000/api/facilitator/supported

# ③ 上游可达性诊断（币安 API 是否被地域封锁）
curl -s http://localhost:3000/api/diag

# ④ 跑完整流水线（会真实花费测试币）
curl -N "http://localhost:3000/api/orchestrate?symbol=BTCUSDT&notional=25000"
```

第 ④ 条会输出 SSE 事件流。成功的话你会看到 6 组 `agent:quoted` → `agent:signed` → `agent:settled` → `agent:delivered`，最后一条 `run:complete` 带总花费和耗时。

### 常见问题

| 现象 | 原因与解法 |
|---|---|
| `TRANSFER_FROM_FAILED` | 编排方未对 Permit2 授权。重跑 `npm run deploy:token` |
| `relayer_out_of_gas` | RELAYER 的 tBNB 用完了，去水龙头再领 |
| `relayer_nonce_collision` | 并发结算撞 nonce。已内置重试，持续出现说明多实例共用一个 relayer |
| 上游超时 / 451 | 币安 API 地域封锁。`/api/diag` 能看到具体状态码，代码已自动回退到 `data-api.binance.vision` |
| Node fetch 超时但 curl 正常 | Node 默认忽略 `HTTPS_PROXY`。`npm run dev` 已带 `NODE_USE_ENV_PROXY=1` |

---

## 部署到生产环境

```bash
npm i -g vercel
vercel link
```

配置环境变量（六项必需）：

```bash
for k in RELAYER_PRIVATE_KEY ORCHESTRATOR_PRIVATE_KEY NEXT_PUBLIC_PAY_TO_ADDRESS \
         NEXT_PUBLIC_MOCK_USDC_ADDRESS NEXT_PUBLIC_CHAIN_ID X402_FACILITATOR; do
  grep "^$k=" .env.local | cut -d= -f2- | vercel env add "$k" production
done

vercel deploy --prod
```

> **区域要固定**：`vercel.json` 已把部署区域锁在 `hnd1`。Vercel 默认的美国区会被 `api.binance.com` 以 HTTP 451 拒绝，而这个故障从付费端点外部完全看不见 —— 付费墙先结算、后调用上游，所以地域封锁会表现为「支付成功但资源获取失败」。

---

## 切换到币安 Facilitator

Facilitator 是一个接口、两套实现，所以结算可以整体迁移而不动其他任何代码：

| 实现 | 说明 |
|---|---|
| `self` | 本地验签 + 直接调用 Permit2，relayer 代付 Gas。**演示里的每笔结算都出自这条路径** |
| `b402` | 委托给币安。已按其规范实现完整客户端，含 RSA-SHA256 请求签名 |

填入这五项即自动切换：

```
B402_BASE_URL=
B402_CLIENT_ID=
B402_ACCESS_TOKEN=
B402_PRIVATE_KEY=
B402_SPENDER_ADDRESS=
```

**付款方完全无感** —— 它只读 402 响应里的 `extra.spenderAddress`。

---

## 五个创新点

### 1. 可切换的 Facilitator

B402 的 verify / settle 需要商户上线流程（签发 clientId、注册 RSA 公钥、IP 白名单），黑客松周期内走不完。我们没有 mock 它，而是做成接口双实现：一个环境变量切换，付款方不受影响。

### 2. 跨厂商支付验证

仅有「发现」说明不了什么 —— Bazaar 挂牌只是元数据。所以我们真的去调用**别人**挂上去的端点，解析对方返回的 402。不花钱，因为 402 本身就是未付款响应。

**这暴露了我们自己的一个 bug**：那些端点的 body 和 header 内容不一致 —— body 为向后兼容写 x402 v1 / Base，而 `PAYMENT-REQUIRED` 头写的是 v2 并包含 BNB Smart Chain。客户端原本只读 body，于是一个本可以支付的端点被判成「不支持的方案」。改为优先读 header 后，4 个被探测端点全部兼容；而只读 body 的版本曾错误标记出 4 处网络不匹配和 4 处版本不匹配。

### 3. 持仓量是价格说不出的那部分

价格只能说明「发生了什么」，配合持仓量方向才能说明「是谁在推动」：

| 价格 | 持仓量 | 市场状态 | 含义 |
|---|---|---|---|
| ↑ 涨 | ↑ 增 | 多头建仓 | 新钱进场，延续性最强 |
| ↓ 跌 | ↑ 增 | 空头建仓 | 新开空头，而非多头平仓 |
| ↑ 涨 | ↓ 减 | 空头挤压 | 回补；被迫买盘出清后后继无力 |
| ↓ 跌 | ↓ 减 | 多头平仓 | 认赔离场；通常自行衰竭 |

建仓顺势，挤压和平仓逆势。这个判断在报告方向权重里占 **0.30**，高于 24 小时涨跌的 0.18。

### 4. 评级按「实际可用权重」归一化

信号扫描与盘口 Agent 是**并行**的，所以它永远拿不到盘口失衡数据。把缺失分项当 0 分，会让它恒占 10% 权重却永远拿不到分 —— 系统性压低每一个评级，「数据没取到」被当成了「信号很弱」。

现在分项自己声明数据是否到位，综合分只除以实际到位的权重。被排除的分项在界面上**变暗显示而非隐藏** —— 藏掉会让权重看起来加不到 100%。

### 5. 并行结算在 Serverless 下存活

五个 Agent 由同一个 relayer 并发付费。viem 为每笔交易各自取 pending nonce，于是并发交易读到同一个值，RPC 只接受一笔。

进程内序列化 nonce 分配、保持广播并行即可解决 —— 但每个 Agent 端点在 serverless 上是**独立实例**，兄弟实例的预留互不可见。所以结算在碰撞后重试（抖动退避，最多 5 次）。只有 nonce 冲突会重试：转账 revert 或授权过期每次都会同样失败，重试只是白烧 Gas。

**这是只在生产环境出现的故障**。本地单个 dev server 共享一份缓存，从未复现。

---

## 实测数据

生产环境实跑，BSC 测试网，六笔结算全部确认：

| Agent | 结算交易 |
|---|---|
| 行情数据 | [`0x974b4d82…`](https://testnet.bscscan.com/tx/0x974b4d826eefa41d2b06c66a194e3a8f23da35d737d2fad205b184c25c1ce6fc) |
| 盘口深度 | [`0x64b278e0…`](https://testnet.bscscan.com/tx/0x64b278e09c6b80153225e8e8c414cc7412c30d5c8c4af4bb842ae796f59f3e91) |
| 动量 | [`0x040c7297…`](https://testnet.bscscan.com/tx/0x040c7297df0b5707331d608b2e69a8b336671d12a3ae5c6b6ed1ef3d812091c6) |
| 风险 | [`0x3824b6bc…`](https://testnet.bscscan.com/tx/0x3824b6bc6e79606e4f200161bb0cb9067a51b09467a223467f433984f39b4ea3) |
| 信号扫描 | [`0x91247a76…`](https://testnet.bscscan.com/tx/0x91247a764fd265612d54b7da156532b1dc977d8cb360d4919a96cc99ae4c0239) |
| 报告撰写 | [`0x702e525d…`](https://testnet.bscscan.com/tx/0x702e525d75a79c91a5d19c96b64a147f16d83454b7358bc440b5a79609158222) |

**$0.145 一次运行，9.8 秒，零次人工确认。** 那次运行评级 C（46/100），市场状态为平静，并在花钱之前发现了 6 个第三方付费端点。

---

## 用到的币安能力

| 能力 | 状态 | 说明 |
|---|---|---|
| B402 Bazaar 发现 | **已上线** | 公开目录，每次运行实时查询，无需凭证 |
| 跨厂商支付 | **已上线** | 解析第三方端点的 402 挑战，x402 v2 on BNB Smart Chain |
| 币安行情数据 | **已上线** | 现货行情、盘口、K 线，以及合约持仓量、资金费率、主动成交比 |
| Permit2 结算 | **已上线** | Uniswap 官方部署 `0x0000…78BA3`，真实转账 |
| 下单预览 | **已交付** | 可执行参数，标记为 `awaiting_human_approval` |
| Agent OS MCP | 敬请期待 | OAuth 2.1 + PKCE 已端到端实现于 `/api/mcp/connect`。币安目前仅接入固定名单内的客户端 |
| B402 Facilitator | 敬请期待 | 含 RSA-SHA256 签名的客户端已就绪，商户接入后启用 |
| Bazaar 上架 | 敬请期待 | 把自有 Agent 挂上去。上架元数据附着在 V2 settle 上，紧随 facilitator 权限 |

「敬请期待」三项的代码都已写好，等的是**接入权限**，不是开发工作量。

---

## 界面能看到什么

- **实时 K 线** —— REST 初始化 + WebSocket 推送，canvas 绘制，缓动 y 轴与脉冲前沿
- **交易对搜索** —— 834 个现货交易对实时来自 `exchangeInfo`，其中 179 个标记为币安 Alpha，可筛选
- **支付拓扑** —— 连线只在结算真的在途时才流动，屏幕上动的东西对应真实资金流动
- **协议日志** —— 每个 x402 事件逐条呈现。悬停暂停自动跟随并明确提示
- **A–E 评级** —— 毛笔手绘圈徽章，附全部分项与权重
- **PDF 导出** —— jsPDF 矢量绘制，文字可选中；动态导入，350KB 不进首屏包
- **中英双语** —— 类型化字典 + Context，报告本身在服务端就生成双语

协议术语在两种语言下都保持英文（`402 Payment Required`、`EIP-712`、`Permit2`、错误码）—— 翻译线格式会歪曲报文的实际内容。

---

## 代码结构

```
src/lib/x402/          协议层
  types.ts             x402 v2 线格式
  permit2.ts           EIP-712 签名（三个静默失败点写在注释里）
  verify.ts            离链验证
  settle.ts            链上结算 + 碰撞重试
  nonce.ts             relayer nonce 分配
  facilitator.ts       self / b402 双实现切换
  b402.ts              币安 facilitator 客户端
  paywall.ts           402 守卫中间件
  client.ts            付款方 fetch 客户端

src/lib/agents/        业务层
  registry.ts          Agent 目录与定价
  market.ts            现货行情（多主机回退）
  futures.ts           合约持仓量 / 资金费率 / 主动成交
  signals.ts           A–E 评分
  analysis.ts          六种分析逻辑
  orchestrator.ts      编排 + 并行付费
  bazaar.ts            Bazaar 发现
  interop.ts           跨厂商探测
  order.ts             下单预览
  symbols.ts           交易对目录 + Alpha 交叉比对

src/lib/mcp/           Agent OS MCP：OAuth、token、JSON-RPC 客户端
src/lib/i18n/          类型化字典与本地化内容
src/lib/report/        PDF 导出
contracts/MeshUSD.sol  测试网结算代币
scripts/               编译、生成钱包、部署、演示录制
```

---

## 开发笔记

**Permit2 签名有三个静默失败点。** EIP-712 domain **没有 version 字段** —— 加了会改变 domain separator，验签失败且报错毫无线索。witness 结构体名必须**恰好**是 `Witness`。字段顺序参与 type hash。三处都写在 `src/lib/x402/permit2.ts` 的注释里。

**Alpha 的 `fullyDelisted` 含义是「从 Alpha 下架」** —— 而下架的原因正是毕业到现货。把它当「已失效」过滤掉，会排掉 90 个里的 88 个正在现货交易的交易对，只留下 28 个根本不在现货的。去掉这个过滤后 Alpha 数从 0 变 179。

**首屏动效从 30fps 优化到 60fps。** 原本 260 个 DOM 方块每帧重写 `border-radius` 和 `corner-shape`，实测中位帧时 33.4ms、40 帧里 38 帧超 32ms。改用单 canvas 后中位 16.7ms、p90 17.4ms、零长帧。

---

## 演示资产

```bash
# 生成配音（需 Fish Audio API key）
FISH_API_KEY=sk-... node scripts/build-narration-fish.mjs

# 录制演示视频（会真实花费测试币）
node scripts/record-demo.mjs --url https://your-app.vercel.app --lang zh

# 合并音轨
node scripts/mux-demo.mjs

# 生成 PPT（17 页 PDF + 单页 PNG）
node scripts/build-deck.mjs
```

录制脚本、配音、字幕由同一份时间轴（`scripts/narration.mjs`）驱动，所以画面、语音、字幕不会漂移。

---

## 注意事项

演示软件，默认测试网，未经审计。Agent 做的是对实时行情的确定性数学计算而非模型推理，所以重跑能得到可复现的结果。不构成投资建议。

**下单预览为何停在预览**：项目只申请 `market_data` 与 `account` 两个只读权限。真正下单需要 Agent OS 的 `trade` 权限 —— 我们没有申请，因此代码里**不存在任何能提交订单的路径**。这是设计，不是未完成。

---

## License

MIT —— 见 [LICENSE](LICENSE)。

<div align="center">
<sub>基于 Binance Agent OS 构建 · x402 v2 on BNB Smart Chain</sub>
</div>
