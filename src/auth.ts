import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import type { AgentIdentity } from "./types.js";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// ERC-8004 Identity Registry ABI (minimal)
const IDENTITY_REGISTRY_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getMetadata",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// ERC-8004 registry address on Base (placeholder — update when deployed)
const IDENTITY_REGISTRY_ADDRESS = process.env.ERC8004_REGISTRY || "0x0000000000000000000000000000000000000000";

const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

/**
 * Verify that a wallet address is a registered Conway agent via ERC-8004.
 * Returns agent identity if verified, null otherwise.
 *
 * When ERC-8004 registry is not yet deployed (address is zero),
 * falls back to open access (any wallet can deploy).
 */
export async function verifyAgent(wallet: Address, agentId?: number): Promise<AgentIdentity | null> {
  // Open access mode when registry not configured
  if (IDENTITY_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return {
      agentId: agentId || 0,
      wallet,
      uri: "",
      verified: false, // not verified but allowed (open mode)
    };
  }

  if (!agentId) return null;

  try {
    const owner = await publicClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS as Address,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [BigInt(agentId)],
    });

    if (owner.toLowerCase() !== wallet.toLowerCase()) {
      return null; // wallet doesn't own this agent ID
    }

    const uri = await publicClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS as Address,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI",
      args: [BigInt(agentId)],
    });

    return {
      agentId,
      wallet,
      uri: uri as string,
      verified: true,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a signed message to prove wallet ownership.
 * Used when agents call the API and need to prove they control their wallet.
 */
export async function verifySignature(
  message: string,
  signature: `0x${string}`,
  expectedAddress: Address
): Promise<boolean> {
  try {
    const valid = await publicClient.verifyMessage({
      address: expectedAddress,
      message,
      signature,
    });
    return valid;
  } catch {
    return false;
  }
}
