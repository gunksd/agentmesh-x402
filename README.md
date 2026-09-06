# AgentMesh

A network of specialist AI agents that sell their work over HTTP and get paid per
request, on-chain, with no human in the loop.

An orchestrator discovers what it needs, requests a resource, receives
`402 Payment Required`, signs an EIP-712 Permit2 authorisation offline, and the
invoice settles on BNB Smart Chain in seconds. Every hop is a real transfer with a
receipt anyone can check on BscScan.

Built for the Binance Agent OS Mini Hackathon.

## What actually runs

Verified end to end on BSC Testnet — five agents paid in a single run:

| Agent | Charges | Settlement |
|---|---|---|
| Market Data | $0.01 | [`0x505809d1…`](https://testnet.bscscan.com/tx/0x505809d1140158a984750a9dc91322bc8eb9089f1440876cb401e37878653c7d) |
| Orderbook Depth | $0.02 | [`0x0329a8b5…`](https://testnet.bscscan.com/tx/0x0329a8b5e2ae79c1500d9d9f218afd7ab759309a896b77fa92e8ed20e37f93e4) |
| Momentum | $0.015 | [`0xcd595711…`](https://testnet.bscscan.com/tx/0xcd595711775297e0e5ffe0a4e22fe44e03937ae46546ee70b9beff8351fe1f5f) |
| Risk | $0.02 | [`0xf4d34d53…`](https://testnet.bscscan.com/tx/0xf4d34d5312cd44e8b75a319a29c31b8160411ba973e5ca4f705149313a19094a) |
| Report Writer | $0.05 | [`0xe7b71554…`](https://testnet.bscscan.com/tx/0xe7b7155461ce7579a2c9413ea1a70d172942a852b9c403cdc4ee11255d18ef44) |

**$0.115 per run, 9.1 seconds, zero human approvals.** The first four settle
concurrently and landed in the same block (129478811).

## How a payment happens

```
Orchestrator                Agent                     Facilitator            BSC
     │                        │                            │                  │
     ├── GET /market-data ───►│                            │                  │
     │                        │                            │                  │
     │◄── 402 + requirements ─┤                            │                  │
     │    amount, asset, payTo, extra.spenderAddress       │                  │
     │                        │                            │                  │
     ├─ sign EIP-712 locally  │                            │                  │
     │  (no RPC, no gas)      │                            │                  │
     │                        │                            │                  │
     ├── retry + signature ──►│                            │                  │
     │                        ├──── POST /verify ─────────►│                  │
     │                        │◄─── isValid ───────────────┤  (off-chain)     │
     │                        │                            │                  │
     │                        ├──── POST /settle ─────────►│                  │
     │                        │                            ├─ permitWitness ─►│
     │                        │                            │  (gas sponsored) │
     │                        │◄─── tx hash ───────────────┤                  │
     │                        │                            │                  │
     │◄── 200 + data ─────────┤                            │                  │
     │    PAYMENT-RESPONSE header carries the receipt      │                  │
```

Verification runs before settlement deliberately: checking a signature is free and
catches bad authorisations before gas is spent, while settlement is the
irreversible step.

## Which Binance surfaces this uses

| Surface | Status | Notes |
|---|---|---|
| B402 Bazaar discovery | **Live** | Public catalog at `binance.com/bapi/ramp/v1/public/ramp/b402`. Queried on every run, no credentials. |
| Cross-vendor payment | **Live** | Reads and validates 402 challenges from third-party Bazaar endpoints — x402 v2 on BNB Smart Chain, decoded off their wire. |
| Binance market data | **Live** | Spot tickers, order book depth and klines behind every paid response. |
| Permit2 settlement | **Live** | Real transfers via Uniswap's canonical Permit2, `0x0000…78BA3`. |
| Order preview | **Shipped** | Executable order parameters marked `awaiting_human_approval`. |
| Agent OS MCP server | Coming next | OAuth 2.1 with PKCE and a hosted `client_id` metadata document, implemented end to end at `/api/mcp/connect`. Binance currently admits a fixed set of MCP clients; market reads switch over once self-hosted agents are eligible. |
| B402 facilitator | Coming next | `verify`/`settle` client written against Binance's spec including RSA-SHA256 request signing. Activates on merchant onboarding. |
| Bazaar listing | Coming next | Publishing our own agents so third parties can discover and pay them. Listing metadata attaches to a V2 settle, so it follows from facilitator access. |

### On the facilitator

The facilitator is an interface with two implementations, so settlement can move
to Binance without touching anything else:

- **`self`** — verifies signatures locally and calls Permit2 directly, with a
  relayer EOA sponsoring gas. This is what produced the transactions above.
- **`b402`** — delegates to Binance. Complete against the documented contract.

Set `B402_BASE_URL`, `B402_CLIENT_ID`, `B402_ACCESS_TOKEN`, `B402_PRIVATE_KEY` and
`B402_SPENDER_ADDRESS` and settlement routes through Binance instead. The paying
agent never notices — it only ever reads `extra.spenderAddress` out of the 402
response.

## Running it

```bash
npm install
npm run wallets          # generate relayer, orchestrator and payTo keys
```

Write the output to `.env.local`, add `NEXT_PUBLIC_CHAIN_ID=97`, then fund the
relayer with testnet BNB from the [BNB Chain faucet](https://www.bnbchain.org/en/testnet-faucet).

```bash
npm run deploy:token     # deploy MeshUSD, fund orchestrator, approve Permit2
```

Add the printed `NEXT_PUBLIC_MOCK_USDC_ADDRESS` to `.env.local`, then:

```bash
npm run dev
```

### Environment

| Variable | Purpose |
|---|---|
| `RELAYER_PRIVATE_KEY` | Facilitator. Pays gas and is the Permit2 spender. |
| `ORCHESTRATOR_PRIVATE_KEY` | Pays agent invoices. Needs tokens, not gas. |
| `NEXT_PUBLIC_PAY_TO_ADDRESS` | Receives agent revenue. |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS` | Settlement token on testnet. |
| `NEXT_PUBLIC_CHAIN_ID` | `97` testnet, `56` mainnet. Mainnet switches to real USDC. |
| `X402_FACILITATOR` | `self` or `b402`. Auto-detects from B402 credentials. |

## Notes from building this

**Permit2 signing has three silent failure modes.** The EIP-712 domain has no
`version` field — adding one shifts the domain separator and verification fails
with no useful error. The witness struct must be named exactly `Witness`. Field
order within each struct is part of the type hash. All three are in
`src/lib/x402/permit2.ts` with the reasoning attached.

**`/verify` does not check ERC-20 allowance.** A payer who never approved Permit2
passes verification and only fails at settle with `TRANSFER_FROM_FAILED`. The
deploy script approves up front so this cannot bite.

**Concurrent settlement needs managed nonces.** Four agents paid in parallel from
one relayer meant viem fetched the same pending nonce four times; the RPC accepted
one and rejected the rest as "missing or invalid parameters". `src/lib/x402/nonce.ts`
serialises allocation while leaving broadcast concurrent. That cache is
per-process, so a multi-instance deployment wants a shared counter or one relayer
per instance.

## Layout

```
src/lib/x402/          protocol: types, permit2 signing, verify, settle,
                       facilitator selection, b402 client, paid fetch client
src/lib/agents/        registry, market data, analysis, orchestrator, bazaar
src/app/api/agents/    five paid endpoints behind the 402 paywall
src/app/api/facilitator/  supported, verify, settle
src/app/api/orchestrate/  SSE stream of protocol events
contracts/             MeshUSD, the testnet settlement token
scripts/               compile, wallet generation, deploy
```

## Caveats

Demo software, testnet by default, not audited. The agents do deterministic maths
over live market data rather than model inference, so a reviewer re-running the
demo gets reproducible output. Nothing here is financial advice.
