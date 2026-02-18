import { claimAllFees } from "./fees.js";

let claimInterval: ReturnType<typeof setInterval> | null = null;

const CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 minutes after boot

/**
 * Start the auto-claim daemon.
 * Claims LP fees across all deployed tokens every 24 hours.
 */
export function startAutoClaim(platformWallet: `0x${string}`, clankerInstance: any) {
  console.log("  Auto-claim daemon: will run every 24h");

  // First claim after 5 minutes (let server stabilize)
  setTimeout(async () => {
    await runClaim(platformWallet, clankerInstance);

    // Then every 24 hours
    claimInterval = setInterval(() => {
      runClaim(platformWallet, clankerInstance);
    }, CLAIM_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

async function runClaim(platformWallet: `0x${string}`, clankerInstance: any) {
  console.log(`[${new Date().toISOString()}] Auto-claim: starting batch claim...`);
  try {
    const result = await claimAllFees(platformWallet, clankerInstance);
    console.log(
      `[${new Date().toISOString()}] Auto-claim: claimed ${result.claimed.length}, skipped ${result.skipped.length}, errors ${result.errors.length}`
    );
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`  Error: ${err.address} — ${err.error}`);
      }
    }
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Auto-claim failed:`, err.message);
  }
}

/**
 * Stop the auto-claim daemon.
 */
export function stopAutoClaim() {
  if (claimInterval) {
    clearInterval(claimInterval);
    claimInterval = null;
    console.log("Auto-claim daemon stopped");
  }
}
