import { getAllTokens, getTokensByClient, getStats } from "./db.js";
import type { TokenRecord } from "./types.js";

export interface TokenAnalytics {
  name: string;
  symbol: string;
  tokenAddress: string;
  chain: "base";
  deployedAt: string;
  clientWallet: string;
  platformFeeBps: number;
  clientFeeBps: number;
  vaultPercentage: number;
  totalFeesClaimedWeth: string;
  totalFeesClaimedToken: string;
  status: string;
  links: {
    basescan: string;
    dexscreener: string;
    clanker: string;
    uniswap: string;
  };
}

export interface AgentAnalytics {
  wallet: string;
  totalLaunches: number;
  tokens: TokenAnalytics[];
  totalFeesEarned: string;
  firstLaunch: string | null;
  latestLaunch: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  launches: number;
  totalFeesEarned: string;
  latestToken: string;
  latestSymbol: string;
}

function tokenToAnalytics(t: TokenRecord): TokenAnalytics {
  return {
    name: t.name,
    symbol: t.symbol,
    tokenAddress: t.tokenAddress,
    chain: "base",
    deployedAt: t.deployedAt,
    clientWallet: t.clientWallet,
    platformFeeBps: t.platformBps,
    clientFeeBps: t.clientBps,
    vaultPercentage: t.vaultPercentage,
    totalFeesClaimedWeth: t.totalFeesClaimedWeth,
    totalFeesClaimedToken: t.totalFeesClaimedToken,
    status: t.status,
    links: {
      basescan: `https://basescan.org/token/${t.tokenAddress}`,
      dexscreener: `https://dexscreener.com/base/${t.tokenAddress}`,
      clanker: `https://www.clanker.world/clanker/${t.tokenAddress}`,
      uniswap: `https://app.uniswap.org/swap?outputCurrency=${t.tokenAddress}&chain=base`,
    },
  };
}

export function getTokenAnalytics(tokenAddress: string): TokenAnalytics | null {
  const tokens = getAllTokens();
  const token = tokens.find((t) => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
  if (!token) return null;
  return tokenToAnalytics(token);
}

export function getAgentAnalytics(wallet: string): AgentAnalytics {
  const tokens = getTokensByClient(wallet);
  const analytics = tokens.map(tokenToAnalytics);

  const totalFees = tokens.reduce(
    (sum, t) => sum + parseFloat(t.totalFeesClaimedWeth || "0"),
    0
  );

  return {
    wallet,
    totalLaunches: tokens.length,
    tokens: analytics,
    totalFeesEarned: totalFees.toFixed(6),
    firstLaunch: tokens.length > 0 ? tokens[tokens.length - 1].deployedAt : null,
    latestLaunch: tokens.length > 0 ? tokens[0].deployedAt : null,
  };
}

export function getLeaderboard(
  sortBy: "launches" | "fees" = "launches",
  limit: number = 50
): LeaderboardEntry[] {
  const tokens = getAllTokens();

  // Group by client wallet
  const byClient = new Map<string, TokenRecord[]>();
  for (const t of tokens) {
    const existing = byClient.get(t.clientWallet) || [];
    existing.push(t);
    byClient.set(t.clientWallet, existing);
  }

  // Build entries
  const entries: LeaderboardEntry[] = [];
  for (const [wallet, clientTokens] of byClient) {
    const totalFees = clientTokens.reduce(
      (sum, t) => sum + parseFloat(t.totalFeesClaimedWeth || "0"),
      0
    );
    const latest = clientTokens[0]; // already sorted by deployed_at DESC
    entries.push({
      rank: 0,
      wallet,
      launches: clientTokens.length,
      totalFeesEarned: totalFees.toFixed(6),
      latestToken: latest.name,
      latestSymbol: latest.symbol,
    });
  }

  // Sort
  if (sortBy === "fees") {
    entries.sort((a, b) => parseFloat(b.totalFeesEarned) - parseFloat(a.totalFeesEarned));
  } else {
    entries.sort((a, b) => b.launches - a.launches);
  }

  // Rank and limit
  return entries.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}
