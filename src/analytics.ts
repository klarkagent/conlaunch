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

function tokenToAnalytics(t: any): TokenAnalytics {
  // DB returns snake_case columns, map to camelCase
  const addr = t.tokenAddress || t.token_address;
  const client = t.clientWallet || t.client_wallet;
  const deployed = t.deployedAt || t.deployed_at;
  const platBps = t.platformBps ?? t.platform_bps;
  const cliBps = t.clientBps ?? t.client_bps;
  const vault = t.vaultPercentage ?? t.vault_percentage;
  const feesWeth = t.totalFeesClaimedWeth || t.total_fees_claimed_weth || "0";
  const feesToken = t.totalFeesClaimedToken || t.total_fees_claimed_token || "0";

  return {
    name: t.name,
    symbol: t.symbol,
    tokenAddress: addr,
    chain: "base",
    deployedAt: deployed,
    clientWallet: client,
    platformFeeBps: platBps,
    clientFeeBps: cliBps,
    vaultPercentage: vault,
    totalFeesClaimedWeth: feesWeth,
    totalFeesClaimedToken: feesToken,
    status: t.status,
    links: {
      basescan: `https://basescan.org/token/${addr}`,
      dexscreener: `https://dexscreener.com/base/${addr}`,
      clanker: `https://www.clanker.world/clanker/${addr}`,
      uniswap: `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=base`,
    },
  };
}

export function getTokenAnalytics(tokenAddress: string): TokenAnalytics | null {
  const tokens = getAllTokens();
  const token = tokens.find((t: any) => {
    const addr = t.tokenAddress || t.token_address || "";
    return addr.toLowerCase() === tokenAddress.toLowerCase();
  });
  if (!token) return null;
  return tokenToAnalytics(token);
}

export function getAgentAnalytics(wallet: string): AgentAnalytics {
  const tokens = getTokensByClient(wallet);
  const analytics = tokens.map(tokenToAnalytics);

  const totalFees = tokens.reduce(
    (sum, t: any) => sum + parseFloat(t.total_fees_claimed_weth || t.totalFeesClaimedWeth || "0"),
    0
  );

  return {
    wallet,
    totalLaunches: tokens.length,
    tokens: analytics,
    totalFeesEarned: totalFees.toFixed(6),
    firstLaunch: tokens.length > 0 ? ((tokens[tokens.length - 1] as any).deployed_at || (tokens[tokens.length - 1] as any).deployedAt) : null,
    latestLaunch: tokens.length > 0 ? ((tokens[0] as any).deployed_at || (tokens[0] as any).deployedAt) : null,
  };
}

export function getLeaderboard(
  sortBy: "launches" | "fees" = "launches",
  limit: number = 50
): LeaderboardEntry[] {
  const tokens = getAllTokens();

  // Group by client wallet (DB returns snake_case)
  const byClient = new Map<string, any[]>();
  for (const t of tokens) {
    const cw = (t as any).client_wallet || (t as any).clientWallet;
    const existing = byClient.get(cw) || [];
    existing.push(t);
    byClient.set(cw, existing);
  }

  // Build entries
  const entries: LeaderboardEntry[] = [];
  for (const [wallet, clientTokens] of byClient) {
    const totalFees = clientTokens.reduce(
      (sum: number, t: any) => sum + parseFloat(t.total_fees_claimed_weth || t.totalFeesClaimedWeth || "0"),
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
