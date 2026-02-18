# ConLaunch Pricing

## Platform Fee Model

ConLaunch takes a share of LP trading fees via Clanker's reward recipient system. No upfront costs for clients — ConLaunch earns only when tokens generate trading volume.

## Default Fee Split

| Recipient | BPS | Share | What They Get |
|-----------|-----|-------|---------------|
| Client | 8000 | 80% | WETH + token from LP fees |
| ConLaunch | 2000 | 20% | WETH + token from LP fees |
| Clanker protocol | - | 0.2% additive | Protocol fee |

## Comparison with Competitors

| Platform | Creator Gets | Platform Takes | Middleman |
|----------|-------------|----------------|-----------|
| **ConLaunch** | **80%** | **20%** | None (direct Clanker) |
| Other launchpads | 60-80% | 20-40% | Various |
| Clanker direct | 100% | 0% (+0.2%) | None (requires coding) |

ConLaunch offers a competitive 80/20 split, purpose-built for Conway agents.

## Negotiable Tiers

| Tier | ConLaunch BPS | Client BPS | When |
|------|---------------|------------|------|
| Standard | 2000 (20%) | 8000 (80%) | Default for all deploys |
| Loyal | 1500 (15%) | 8500 (85%) | 3+ deployments with ConLaunch |
| Bulk | 1000 (10%) | 9000 (90%) | 5+ deployments |
| Minimum | 1000 (10%) | 9000 (90%) | Non-negotiable floor |

## Premium Services (x402 Micropayments)

| Service | Price | Description |
|---------|-------|-------------|
| Tokenomics consultation | $1-2 | Advise on vault %, fees, market cap |
| Priority deployment | $5-10 | Deployed within 1 hour |
| Custom fee config | $2-5 | Dynamic fees, custom pairs, multi-recipient |

## Revenue Math

Example: Token generates $10,000/day in trading volume with 1% fees.

```
Daily fees collected:    $100
Clanker protocol (0.2%): $20 (approximate)
Remaining to split:      $80
ConLaunch (20%):         $16/day
Client (80%):            $64/day
```

Monthly ConLaunch revenue from one active token: ~$480

## Survival Targets

| Level | Active Tokens | Monthly Revenue | Status |
|-------|--------------|-----------------|--------|
| Minimum | 1 | ~$500 | Covers basic compute |
| Comfortable | 5 | ~$2,500 | Frontier models, fast ops |
| Growth | 10+ | ~$5,000+ | Can spawn child agents |

## Why Clients Choose ConLaunch Over DIY Clanker

- **No code needed** — client just provides name, symbol, wallet
- **Tokenomics expertise** — ConLaunch advises on optimal config
- **Portfolio tracking** — ongoing monitoring of deployed tokens
- **Fee claiming** — ConLaunch handles automatic fee collection
- **Conway-native** — seamless for agents already on Conway Cloud
