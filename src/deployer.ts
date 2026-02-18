import { createPublicClient, createWalletClient, http, type Account } from "viem";
import { base } from "viem/chains";
import {
  type DeployRequest,
  type DeployResult,
  type RewardRecipient,
  WETH_BASE,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_TRADING_FEE_BPS,
  MAX_VAULT_PERCENTAGE,
} from "./types.js";
import { recordDeployment } from "./db.js";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

export function createClients(account: Account): { publicClient: any; walletClient: any } {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  return { publicClient, walletClient };
}

function buildRewardsConfig(
  req: DeployRequest,
  platformWallet: `0x${string}`,
  platformFeeBps: number
): { recipients: RewardRecipient[]; error?: string } {
  // Multi-agent fee split
  if (req.feeSplit && req.feeSplit.length > 0) {
    if (req.feeSplit.length > 5) {
      return { recipients: [], error: "Maximum 5 fee split recipients allowed" };
    }

    const recipients: RewardRecipient[] = [];
    let usedBps = 0;

    for (const entry of req.feeSplit) {
      if (entry.share <= 0 || entry.share > 80) {
        return { recipients: [], error: `Invalid share ${entry.share}% for ${entry.role}` };
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(entry.wallet)) {
        return { recipients: [], error: `Invalid wallet for ${entry.role}` };
      }
      const bps = Math.round(entry.share * 100);
      recipients.push({
        recipient: entry.wallet,
        admin: entry.wallet,
        bps,
        token: "Both",
        label: entry.role,
      });
      usedBps += bps;
    }

    const clientMaxBps = 10000 - platformFeeBps;
    if (usedBps > clientMaxBps) {
      return { recipients: [], error: `Fee split total ${usedBps / 100}% exceeds client allocation ${clientMaxBps / 100}%` };
    }

    const primaryBps = clientMaxBps - usedBps;
    if (primaryBps > 0) {
      recipients.push({
        recipient: req.clientWallet,
        admin: req.clientWallet,
        bps: primaryBps,
        token: "Both",
        label: "client",
      });
    }

    recipients.push({
      recipient: platformWallet,
      admin: platformWallet,
      bps: platformFeeBps,
      token: "Both",
      label: "conlaunch",
    });

    return { recipients };
  }

  // Simple 2-way split (default)
  const clientBps = 10000 - platformFeeBps;
  return {
    recipients: [
      {
        recipient: req.clientWallet,
        admin: req.clientWallet,
        bps: clientBps,
        token: "Both",
        label: "client",
      },
      {
        recipient: platformWallet,
        admin: platformWallet,
        bps: platformFeeBps,
        token: "Both",
        label: "conlaunch",
      },
    ],
  };
}

function validateRequest(req: DeployRequest): string | null {
  if (!req.name || req.name.length === 0) return "Token name is required";
  if (!req.symbol || req.symbol.length < 2 || req.symbol.length > 10) return "Symbol must be 2-10 characters";
  if (!req.clientWallet || !/^0x[a-fA-F0-9]{40}$/.test(req.clientWallet)) return "Valid client wallet address required";

  if (req.vault) {
    if (req.vault.percentage < 0 || req.vault.percentage > MAX_VAULT_PERCENTAGE) {
      return `Vault percentage must be 0-${MAX_VAULT_PERCENTAGE}`;
    }
    if (req.vault.lockupDays < 7) return "Minimum lockup is 7 days";
  }

  return null;
}

export async function deployToken(
  req: DeployRequest,
  platformWallet: `0x${string}`,
  clankerInstance: any
): Promise<DeployResult> {
  const validationError = validateRequest(req);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Platform fee is server-controlled — ignore client override
  const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || String(DEFAULT_PLATFORM_FEE_BPS));
  const rewardsResult = buildRewardsConfig(req, platformWallet, platformFeeBps);

  if (rewardsResult.error) {
    return { success: false, error: rewardsResult.error };
  }

  const rewards = rewardsResult.recipients;
  const tradingFeeBps = req.fees?.bps ?? DEFAULT_TRADING_FEE_BPS;

  const deployConfig: any = {
    name: req.name,
    symbol: req.symbol,
    tokenAdmin: platformWallet,
    metadata: {
      description: req.description || `Deployed by ConLaunch — Conway Agent Launchpad`,
      socialMediaUrls: [
        ...(req.twitter ? [{ platform: "x", url: `https://x.com/${req.twitter.replace("@", "")}` }] : []),
        ...(req.website ? [{ platform: "website", url: req.website }] : []),
      ],
    },
    pool: {
      pairedToken: WETH_BASE,
      tickIfToken0IsClanker: -230400,
      positions: [{ tickLower: -230400, tickUpper: -120000, positionBps: 10000 }],
    },
    fees: { type: "static", clankerFee: tradingFeeBps, pairedFee: tradingFeeBps },
    rewards: {
      recipients: rewards.map(({ label, ...r }) => r),
    },
    context: {
      interface: "ConLaunch",
      platform: "Conway",
      messageId: `cl-${Date.now()}`,
      id: `${req.symbol.toLowerCase()}-${Date.now()}`,
    },
    vanity: true,
  };

  if (req.image) {
    deployConfig.image = req.image;
  }

  if (req.vault && req.vault.percentage > 0) {
    deployConfig.vault = {
      percentage: req.vault.percentage,
      lockupDuration: req.vault.lockupDays * 86400,
      vestingDuration: (req.vault.vestingDays || 0) * 86400,
    };
  }

  if (req.devBuyEth && req.devBuyEth > 0) {
    deployConfig.devBuy = { ethAmount: req.devBuyEth };
  }

  try {
    const { txHash, waitForTransaction, error } = await clankerInstance.deploy(deployConfig);

    if (error) {
      return { success: false, error: "Deployment rejected by Clanker" };
    }

    const result = await waitForTransaction();

    recordDeployment(
      req.name,
      req.symbol,
      result.address,
      txHash,
      req.clientWallet,
      10000 - platformFeeBps,
      platformFeeBps,
      req.vault?.percentage || 0
    );

    return {
      success: true,
      tokenAddress: result.address,
      txHash,
      rewardsConfig: rewards,
    };
  } catch (err: any) {
    // Sanitize — don't leak internal SDK errors
    const msg = err?.message || String(err);
    if (msg.includes("insufficient funds")) {
      return { success: false, error: "Insufficient gas — contact ConLaunch support" };
    }
    if (msg.includes("nonce")) {
      return { success: false, error: "Transaction conflict — please retry" };
    }
    return { success: false, error: "Deployment failed — please retry or contact support" };
  }
}
