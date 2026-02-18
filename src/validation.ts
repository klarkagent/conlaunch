import { getAllTokens } from "./db.js";
import {
  MAX_VAULT_PERCENTAGE,
  DEFAULT_PLATFORM_FEE_BPS,
} from "./types.js";
import type { DeployRequest } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: {
    name: string;
    symbol: string;
    clientWallet: string;
    platformFeeBps: number;
    vaultPercentage: number;
    estimatedGas: string;
  };
}

/**
 * Validate a deploy request before execution.
 * Returns errors (blockers) and warnings (non-blocking suggestions).
 */
export function validateLaunch(req: DeployRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name
  if (!req.name || req.name.trim().length === 0) {
    errors.push("Token name is required");
  } else if (req.name.length > 100) {
    errors.push("Token name must be 100 characters or less");
  } else if (req.name.includes("<")) {
    errors.push("Token name cannot contain HTML tags");
  }

  // Symbol
  if (!req.symbol || req.symbol.trim().length === 0) {
    errors.push("Token symbol is required");
  } else if (req.symbol.length < 2 || req.symbol.length > 10) {
    errors.push("Symbol must be 2-10 characters");
  } else if (!/^[A-Za-z0-9]+$/.test(req.symbol)) {
    errors.push("Symbol must be alphanumeric only");
  }

  // Check symbol uniqueness among our deployments
  const existing = getAllTokens().find(
    (t) => t.symbol.toLowerCase() === req.symbol?.toLowerCase()
  );
  if (existing) {
    warnings.push(`Symbol ${req.symbol.toUpperCase()} was already deployed through ConLaunch`);
  }

  // Wallet
  if (!req.clientWallet) {
    errors.push("Client wallet address is required");
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(req.clientWallet)) {
    errors.push("Invalid wallet address format");
  }

  // Description
  if (req.description && req.description.length > 1000) {
    errors.push("Description must be 1000 characters or less");
  } else if (req.description && req.description.includes("<")) {
    errors.push("Description cannot contain HTML tags");
  }

  // Image
  if (req.image) {
    if (!req.image.startsWith("https://") && !req.image.startsWith("ipfs://")) {
      errors.push("Image must be a valid HTTPS or IPFS URL");
    }
  } else {
    warnings.push("No image provided — token will have no logo on DexScreener");
  }

  // Vault
  if (req.vault) {
    if (req.vault.percentage < 0 || req.vault.percentage > MAX_VAULT_PERCENTAGE) {
      errors.push(`Vault percentage must be 0-${MAX_VAULT_PERCENTAGE}`);
    }
    if (req.vault.lockupDays < 7) {
      errors.push("Minimum lockup is 7 days");
    }
    if (req.vault.percentage > 50) {
      warnings.push("Vaulting >50% locks most of the supply — trading volume may be low");
    }
  } else {
    warnings.push("No vault configured — consider vaulting 10-20% to signal commitment");
  }

  // Trading fees
  if (req.fees?.type && (req.fees as any).type !== "static") {
    errors.push("Dynamic fees not supported — use static fees");
  }
  if (req.fees?.bps) {
    if (req.fees.bps < 10 || req.fees.bps > 500) {
      errors.push("Trading fee must be 10-500 bps (0.1%-5%)");
    }
    if (req.fees.bps > 200) {
      warnings.push("Trading fee >2% may reduce volume significantly");
    }
  }

  // Fee split validation
  if (req.feeSplit && req.feeSplit.length > 0) {
    if (req.feeSplit.length > 5) {
      errors.push("Maximum 5 fee split recipients");
    }
    const totalShare = req.feeSplit.reduce((sum, e) => sum + e.share, 0);
    if (totalShare > 80) {
      errors.push("Fee split total cannot exceed 80%");
    }
    const wallets = new Set<string>();
    for (const entry of req.feeSplit) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(entry.wallet)) {
        errors.push(`Invalid wallet address in fee split for ${entry.role}`);
      }
      const lower = entry.wallet.toLowerCase();
      if (wallets.has(lower)) {
        errors.push(`Duplicate wallet in fee split: ${entry.wallet}`);
      }
      wallets.add(lower);
    }
  }

  // Scam keyword detection
  if (req.name && /free|airdrop|guaranteed|100x|get rich/i.test(req.name)) {
    warnings.push("Token name contains potentially misleading terms");
  }

  const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || String(DEFAULT_PLATFORM_FEE_BPS));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed: errors.length === 0
      ? {
          name: req.name,
          symbol: req.symbol.toUpperCase(),
          clientWallet: req.clientWallet,
          platformFeeBps,
          vaultPercentage: req.vault?.percentage ?? 0,
          estimatedGas: "~0.005-0.02 ETH",
        }
      : undefined,
  };
}
