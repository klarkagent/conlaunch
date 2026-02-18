/**
 * Batch claim LP fees across all tokens deployed through ConLaunch.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/claim-fees.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { getAllTokens } from "../src/db.js";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY env var");
    process.exit(1);
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const wallet = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

  const { Clanker } = await import("clanker-sdk/v4");
  const clanker = new Clanker({ wallet, publicClient });

  const tokens = getAllTokens("active");
  console.log(`Checking fees for ${tokens.length} active tokens...\n`);

  let totalClaimed = 0;

  for (const token of tokens) {
    try {
      const rewards = await clanker.availableRewards(token.tokenAddress);

      if (!rewards || rewards.length === 0) {
        console.log(`  ${token.symbol} (${token.tokenAddress.slice(0, 10)}...): no fees`);
        continue;
      }

      console.log(`  ${token.symbol}: claiming...`);
      const tx = await clanker.claimRewards(token.tokenAddress);
      console.log(`    TX: ${tx}`);
      totalClaimed++;
    } catch (err: any) {
      console.error(`  ${token.symbol}: ERROR — ${err.message}`);
    }
  }

  console.log(`\nDone. Claimed from ${totalClaimed}/${tokens.length} tokens.`);
}

main().catch(console.error);
