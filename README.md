# ConLaunch

**Native Conway Agent Launchpad** — deploy tokens on Base via Clanker SDK v4 with automatic Uniswap V4 liquidity pools.

The native launchpad for [Conway](https://conway.tech) agents.

Website: [conlaunch.com](https://conlaunch.com)

## What It Does

ConLaunch is a token launchpad built as a Conway Automaton agent. Other Conway agents call ConLaunch's API to deploy ERC-20 tokens on Base. Clanker SDK v4 handles all smart contracts and security — ConLaunch is the service layer.

```
Conway Agent → POST /deploy → ConLaunch API → Clanker SDK v4 → Base + Uniswap V4
                                    ↓
                        80% LP fees → client agent
                        20% LP fees → ConLaunch treasury
```

## Features

- **REST API** — `POST /deploy` to launch a token, `GET /tokens` to list, `POST /fees/claim-all` to collect
- **MCP Server** — native integration for Claude/OpenClaw agents via `deploy_token` tool
- **Clanker SDK v4** — direct on-chain deployment, Uniswap V4 pools, audited contracts
- **80/20 Fee Split** — clients keep 80% of LP trading fees, ConLaunch keeps 20%
- **Vaulting & Vesting** — lock 0-90% of supply, configurable cliff + linear vest
- **ERC-8004 Auth** — verify Conway agent identity on-chain (when registry is live)
- **SQLite Tracking** — all deployments, fee claims, and stats persisted
- **$CONLAUNCH Token** — platform token on Base, LP fees flow to treasury
- **Auto Fee Claiming** — batch claim accumulated LP fees across all deployed tokens

## Quick Start

```bash
git clone https://github.com/conlaunch/conlaunch.git
cd conlaunch
npm install
cp .env.example .env
# Edit .env: set PRIVATE_KEY
npm run dev
```

## Deploy $CONLAUNCH Token

```bash
PRIVATE_KEY=0x... npm run deploy-token
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Platform info |
| `GET` | `/stats` | Launchpad statistics |
| `GET` | `/tokens` | All deployed tokens |
| `GET` | `/tokens/:address` | Token details |
| `GET` | `/clients/:wallet/tokens` | Tokens by client |
| `POST` | `/deploy` | Deploy a new token |
| `GET` | `/fees/:address` | Check available fees |
| `POST` | `/fees/:address/claim` | Claim fees |
| `POST` | `/fees/claim-all` | Batch claim all |

### Deploy Request

```json
{
  "name": "AgentToken",
  "symbol": "AGNT",
  "clientWallet": "0x...",
  "description": "My Conway agent token",
  "image": "https://...",
  "vault": { "percentage": 20, "lockupDays": 14, "vestingDays": 30 }
}
```

### Deploy Response

```json
{
  "success": true,
  "token": {
    "address": "0x...",
    "txHash": "0x...",
    "basescan": "https://basescan.org/token/0x...",
    "dexscreener": "https://dexscreener.com/base/0x..."
  },
  "rewards": [
    { "recipient": "0xclient...", "bps": 8000, "label": "client" },
    { "recipient": "0xconlaunch...", "bps": 2000, "label": "conlaunch" }
  ]
}
```

## MCP Server

For agents that support MCP (Model Context Protocol):

```bash
npm run mcp
```

Tools: `deploy_token`, `check_fees`, `claim_fees`, `claim_all_fees`, `list_tokens`, `launchpad_stats`

## Project Structure

```
conlaunch/
├── src/
│   ├── index.ts            # Entry point — starts API server
│   ├── server.ts           # Hono REST API
│   ├── deployer.ts         # Clanker SDK v4 wrapper
│   ├── auth.ts             # ERC-8004 agent identity verification
│   ├── fees.ts             # Fee checking & claiming
│   ├── db.ts               # SQLite persistence
│   ├── types.ts            # TypeScript types & constants
│   └── mcp/
│       └── server.ts       # MCP server for agent integration
├── scripts/
│   ├── deploy-token.ts     # Deploy $CONLAUNCH token
│   └── claim-fees.ts       # Batch fee claiming CLI
├── skills/
│   └── token-deployer/     # Conway Automaton skill files
│       ├── SKILL.md
│       └── references/
├── genesis-prompt.md        # Automaton genesis prompt
├── SOUL.md                  # Automaton identity
├── package.json
├── tsconfig.json
└── .env.example
```

## Deploy to Conway Cloud

1. Clone [Automaton](https://github.com/Conway-Research/automaton) and run setup wizard
2. Paste `genesis-prompt.md` as the genesis prompt
3. Copy `skills/token-deployer/` to `~/.automaton/skills/`
4. Copy `SOUL.md` to `~/.automaton/SOUL.md`
5. Fund wallet with ETH on Base (~0.05 ETH)
6. Agent boots → starts API server → exposes port → ready for deployments

## Comparison

| Feature | Details |
|---------|---------|
| For | **Conway agents** |
| Infrastructure | Clanker SDK v4 (audited) |
| Chain | Base |
| Creator gets | **80%** of LP trading fees |
| Platform takes | **20%** |
| API | REST + MCP |
| Agent auth | ERC-8004 on-chain identity |

## License

MIT
