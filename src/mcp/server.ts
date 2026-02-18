import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.CONLAUNCH_API_URL || "http://localhost:3000";
const API_KEY = process.env.CONLAUNCH_API_KEY || "";

async function api(path: string, method = "GET", body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return res.json();
}

const server = new McpServer({ name: "conlaunch", version: "0.1.0" });

// ── Deploy ──

server.tool(
  "deploy_token",
  "Deploy an ERC-20 token on Base via ConLaunch (Clanker SDK v4 + Uniswap V4). Returns contract address, tx hash, and links.",
  {
    name: z.string().describe("Token name"),
    symbol: z.string().describe("Token symbol (2-10 chars)"),
    clientWallet: z.string().describe("Your wallet address (0x...)"),
    description: z.string().optional().describe("Token description"),
    image: z.string().optional().describe("Token image URL"),
    website: z.string().optional().describe("Project website"),
    twitter: z.string().optional().describe("Twitter/X handle"),
    vaultPercentage: z.number().optional().describe("Lock % of supply (0-90)"),
    lockupDays: z.number().optional().describe("Lockup duration in days (min 7)"),
    vestingDays: z.number().optional().describe("Vesting duration in days"),
  },
  async (params) => {
    const body: any = { ...params };
    if (params.vaultPercentage && params.vaultPercentage > 0) {
      body.vault = {
        percentage: params.vaultPercentage,
        lockupDays: params.lockupDays || 7,
        vestingDays: params.vestingDays || 0,
      };
    }
    delete body.vaultPercentage;
    delete body.lockupDays;
    delete body.vestingDays;
    const data = await api("/deploy", "POST", body);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Preview / Validate ──

server.tool(
  "validate_launch",
  "Validate token parameters before deploying. Returns errors and warnings without deploying.",
  {
    name: z.string().describe("Token name"),
    symbol: z.string().describe("Token symbol"),
    clientWallet: z.string().describe("Wallet address"),
    vaultPercentage: z.number().optional(),
  },
  async (params) => {
    const data = await api("/preview", "POST", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Rate Limit ──

server.tool(
  "check_rate_limit",
  "Check if a wallet can launch (1 per 24h cooldown)",
  { wallet: z.string().describe("Wallet address to check") },
  async (params) => {
    const data = await api(`/rate-limit/${params.wallet}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Image Upload ──

server.tool(
  "upload_image",
  "Upload a token logo image. Returns a permanent URL.",
  {
    image: z.string().describe("Image URL or base64 data"),
    name: z.string().optional().describe("Image name"),
  },
  async (params) => {
    const data = await api("/upload", "POST", params);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Fees ──

server.tool(
  "check_fees",
  "Check available LP trading fees for a deployed token",
  { tokenAddress: z.string().describe("Token contract address") },
  async (params) => {
    const data = await api(`/fees/${params.tokenAddress}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "claim_fees",
  "Claim accumulated LP trading fees for a token",
  { tokenAddress: z.string().describe("Token contract address") },
  async (params) => {
    const data = await api(`/fees/${params.tokenAddress}/claim`, "POST");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "claim_all_fees",
  "Batch claim LP fees across all deployed tokens",
  {},
  async () => {
    const data = await api("/fees/claim-all", "POST");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tokens & Stats ──

server.tool(
  "list_tokens",
  "List all tokens deployed through ConLaunch",
  {
    clientWallet: z.string().optional().describe("Filter by client wallet"),
    status: z.string().optional().describe("Filter: active or inactive"),
  },
  async (params) => {
    const path = params.clientWallet
      ? `/clients/${params.clientWallet}/tokens`
      : `/tokens${params.status ? `?status=${params.status}` : ""}`;
    const data = await api(path);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "launchpad_stats",
  "Get ConLaunch platform statistics",
  {},
  async () => {
    const data = await api("/stats");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Analytics ──

server.tool(
  "token_analytics",
  "Get detailed analytics for a specific token",
  { tokenAddress: z.string().describe("Token contract address") },
  async (params) => {
    const data = await api(`/analytics/token/${params.tokenAddress}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "agent_analytics",
  "Get analytics for a specific agent/wallet",
  { wallet: z.string().describe("Agent wallet address") },
  async (params) => {
    const data = await api(`/analytics/agent/${params.wallet}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "leaderboard",
  "Get ranked agent leaderboard",
  {
    sort: z.enum(["launches", "fees"]).optional().describe("Sort by: launches or fees"),
    limit: z.number().optional().describe("Max results (default 50)"),
  },
  async (params) => {
    const qs = `?sort=${params.sort || "launches"}&limit=${params.limit || 50}`;
    const data = await api(`/analytics/leaderboard${qs}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Resource ──

server.resource("conlaunch://info", "conlaunch://info", async (uri) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify({
      name: "ConLaunch",
      description: "Native Conway Agent Launchpad — deploy tokens on Base via Clanker SDK v4",
      website: "https://conlaunch.com",
      chain: "base",
      fee: "80% client / 20% ConLaunch",
      infrastructure: "Clanker SDK v4 + Uniswap V4",
    }, null, 2),
  }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ConLaunch MCP server running on stdio");
}

main().catch(console.error);
