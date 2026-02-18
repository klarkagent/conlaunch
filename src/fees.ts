import { formatEther } from "viem";
import { getAllTokens, recordFeeClaim } from "./db.js";
import type { FeeClaimResult } from "./types.js";

/**
 * Check available rewards for a specific token.
 * Uses Clanker SDK v4: availableRewards({ token, rewardRecipient }) → bigint
 */
export async function checkFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<{ available: boolean; amount: string; raw: string }> {
  try {
    const amount: bigint = await clankerInstance.availableRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });
    return {
      available: amount > 0n,
      amount: formatEther(amount),
      raw: amount.toString(),
    };
  } catch {
    return { available: false, amount: "0", raw: "0" };
  }
}

/**
 * Claim rewards for a specific token.
 * Uses Clanker SDK v4: claimRewards({ token, rewardRecipient }) → { txHash } | { error }
 */
export async function claimFees(
  tokenAddress: string,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<FeeClaimResult | null> {
  try {
    // Check available first
    const available: bigint = await clankerInstance.availableRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });

    if (available === 0n) return null;

    // Claim
    const result = await clankerInstance.claimRewards({
      token: tokenAddress as `0x${string}`,
      rewardRecipient: platformWallet,
    });

    if (result.error) {
      console.error(`Claim error for ${tokenAddress}:`, result.error.data?.label || result.error.message);
      return null;
    }

    const wethClaimed = formatEther(available);

    return recordFeeClaim(tokenAddress, result.txHash, wethClaimed, "0");
  } catch (err: any) {
    console.error(`Failed to claim fees for ${tokenAddress}:`, err.message);
    return null;
  }
}

/**
 * Batch claim fees across all active deployed tokens.
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
    try {
      const result = await claimFees(token.tokenAddress, platformWallet, clankerInstance);
      if (result) {
        claimed.push(result);
      } else {
        skipped.push(token.tokenAddress);
      }
    } catch (err: any) {
      errors.push({ address: token.tokenAddress, error: err.message });
    }
  }

  return { claimed, skipped, errors };
}
