# Token Deployment Reference (Clanker v4)

## Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Token name |
| `symbol` | string | Token ticker |
| `tokenAdmin` | address | Admin wallet (controls vault + metadata) |

## Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image` | string | none | IPFS URI or HTTPS URL for token logo |
| `vanity` | boolean | false | Generate "b07" vanity suffix |
| `metadata.description` | string | none | Token description |
| `metadata.socialMediaUrls` | array | [] | Social links: `{platform, url}` |
| `metadata.auditUrls` | string[] | [] | Audit report links |

## Pool Configuration

```typescript
pool: {
  pairedToken: address,       // Default: WETH on Base
  initialMarketCap: string,   // In paired token units (default "10" ETH)
  positions: "Standard" | "Project",
}
```

**Paired Token Options:**
| Token | Address | Use Case |
|-------|---------|----------|
| WETH | `0x4200000000000000000000000000000000000006` | Default, most liquid |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Stable pair |

## Fee Configuration

### Static Fees (Default)

```typescript
fees: {
  type: "static",
  clankerFee: 100,   // bps on token side (max 500 = 5%)
  pairedFee: 100,    // bps on WETH side (max 500 = 5%)
}
```

100 bps = 1%. Default is 1% on both sides.

### Dynamic Fees

```typescript
fees: FEE_CONFIGS.DynamicBasic
// Base: ~0.5%, adjusts with volatility, max 5%
```

**Clanker protocol adds 0.2% on top of configured fees.**

## Reward Recipients

Up to 7 recipients. BPS must sum to 10000.

```typescript
rewards: {
  recipients: [
    {
      recipient: address,     // Who receives fees
      admin: address,         // Who can change recipient (NOT bps)
      bps: number,            // Basis points (10000 = 100%)
      token: "Both" | "Paired" | "Clanker",
    },
  ]
}
```

**Token options:**
- `"Both"` — receive WETH + deployed token fees
- `"Paired"` — receive only WETH fees (default if not specified)
- `"Clanker"` — receive only deployed token fees

**ConLaunch default:**
```typescript
recipients: [
  { recipient: CLIENT, admin: CLIENT, bps: 8000, token: "Both" },    // 80% client
  { recipient: CONLAUNCH, admin: CONLAUNCH, bps: 2000, token: "Both" }, // 20% platform
]
```

## Vault (Token Locking)

```typescript
vault: {
  percentage: number,         // 0-90% of supply to lock
  lockupDuration: number,     // Seconds (min 604800 = 7 days)
  vestingDuration: number,    // Seconds (0 = cliff release, >0 = linear)
  recipient?: address,        // Defaults to tokenAdmin
}
```

**Common configurations:**

| Style | percentage | lockup | vesting | Effect |
|-------|-----------|--------|---------|--------|
| No lock | 0 | - | - | Full supply tradeable |
| Light | 10 | 7 days | 0 | 10% locked 7 days, then cliff release |
| Standard | 20 | 30 days | 30 days | 20% locked, linear unlock over 60 days |
| Strong | 30 | 30 days | 90 days | 30% locked, 4 month total vest |

## Dev Buy

Optional initial purchase at deployment:

```typescript
devBuy: {
  ethAmount: 0.01,   // Buy tokens with this much ETH at launch
}
```

Only works with WETH-paired pools.

## Token Specs

- **Standard:** ERC-20
- **Chain:** Base (8453)
- **Supply:** Fixed (set by Clanker)
- **Liquidity:** Auto-provisioned on Uniswap V4
- **Non-mintable:** Cannot increase supply after deployment

## Context (Optional Metadata)

```typescript
context: {
  interface: "ConLaunch",
  platform: "Conway",
  messageId: "deployment-request-id",
  id: "unique-token-id",
}
```

Tags the deployment source for analytics and tracking.
