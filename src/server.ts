import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { deployToken } from "./deployer.js";
import { verifyAgent } from "./auth.js";
import { checkFees, claimFees, claimAllFees } from "./fees.js";
import { getAllTokens, getTokensByClient, getTokenByAddress, getStats } from "./db.js";
import { validateLaunch } from "./validation.js";
import { getTokenAnalytics, getAgentAnalytics, getLeaderboard } from "./analytics.js";
import { checkRateLimit, formatCooldown } from "./ratelimit.js";
import { uploadImage } from "./image.js";
import type { Address } from "viem";

// ── Fee aggregation via DexScreener volume × Clanker fee rate ──

const CLANKER_FEE_RATE = 0.01; // 1% LP fee on Clanker v4

interface FeeCacheToken { address: string; volume24hUsd: number; fees24hUsd: number }
interface FeeCache {
  totalFeesUsd: number;
  totalVolume24hUsd: number;
  feeRate: number;
  tokens: FeeCacheToken[];
  cachedAt: string;
}

let feeCache: FeeCache | null = null;
let feeCacheTime = 0;
const FEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function aggregateFees(): Promise<FeeCache> {
  // Return cache if fresh
  if (feeCache && Date.now() - feeCacheTime < FEE_CACHE_TTL) {
    return feeCache;
  }

  const tokens = getAllTokens("active");
  const addresses = tokens.map((t) =>
    ((t as any).token_address || (t as any).tokenAddress) as string
  );

  // Batch fetch from DexScreener (max 10 per request to avoid URL length limits)
  const volumeMap = new Map<string, number>();
  const DEXSCREENER_BATCH = 10;

  for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH) {
    const batch = addresses.slice(i, i + DEXSCREENER_BATCH);
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`;
      const res = await fetch(url);
      const data = (await res.json()) as { pairs?: Array<any> };
      if (data.pairs) {
        for (const pair of data.pairs) {
          const base = pair.baseToken?.address?.toLowerCase();
          if (!base) continue;
          const vol = parseFloat(pair.volume?.h24) || 0;
          volumeMap.set(base, (volumeMap.get(base) || 0) + vol);
        }
      }
    } catch (err: any) {
      console.error(`[fees] DexScreener batch ${i / DEXSCREENER_BATCH + 1} failed: ${err.message}`);
    }
  }

  const perToken: FeeCacheToken[] = [];
  let totalVol = 0;
  let totalFees = 0;

  for (const addr of addresses) {
    const vol = volumeMap.get(addr.toLowerCase()) || 0;
    const fees = vol * CLANKER_FEE_RATE;
    totalVol += vol;
    totalFees += fees;
    perToken.push({ address: addr, volume24hUsd: vol, fees24hUsd: fees });
  }

  feeCache = {
    totalFeesUsd: totalFees,
    totalVolume24hUsd: totalVol,
    feeRate: CLANKER_FEE_RATE,
    tokens: perToken,
    cachedAt: new Date().toISOString(),
  };
  feeCacheTime = Date.now();
  console.log(`[fees] Volume: $${totalVol.toFixed(2)}, Fees: $${totalFees.toFixed(2)} (${perToken.length} tokens)`);
  return feeCache;
}

// ── Helpers ──

function errorResponse(message: string, status: number) {
  return { error: message, status };
}

function sanitizeError(err: any): string {
  const msg = err?.message || String(err);
  // Strip private keys and file paths — never leak these
  if (msg.includes("PRIVATE_KEY") || msg.includes("/src/") || msg.includes("/node_modules/")) {
    return "Internal server error";
  }
  // Cap length to prevent leak of verbose SDK errors
  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}

export function createServer(platformWallet: `0x${string}`, clankerInstance: any) {
  const app = new Hono();

  const API_KEY = process.env.API_KEY;
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB
  const IS_PRODUCTION = process.env.NODE_ENV === "production";

  // ── Middleware ──

  // Security headers
  app.use("/*", secureHeaders());

  // Block direct access to Render origin — only allow requests via conlaunch.com
  if (IS_PRODUCTION) {
    const ALLOWED_HOSTS = ["conlaunch.com", "www.conlaunch.com"];
    app.use("/*", async (c, next) => {
      const host = (c.req.header("Host") || "").split(":")[0].toLowerCase();
      if (!ALLOWED_HOSTS.includes(host)) {
        return c.text("", 403);
      }
      await next();
    });
  }

  // CORS — strict in production, open in dev
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : IS_PRODUCTION ? ["https://conlaunch.com"] : ["*"];
  app.use("/*", cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }));

  // Request ID (generated server-side only — never trust client) + logging
  app.use("/*", async (c, next) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    c.set("requestId" as any, requestId);

    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    // Strip server identity headers
    c.res.headers.delete("X-Powered-By");
    c.res.headers.delete("Server");

    const method = c.req.method;
    const path = c.req.path;
    const status = c.res.status;
    console.log(`[${new Date().toISOString()}] ${method} ${path} ${status} ${ms}ms [${requestId}]`);
  });

  // Global error handler
  app.onError((err, c) => {
    const requestId = (c.get as any)("requestId") || "unknown";
    console.error(`[${new Date().toISOString()}] ERROR [${requestId}]:`, err.message);
    return c.json(errorResponse("Internal server error", 500), 500);
  });

  // API key auth middleware for write endpoints
  function requireAuth(c: any): Response | null {
    if (!API_KEY) return null; // No key configured = open mode (dev)
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${API_KEY}`) {
      return c.json(errorResponse("Unauthorized", 401), 401);
    }
    return null;
  }

  // Body size check
  async function parseBody(c: any): Promise<any | Response> {
    const contentLength = parseInt(c.req.header("Content-Length") || "0");
    if (contentLength > MAX_BODY_SIZE) {
      return c.json(errorResponse("Request body too large", 413), 413);
    }
    try {
      return await c.req.json();
    } catch {
      return c.json(errorResponse("Invalid JSON body", 400), 400);
    }
  }

  // ── Static files (website) ──

  app.use("/logo.png", serveStatic({ root: "./public" }));
  app.use("/favicon.ico", serveStatic({ root: "./public", path: "/logo.png" }));

  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  function serveHtmlPage(page: string) {
    return (c: any) => {
      try {
        const html = readFileSync(join(publicDir, page, "index.html"), "utf-8");
        return c.html(html);
      } catch {
        return c.notFound();
      }
    };
  }
  app.get("/api/", serveHtmlPage("api"));
  app.get("/tokens/", serveHtmlPage("tokens"));
  app.get("/docs/", serveHtmlPage("docs"));
  app.get("/skill/", serveHtmlPage("skill"));

  // Serve raw skill markdown
  app.get("/skill.md", (c) => {
    try {
      const md = readFileSync(join(publicDir, "skill.md"), "utf-8");
      c.header("Content-Type", "text/markdown; charset=utf-8");
      return c.body(md);
    } catch {
      return c.notFound();
    }
  });

  // ── Public Endpoints ──

  app.get("/", (c) => {
    // If Accept header wants JSON (API clients), return JSON
    const accept = c.req.header("Accept") || "";
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return c.json({
        name: "ConLaunch",
        description: "Native Conway Agent Launchpad",
        website: "https://conlaunch.com",
        chain: "base",
        chainId: 8453,
        docs: "https://conlaunch.com/docs/",
      });
    }
    // Serve website HTML
    try {
      const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "index.html"), "utf-8");
      return c.html(html);
    } catch {
      return c.text("ConLaunch — https://conlaunch.com", 200);
    }
  });

  app.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() })
  );

  app.get("/stats", (c) => {
    const period = c.req.query("period"); // "24h" or omit for all-time
    return c.json(getStats(period || undefined));
  });

  // Aggregated on-chain fees (cached 5min)
  app.get("/fees/aggregate", async (c) => {
    try {
      const result = await aggregateFees();
      return c.json(result);
    } catch (err: any) {
      return c.json({ totalFeesUsd: 0, totalVolume24hUsd: 0, feeRate: CLANKER_FEE_RATE, tokens: [], cachedAt: null, error: sanitizeError(err) });
    }
  });

  // ── Preview / Validate (public — no auth needed) ──

  app.post("/preview", async (c) => {
    const body = await parseBody(c);
    if (body instanceof Response) return body;

    const result = validateLaunch(body);
    if (body.clientWallet) {
      const rl = checkRateLimit(body.clientWallet);
      if (!rl.allowed) {
        result.warnings.push(
          `Rate limited: next launch in ${formatCooldown(rl.remainingMs)}`
        );
      }
    }
    return c.json(result);
  });

  // ── Rate Limit (public) ──

  app.get("/rate-limit/:wallet", (c) => {
    const wallet = c.req.param("wallet");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return c.json(errorResponse("Invalid wallet address", 400), 400);
    }
    const rl = checkRateLimit(wallet);
    return c.json({
      ...rl,
      cooldown: rl.remainingMs > 0 ? formatCooldown(rl.remainingMs) : null,
    });
  });

  // ── Tokens (public, with pagination) ──

  app.get("/tokens", (c) => {
    const status = c.req.query("status");
    const sort = c.req.query("sort"); // "newest" (default) or "fees"
    const page = Math.min(10000, Math.max(1, parseInt(c.req.query("page") || "1")));
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") || "50")));
    const offset = (page - 1) * limit;

    const all = getAllTokens(status || undefined, sort || undefined);
    const paginated = all.slice(offset, offset + limit);

    return c.json({
      tokens: paginated,
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.ceil(all.length / limit),
      },
    });
  });

  app.get("/tokens/:address", (c) => {
    const address = c.req.param("address");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json(errorResponse("Invalid token address", 400), 400);
    }
    const token = getTokenByAddress(address);
    if (!token) return c.json(errorResponse("Token not found", 404), 404);
    return c.json(token);
  });

  app.get("/clients/:wallet/tokens", (c) => {
    const wallet = c.req.param("wallet");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return c.json(errorResponse("Invalid wallet address", 400), 400);
    }
    return c.json(getTokensByClient(wallet));
  });

  // ── Share on X ──

  app.get("/tokens/:address/share", (c) => {
    const address = c.req.param("address");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json(errorResponse("Invalid token address", 400), 400);
    }
    const token = getTokenByAddress(address);
    if (!token) return c.json(errorResponse("Token not found", 404), 404);
    const text = `${token.name} ($${token.symbol.toUpperCase()}) on Base\n\nDeployed via @Conlaunch_Bot\n\nhttps://dexscreener.com/base/${address}`;
    return c.json({
      text,
      shareUrl: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
    });
  });

  // ── Deploy (public — rate limited by wallet) ──

  app.post("/deploy", async (c) => {

    const body = await parseBody(c);
    if (body instanceof Response) return body;

    // Validate
    const validation = validateLaunch(body);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", errors: validation.errors }, 400);
    }

    // Rate limit
    const rl = checkRateLimit(body.clientWallet);
    if (!rl.allowed) {
      return c.json({
        error: "Rate limited: 1 launch per 24h",
        nextAllowedAt: rl.nextAllowedAt,
        cooldown: formatCooldown(rl.remainingMs),
      }, 429);
    }

    // Verify agent
    const agent = await verifyAgent(body.clientWallet as Address, body.agentId);
    if (!agent) {
      return c.json(errorResponse("Agent verification failed", 403), 403);
    }

    // Deploy
    try {
      const result = await deployToken(body, platformWallet, clankerInstance);
      if (!result.success) {
        return c.json({ error: sanitizeError(result.error) }, 400);
      }

      const shareText = `${body.name} ($${body.symbol.toUpperCase()}) is now live on Base!\n\nDeployed via @Conlaunch_Bot\n\nhttps://dexscreener.com/base/${result.tokenAddress}`;
      return c.json({
        success: true,
        token: {
          address: result.tokenAddress,
          txHash: result.txHash,
          links: {
            basescan: `https://basescan.org/token/${result.tokenAddress}`,
            dexscreener: `https://dexscreener.com/base/${result.tokenAddress}`,
            clanker: `https://www.clanker.world/clanker/${result.tokenAddress}`,
            uniswap: `https://app.uniswap.org/swap?outputCurrency=${result.tokenAddress}&chain=base`,
            shareOnX: `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
          },
        },
        feeSplit: result.rewardsConfig?.map((r: any) => ({
          role: r.label,
          share: r.bps / 100,
        })),
        warnings: validation.warnings,
        message: `${body.name} ($${body.symbol.toUpperCase()}) deployed on Base!`,
      });
    } catch (err: any) {
      return c.json({ error: sanitizeError(err) }, 500);
    }
  });

  // ── Image Upload (authenticated) ──

  app.post("/upload", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    const body = await parseBody(c);
    if (body instanceof Response) return body;

    if (!body.image) {
      return c.json(errorResponse("image field required", 400), 400);
    }
    const result = await uploadImage(body.image, body.name);
    return c.json(result);
  });

  // ── Fees (authenticated for claim, public for check) ──

  app.get("/fees/:tokenAddress", async (c) => {
    const addr = c.req.param("tokenAddress");
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return c.json(errorResponse("Invalid token address", 400), 400);
    }
    try {
      const result = await checkFees(addr, platformWallet, clankerInstance);
      return c.json(result);
    } catch (err: any) {
      return c.json({ available: false, rewards: null, error: sanitizeError(err) });
    }
  });

  app.post("/fees/:tokenAddress/claim", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    const addr = c.req.param("tokenAddress");
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return c.json(errorResponse("Invalid token address", 400), 400);
    }
    try {
      const result = await claimFees(addr, platformWallet, clankerInstance);
      if (!result) return c.json({ message: "No fees to claim" });
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: sanitizeError(err) }, 500);
    }
  });

  app.post("/fees/claim-all", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    try {
      const result = await claimAllFees(platformWallet, clankerInstance);
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: sanitizeError(err) }, 500);
    }
  });

  // ── Analytics (public) ──

  app.get("/analytics/token/:address", (c) => {
    const addr = c.req.param("address");
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return c.json(errorResponse("Invalid token address", 400), 400);
    }
    const analytics = getTokenAnalytics(addr);
    if (!analytics) return c.json(errorResponse("Token not found", 404), 404);
    return c.json(analytics);
  });

  app.get("/analytics/agent/:wallet", (c) => {
    const wallet = c.req.param("wallet");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return c.json(errorResponse("Invalid wallet address", 400), 400);
    }
    return c.json(getAgentAnalytics(wallet));
  });

  app.get("/analytics/leaderboard", (c) => {
    const sort = (c.req.query("sort") as "launches" | "fees") || "launches";
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") || "50")));
    return c.json(getLeaderboard(sort, limit));
  });

  // ── Admin: manual token insert (authenticated) ──

  app.post("/admin/insert-token", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    const body = await parseBody(c);
    if (body instanceof Response) return body;

    const { name, symbol, tokenAddress, txHash, clientWallet, clientBps, platformBps, vaultPercentage, description, image, website, twitter } = body;
    if (!name || !symbol || !tokenAddress || !txHash || !clientWallet) {
      return c.json(errorResponse("Missing required fields", 400), 400);
    }

    try {
      const { recordDeployment } = await import("./db.js");
      const token = recordDeployment(name, symbol, tokenAddress, txHash, clientWallet, clientBps || 8000, platformBps || 2000, vaultPercentage || 0, { description, image, website, twitter });
      return c.json({ success: true, token });
    } catch (err: any) {
      return c.json(errorResponse(err.message, 400), 400);
    }
  });

  // ── Admin: cleanup phantom tokens ──

  app.post("/admin/cleanup", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    try {
      const { cleanupPhantomTokens } = await import("./db.js");
      const result = await cleanupPhantomTokens();
      return c.json(result);
    } catch (err: any) {
      return c.json(errorResponse(err.message, 500), 500);
    }
  });

  // ── 404 ──

  app.notFound((c) => {
    return c.json(errorResponse("Not found", 404), 404);
  });

  return app;
}
