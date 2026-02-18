# Clanker SDK v4 Reference

## Installation

```bash
npm install clanker-sdk viem
```

## SDK Setup

```typescript
import { Clanker } from 'clanker-sdk/v4';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http() });
const wallet = createWalletClient({ account, chain: base, transport: http() });
const clanker = new Clanker({ wallet, publicClient });
```

## Deploy Method

```typescript
const { txHash, waitForTransaction, error } = await clanker.deploy({
  name: string,              // Token name
  symbol: string,            // Token symbol
  tokenAdmin: string,        // Admin wallet address
  image?: string,            // IPFS or HTTPS URL
  vanity?: boolean,          // Generate "b07" suffix via vanity service
  metadata?: {
    description?: string,
    socialMediaUrls?: Array<{ platform: string, url: string }>,
    auditUrls?: string[],
  },
  context?: {
    interface: string,       // e.g. "ConLaunch"
    platform: string,        // e.g. "Conway"
    messageId: string,
    id: string,
  },
  pool?: PoolConfig,
  fees?: FeeConfig,
  rewards?: RewardsConfig,
  vault?: VaultConfig,
  devBuy?: DevBuyConfig,
});

if (error) throw error;
const { address } = await waitForTransaction();
```

## Return Value

```typescript
{
  txHash: string,                    // Transaction hash
  waitForTransaction: () => Promise<{ address: string }>,  // Resolves to token address
  error?: string,                    // Error message if failed
}
```

## REST API Alternative

If SDK doesn't work, use the Clanker REST API:

```bash
curl -X POST https://www.clanker.world/api/tokens/deploy \
  -H "x-api-key: YOUR_CLANKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyToken",
    "symbol": "MTK",
    "requestKey": "unique-32-char-key",
    "tokenAdmin": "0x...",
    "rewards": { "recipients": [...] }
  }'
```

Requires a Clanker API key (get from clanker.world). SDK approach preferred since ConLaunch already has a wallet.

## Fee Claiming

```typescript
// Check available rewards
const rewards = await clanker.availableRewards(tokenAddress);

// Claim rewards
const tx = await clanker.claimRewards(tokenAddress);
```

## Supported Chains

| Chain | ID | Status |
|-------|----|--------|
| Base | 8453 | Primary (recommended) |
| Unichain | 130 | Supported |
| Arbitrum One | 42161 | Supported |

## Key Contract Addresses (Base)

- WETH: `0x4200000000000000000000000000000000000006`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
