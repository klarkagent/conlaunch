import { getDb } from "./db.js";

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an agent (wallet) is allowed to launch.
 * Enforces 1 launch per 24 hours per wallet.
 */
export function checkRateLimit(wallet: string): {
  allowed: boolean;
  nextAllowedAt: string | null;
  remainingMs: number;
} {
  const d = getDb();
  const lastLaunch = d
    .prepare("SELECT deployed_at FROM tokens WHERE client_wallet = ? ORDER BY deployed_at DESC LIMIT 1")
    .get(wallet) as { deployed_at: string } | undefined;

  if (!lastLaunch) {
    return { allowed: true, nextAllowedAt: null, remainingMs: 0 };
  }

  const lastTime = new Date(lastLaunch.deployed_at).getTime();
  const now = Date.now();
  const elapsed = now - lastTime;

  if (elapsed >= COOLDOWN_MS) {
    return { allowed: true, nextAllowedAt: null, remainingMs: 0 };
  }

  const remainingMs = COOLDOWN_MS - elapsed;
  const nextAllowed = new Date(lastTime + COOLDOWN_MS);

  return {
    allowed: false,
    nextAllowedAt: nextAllowed.toISOString(),
    remainingMs,
  };
}

/**
 * Format remaining time as human-readable string.
 */
export function formatCooldown(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
