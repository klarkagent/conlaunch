import { formatEther } from "viem";
import { getAllTokens, getTokenByAddress, recordFeeClaim } from "./db.js";
import type { FeeClaimResult } from "./types.js";

/**
 * Check available rewards for a specific token.
 * Checks both platform (20%) and client (80%) shares.
 * Uses Clanker SDK v4: availableRewards({ token, rewardRecipient }) → bigint
 */
export async function checkFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<{
  available: boolean;
  platform: { amount: string; raw: string };
  client: { wallet: string; amount: string; raw: string } | null;
}> {
  const token = getTokenByAddress(tokenAddress);
  // DB returns snake_case columns
  const clientWallet = (token as any)?.client_wallet as `0x${string}` | undefined;

  // Check platform fees
  let platformAmount = 0n;
  try {
    platformAmount = await clankerInstance.availableRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });
  } catch {}

  // Check client fees
  let clientAmount = 0n;
  if (clientWallet && clientWallet !== platformWallet) {
    try {
      clientAmount = await clankerInstance.availableRewards({
        token: tokenAddress as `0x${string}`,
        rewardRecipient: clientWallet,
      });
    } catch {}
  }

  return {
    available: platformAmount > 0n || clientAmount > 0n,
    platform: {
      amount: formatEther(platformAmount),
      raw: platformAmount.toString(),
    },
    client: clientWallet
      ? {
          wallet: clientWallet,
          amount: formatEther(clientAmount),
          raw: clientAmount.toString(),
        }
      : null,
  };
}

/**
 * Claim rewards for a specific token — claims for BOTH platform and client.
 * Uses Clanker SDK v4: claimRewards({ token, rewardRecipient }) → { txHash } | { error }
 */
export async function claimFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<FeeClaimResult | null> {
  const token = getTokenByAddress(tokenAddress);
  // DB returns snake_case columns
  const clientWallet = (token as any)?.client_wallet as `0x${string}` | undefined;
  const txHashes: string[] = [];
  let totalClaimed = 0n;

  // Claim platform fees (20%)
  try {
    const platformAvailable: bigint = await clankerInstance.availableRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });

    if (platformAvailable > 0n) {
      const result = await clankerInstance.claimRewards({
        token: tokenAddress as `0x${string}`,
        rewardRecipient: platformWallet,
      });
      if (!result.error) {
        txHashes.push(result.txHash);
        totalClaimed += platformAvailable;
      } else {
        console.error(`Platform claim error for ${tokenAddress}:`, result.error.data?.label || result.error.message);
      }
    }
  } catch (err: any) {
    console.error(`Platform claim failed for ${tokenAddress}:`, err.message);
  }

  // Claim client fees (80%)
  if (clientWallet && clientWallet !== platformWallet) {
    try {
      const clientAvailable: bigint = await clankerInstance.availableRewards({
        token: tokenAddress as `0x${string}`,
        rewardRecipient: clientWallet,
      });

      if (clientAvailable > 0n) {
        const result = await clankerInstance.claimRewards({
          token: tokenAddress as `0x${string}`,
          rewardRecipient: clientWallet,
        });
        if (!result.error) {
          txHashes.push(result.txHash);
          totalClaimed += clientAvailable;
        } else {
          console.error(`Client claim error for ${tokenAddress}:`, result.error.data?.label || result.error.message);
        }
      }
    } catch (err: any) {
      console.error(`Client claim failed for ${tokenAddress}:`, err.message);
    }
  }

  if (txHashes.length === 0) return null;

  const wethClaimed = formatEther(totalClaimed);
  return recordFeeClaim(tokenAddress, txHashes[0], wethClaimed, "0");
}

/**
 * Batch claim fees across all active deployed tokens.
 * Claims for both platform and client wallets.
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
    // DB returns snake_case columns
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
