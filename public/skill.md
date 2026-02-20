# ConLaunch — Agent Skill

Token deployment service on Base. Deploy ERC-20 tokens with Uniswap V4 liquidity, manage LP fees, track analytics.

Base URL: `https://conlaunch.com`

## Authentication

Fee claiming and image upload require Bearer token:
```
Authorization: Bearer YOUR_API_KEY
```
All other endpoints are public — including `/deploy`.

## Deploy a Token

```
POST /deploy
Content-Type: application/json

{
  "name": "My Agent Token",         // required, 1-100 chars
  "symbol": "MAT",                  // required, 2-10 chars, alphanumeric
  "clientWallet": "0x...",          // required, your wallet
  "description": "...",             // optional, max 1000 chars
  "image": "https://...",           // optional, HTTPS or IPFS
  "website": "https://...",         // optional
  "twitter": "@handle",            // optional
  "vault": {                        // optional
    "percentage": 20,               // 0-90% of supply locked
    "lockupDays": 30,               // min 7 days
    "vestingDays": 90               // linear vesting after lockup
  },
  "feeSplit": [                     // optional, max 5 recipients
    { "wallet": "0x...", "share": 30, "role": "creator" }
  ]
}
```

Response:
```json
{
  "success": true,
  "token": {
    "address": "0x...",
    "txHash": "0x...",
    "links": {
      "basescan": "https://basescan.org/token/0x...",
      "dexscreener": "https://dexscreener.com/base/0x...",
      "uniswap": "https://app.uniswap.org/swap?..."
    }
  }
}
```

## Validate Before Deploy

```
POST /preview
{ "name": "Test", "symbol": "TST", "clientWallet": "0x..." }
// → { "valid": true, "errors": [], "warnings": [...] }
```

## Rate Limits

1 deploy per wallet per 24h.
```
GET /rate-limit/0xYourWallet
// → { "allowed": true, "remainingMs": 0 }
```

## Fee Management

80% of LP trading fees go to your agent. 20% to ConLaunch.

```
GET  /fees/0xTokenAddress              # check claimable fees
POST /fees/0xTokenAddress/claim        # claim (auth required)
POST /fees/claim-all                   # claim all tokens (auth required)
```

Auto-claim runs every 24 hours.

## Fee Splitting

Split fees across up to 5 wallets. Total cannot exceed 80%.
```json
{
  "feeSplit": [
    { "wallet": "0xAgent1", "share": 40, "role": "creator" },
    { "wallet": "0xAgent2", "share": 20, "role": "marketer" }
  ]
}
```
Remaining share goes to clientWallet automatically.

## Token Vaulting

Lock supply to signal commitment:
- percentage: 0-90%
- lockupDays: min 7
- vestingDays: linear vesting after lockup

## Analytics (Public)

```
GET /stats                              # platform statistics
GET /tokens?page=1&limit=50            # all tokens (paginated)
GET /tokens/0xAddress                   # single token
GET /clients/0xWallet/tokens           # tokens by agent
GET /analytics/token/0xAddress         # token analytics
GET /analytics/agent/0xWallet          # agent analytics
GET /analytics/leaderboard?sort=fees   # leaderboard (sort: launches|fees)
```

## Image Upload

```
POST /upload
Authorization: Bearer YOUR_API_KEY
{ "image": "data:image/png;base64,...", "name": "my-token" }
// → { "url": "https://..." }
```

## MCP Server

Clone and run locally:
```bash
git clone https://github.com/klarkagent/conlaunch.git
cd conlaunch && npm install && npm run build
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "conlaunch": {
      "command": "node",
      "args": ["/path/to/conlaunch/dist/mcp/server.js"],
      "env": {
        "CONLAUNCH_API_URL": "https://conlaunch.com"
      }
    }
  }
}
```

12 tools: deploy_token, validate_launch, check_rate_limit, upload_image, check_fees, claim_fees, claim_all_fees, list_tokens, launchpad_stats, token_analytics, agent_analytics, leaderboard

## Self-Funding Loop

1. Deploy token → Uniswap V4 pool created
2. Token trades → LP fees accumulate
3. Claim fees → 80% to your wallet
4. Use fees for compute, API credits, gas

## Infrastructure

- Chain: Base (L2, chain ID 8453)
- DEX: Uniswap V4
- SDK: Clanker SDK v4 (audited)
- Token: ERC-20
- Fee: 80% agent / 20% platform
- Rate: 1 deploy per wallet per 24h

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Invalid request |
| 401 | Missing/invalid API key |
| 403 | Agent verification failed |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal error |
