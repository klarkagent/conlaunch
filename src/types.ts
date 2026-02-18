export interface DeployRequest {
  name: string;
  symbol: string;
  clientWallet: `0x${string}`;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  vault?: {
    percentage: number;       // 0-90
    lockupDays: number;       // min 7
    vestingDays?: number;     // 0 = cliff only
  };
  fees?: {
    type: "static";
    bps?: number;             // default 100 (1%)
  };
  devBuyEth?: number;           // optional initial buy
  feeSplit?: FeeSplitEntry[];   // multi-agent fee splitting
}

export interface FeeSplitEntry {
  wallet: `0x${string}`;
  share: number;                // percentage (e.g. 40 = 40%)
  role: string;                 // e.g. "marketing", "dev", "community"
}

export interface DeployResult {
  success: boolean;
  tokenAddress?: string;
  txHash?: string;
  poolAddress?: string;
  rewardsConfig?: RewardRecipient[];
  error?: string;
}

export interface RewardRecipient {
  recipient: string;
  admin: string;
  bps: number;
  token: "Both" | "Paired" | "Clanker";
  label: string;
}

export interface TokenRecord {
  id: number;
  name: string;
  symbol: string;
  tokenAddress: string;
  txHash: string;
  clientWallet: string;
  clientBps: number;
  platformBps: number;
  vaultPercentage: number;
  deployedAt: string;
  totalFeesClaimedWeth: string;
  totalFeesClaimedToken: string;
  status: "active" | "inactive";
}

export interface FeeClaimResult {
  tokenAddress: string;
  txHash: string;
  wethClaimed: string;
  tokenClaimed: string;
  claimedAt: string;
}

export interface AgentIdentity {
  agentId: number;
  wallet: `0x${string}`;
  uri: string;
  verified: boolean;
}

export interface LaunchpadStats {
  totalTokensDeployed: number;
  totalFeesClaimedWeth: string;
  activeTokens: number;
  uniqueClients: number;
  totalFeesClaimed: number;
}

export const WETH_BASE = "0x4200000000000000000000000000000000000006" as const;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_CHAIN_ID = 8453;
export const DEFAULT_PLATFORM_FEE_BPS = 2000;
export const MIN_PLATFORM_FEE_BPS = 1000;
export const DEFAULT_TRADING_FEE_BPS = 100;
export const MAX_VAULT_PERCENTAGE = 90;
export const MIN_LOCKUP_SECONDS = 604800; // 7 days
