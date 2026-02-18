/**
 * Deploy the $CONLAUNCH token on Base via Clanker SDK v4.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/deploy-token.ts
 *
 * This deploys the $CONLAUNCH governance/launchpad token:
 *   - 100% of LP fees go to ConLaunch treasury
 *   - 20% vaulted with 30-day lockup + 90-day vesting
 *   - 1% static trading fees on both sides
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const WETH = "0x4200000000000000000000000000000000000006";

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY env var");
    process.exit(1);
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const wallet = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

  console.log("Deploying $CONLAUNCH token...");
  console.log(`  Deployer: ${account.address}`);

  const { Clanker } = await import("clanker-sdk/v4");
  const clanker = new Clanker({ wallet, publicClient });

  const { txHash, waitForTransaction, error } = await clanker.deploy({
    name: "ConLaunch",
    symbol: "CONLAUNCH",
    tokenAdmin: account.address,
    image: "https://conlaunch.com/logo.png",
    metadata: {
      description: "Native Conway Agent Launchpad — deploy tokens on Base. Fees from every token launched through ConLaunch flow to $CONLAUNCH holders.",
      socialMediaUrls: [
        { platform: "x", url: "https://x.com/conlaunch" },
        { platform: "website", url: "https://conlaunch.com" },
      ],
    },
    pool: {
      pairedToken: WETH,
      initialMarketCap: "5",
    },
    fees: {
      type: "static",
      clankerFee: 100,
      pairedFee: 100,
    },
    rewards: {
      recipients: [
        {
          recipient: account.address,  // ConLaunch treasury
          admin: account.address,
          bps: 10000,                  // 100% of $CONLAUNCH LP fees to treasury
          token: "Both",
        },
      ],
    },
    vault: {
      percentage: 20,
      lockupDuration: 2592000,       // 30 days
      vestingDuration: 7776000,      // 90 days
    },
    context: {
      interface: "ConLaunch",
      platform: "Conway",
      messageId: "genesis-deploy",
      id: "conlaunch-token",
    },
  });

  if (error) {
    console.error("Deploy failed:", error);
    process.exit(1);
  }

  console.log(`  TX: ${txHash}`);
  console.log("  Waiting for confirmation...");

  const result = await waitForTransaction();

  console.log("");
  console.log("  $CONLAUNCH deployed!");
  console.log(`  Token:     ${result.address}`);
  console.log(`  TX:        ${txHash}`);
  console.log(`  BaseScan:  https://basescan.org/token/${result.address}`);
  console.log(`  DexScreen: https://dexscreener.com/base/${result.address}`);
  console.log("");
  console.log("  Update .env with:");
  console.log(`  CONLAUNCH_TOKEN_ADDRESS=${result.address}`);
}

main().catch(console.error);
