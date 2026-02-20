import { formatEther } from "viem";
import { getAllTokens, getTokenByAddress, recordFeeClaim } from "./db.js";
import { WETH_BASE } from "./types.js";
import type { FeeClaimResult } from "./types.js";

const WETH = WETH_BASE as `0x${string}`;

/**
 * Check available rewards for a specific token.
 * Checks TOKEN fees + WETH fees for both platform and client.
 */
export async function checkFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<{
  available: boolean;
  platform: { tokenAmount: string; wethAmount: string };
  client: { wallet: string; tokenAmount: string; wethAmount: string } | null;
}> {
  const token = getTokenByAddress(tokenAddress);
  const clientWallet = (token as any)?.client_wallet as `0x${string}` | undefined;

  // Check platform fees (TOKEN + WETH)
  let platformTokenAmount = 0n;
  let platformWethAmount = 0n;
  try {
    platformTokenAmount = await clankerInstance.availableRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });
  } catch {}
  try {
    platformWethAmount = await clankerInstance.availableRewards({
      token: WETH,
      rewardRecipient: platformWallet,
    });
  } catch {}

  // Check client fees (TOKEN + WETH)
  let clientTokenAmount = 0n;
  let clientWethAmount = 0n;
  if (clientWallet && clientWallet !== platformWallet) {
    try {
      clientTokenAmount = await clankerInstance.availableRewards({
        token: tokenAddress as `0x${string}`,
        rewardRecipient: clientWallet,
      });
    } catch {}
    try {
      clientWethAmount = await clankerInstance.availableRewards({
        token: WETH,
        rewardRecipient: clientWallet,
      });
    } catch {}
  }

  const totalToken = platformTokenAmount + clientTokenAmount;
  const totalWeth = platformWethAmount + clientWethAmount;

  return {
    available: totalToken > 0n || totalWeth > 0n,
    platform: {
      tokenAmount: formatEther(platformTokenAmount),
      wethAmount: formatEther(platformWethAmount),
    },
    client: clientWallet
      ? {
          wallet: clientWallet,
          tokenAmount: formatEther(clientTokenAmount),
          wethAmount: formatEther(clientWethAmount),
        }
      : null,
  };
}

/**
 * Claim rewards for a specific token — claims TOKEN + WETH for BOTH platform and client.
 */
export async function claimFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<FeeClaimResult | null> {
  const token = getTokenByAddress(tokenAddress);
  const clientWallet = (token as any)?.client_wallet as `0x${string}` | undefined;
  const txHashes: string[] = [];
  let totalTokenClaimed = 0n;
  let totalWethClaimed = 0n;

  // Helper to claim for a wallet
  async function claimForWallet(wallet: `0x${string}`, label: string) {
    // Claim TOKEN fees
    try {
      const available: bigint = await clankerInstance.availableRewards({
        token: tokenAddress as `0x${string}`,
        rewardRecipient: wallet,
      });
      if (available > 0n) {
        const result = await clankerInstance.claimRewards({
          token: tokenAddress as `0x${string}`,
          rewardRecipient: wallet,
        });
        if (!result.error) {
          txHashes.push(result.txHash);
          totalTokenClaimed += available;
        } else {
          console.error(`[claim] ${label} token error for ${tokenAddress}:`, result.error.data?.label || result.error.message || result.error);
        }
      }
    } catch (err: any) {
      console.error(`[claim] ${label} token failed for ${tokenAddress}:`, err.message);
    }

    // Claim WETH fees
    try {
      const available: bigint = await clankerInstance.availableRewards({
        token: WETH,
        rewardRecipient: wallet,
      });
      if (available > 0n) {
        const result = await clankerInstance.claimRewards({
          token: WETH,
          rewardRecipient: wallet,
        });
        if (!result.error) {
          txHashes.push(result.txHash);
          totalWethClaimed += available;
        } else {
          console.error(`[claim] ${label} WETH error for ${tokenAddress}:`, result.error.data?.label || result.error.message || result.error);
        }
      }
    } catch (err: any) {
      console.error(`[claim] ${label} WETH failed for ${tokenAddress}:`, err.message);
    }
  }

  // Claim for platform (20%)
  await claimForWallet(platformWallet, "platform");

  // Claim for client (80%)
  if (clientWallet && clientWallet !== platformWallet) {
    await claimForWallet(clientWallet, "client");
  }

  if (txHashes.length === 0) return null;

  const wethClaimed = formatEther(totalWethClaimed);
  const tokenClaimed = formatEther(totalTokenClaimed);
  return recordFeeClaim(tokenAddress, txHashes[0], wethClaimed, tokenClaimed);
}

/**
 * Batch claim fees across all active deployed tokens.
 * Claims TOKEN + WETH for both platform and client wallets.
 */
export async function claimAllFees(
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<{
  claimed: FeeClaimResult[];
  skipped: string[];
  errors: Array<{ address: string; error: string }>;
}> {
  const tokens = getAllTokens("active");
  const claimed: FeeClaimResult[] = [];
  const skipped: string[] = [];
  const errors: Array<{ address: string; error: string }> = [];

  for (const token of tokens) {
    const addr = (token as any).token_address as string;
    try {
      const result = await claimFees(addr, platformWallet, clankerInstance);
      if (result) {
        claimed.push(result);
      } else {
        skipped.push(addr);
      }
    } catch (err: any) {
      errors.push({ address: addr, error: err.message });
    }
  }

  return { claimed, skipped, errors };
}
