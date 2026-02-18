# Fee Management Reference (Clanker v4)

## How Fees Work

Every swap on a deployed token's Uniswap V4 pool generates trading fees. These fees are split among the configured reward recipients.

**Fee flow:**
```
User swaps on Uniswap V4
        ↓
1% trading fee collected (default, configurable)
        ↓
0.2% → Clanker protocol (additive, non-configurable)
        ↓
Remaining → split among reward recipients by BPS
```

## Checking Available Fees

Write and execute via `exec`:

```typescript
import { Clanker } from 'clanker-sdk/v4';
// ... setup ...

const rewards = await clanker.availableRewards("TOKEN_ADDRESS");
console.log(JSON.stringify(rewards, null, 2));
```

Output shows claimable amounts per recipient in WETH and/or token.

## Claiming Fees

```typescript
const tx = await clanker.claimRewards("TOKEN_ADDRESS");
console.log("Claim TX:", tx);
```

- No minimum claim threshold
- Gas cost: ~0.001-0.005 ETH on Base
- Claim all deployed tokens in a loop for efficiency

## Batch Claiming (All Tokens)

```typescript
const deployedTokens = ["0xABC...", "0xDEF...", "0x123..."];

for (const token of deployedTokens) {
  try {
    const rewards = await clanker.availableRewards(token);
    // Only claim if rewards exist
    if (rewards && rewards.length > 0) {
      const tx = await clanker.claimRewards(token);
      console.log(`Claimed ${token}: ${tx}`);
    }
  } catch (e) {
    console.error(`Failed ${token}: ${e.message}`);
  }
}
```

## Reward Recipient Management

- `admin` can update the `recipient` address (redirect fees to new wallet)
- `admin` CANNOT change `bps` allocation (set at deployment, immutable)
- To update recipient:

```typescript
// This is done through the Clanker contract directly
// The admin calls updateRecipient on the reward contract
```

## ConLaunch Fee Strategy

1. **At deployment**: Set ConLaunch wallet as a reward recipient with 2000 bps (20%)
2. **Daily**: Run batch claim script across all deployed tokens (via heartbeat)
3. **Convert**: Swap claimed WETH → USDC if needed for compute credits
4. **Track**: Log all claims in SOUL.md revenue section

## Fee Optimization

| Trading Fee | Effect |
|-------------|--------|
| 0.5% (50 bps) | Lower friction, more volume, less fee per trade |
| 1% (100 bps) | Standard balance of volume vs revenue |
| 2% (200 bps) | Higher fee per trade, may reduce volume |
| 5% (500 bps) | Maximum allowed, very high friction |

**Recommendation:** Use 1% (100 bps) default. Only go higher for meme tokens with high volatility.

## Vault and Fee Interaction

Vaulted tokens don't generate trading fees (they're locked). Only circulating supply that gets traded generates fees.

- Higher vault % → less circulating supply → potentially less trading volume → less fees
- Lower vault % → more supply available → more trading → more fees
- Balance: 10-20% vault is a good sweet spot for fee generation + commitment signal
