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

// ── Helpers ──

function errorResponse(message: string, status: number, requestId: string) {
  return { error: message, status, requestId };
}

function sanitizeError(err: any): string {
  const msg = err?.message || String(err);
  // Strip internal paths, stack traces, and sensitive info
  if (msg.includes("PRIVATE_KEY") || msg.includes("0x")) {
    return "Internal error during transaction";
  }
  // Cap length to prevent leak of verbose SDK errors
  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}

export function createServer(platformWallet: `0x${string}`, clankerInstance: any) {
  const app = new Hono();

  const API_KEY = process.env.API_KEY;
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB

  // ── Middleware ──

  // Security headers
  app.use("/*", secureHeaders());

  // CORS
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["*"];
  app.use("/*", cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    maxAge: 86400,
  }));

  // Request ID + logging
  app.use("/*", async (c, next) => {
    const requestId = c.req.header("X-Request-ID") || crypto.randomUUID().slice(0, 8);
    c.set("requestId" as any, requestId);
    c.header("X-Request-ID", requestId);

    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    const method = c.req.method;
    const path = c.req.path;
    const status = c.res.status;
    console.log(`[${new Date().toISOString()}] ${method} ${path} ${status} ${ms}ms [${requestId}]`);
  });

  // Global error handler
  app.onError((err, c) => {
    const requestId = (c.get as any)("requestId") || "unknown";
    console.error(`[${new Date().toISOString()}] ERROR [${requestId}]:`, err.message);
    return c.json(errorResponse("Internal server error", 500, requestId), 500);
  });

  // API key auth middleware for write endpoints
  function requireAuth(c: any): Response | null {
    if (!API_KEY) return null; // No key configured = open mode (dev)
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${API_KEY}`) {
      const requestId = (c.get as any)("requestId") || "unknown";
      return c.json(errorResponse("Unauthorized — invalid or missing API key", 401, requestId), 401);
    }
    return null;
  }

  // Body size check
  async function parseBody(c: any): Promise<any | Response> {
    const contentLength = parseInt(c.req.header("Content-Length") || "0");
    if (contentLength > MAX_BODY_SIZE) {
      const requestId = (c.get as any)("requestId") || "unknown";
      return c.json(errorResponse("Request body too large (max 1MB)", 413, requestId), 413);
    }
    try {
      return await c.req.json();
    } catch {
      const requestId = (c.get as any)("requestId") || "unknown";
      return c.json(errorResponse("Invalid JSON body", 400, requestId), 400);
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
        version: "0.1.0",
        website: "https://conlaunch.com",
        chain: "base",
        chainId: 8453,
        endpoints: {
          public: ["GET /", "GET /health", "GET /stats", "GET /tokens", "GET /tokens/:address", "GET /tokens/:address/share", "GET /clients/:wallet/tokens", "GET /rate-limit/:wallet", "GET /fees/:tokenAddress", "POST /preview", "POST /deploy", "GET /analytics/token/:address", "GET /analytics/agent/:wallet", "GET /analytics/leaderboard"],
          authenticated: ["POST /upload", "POST /fees/:tokenAddress/claim", "POST /fees/claim-all"],
        },
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
      return c.json(errorResponse("Invalid wallet address", 400, (c.get as any)("requestId")), 400);
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
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50")));
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
      return c.json(errorResponse("Invalid token address", 400, (c.get as any)("requestId")), 400);
    }
    const token = getTokenByAddress(address);
    if (!token) return c.json(errorResponse("Token not found", 404, (c.get as any)("requestId")), 404);
    return c.json(token);
  });

  app.get("/clients/:wallet/tokens", (c) => {
    const wallet = c.req.param("wallet");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return c.json(errorResponse("Invalid wallet address", 400, (c.get as any)("requestId")), 400);
    }
    return c.json(getTokensByClient(wallet));
  });

  // ── Share on X ──

  app.get("/tokens/:address/share", (c) => {
    const address = c.req.param("address");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json(errorResponse("Invalid token address", 400, (c.get as any)("requestId")), 400);
    }
    const token = getTokenByAddress(address);
    if (!token) return c.json(errorResponse("Token not found", 404, (c.get as any)("requestId")), 404);
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
    const requestId = (c.get as any)("requestId") || "unknown";

    // Validate
    const validation = validateLaunch(body);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", errors: validation.errors, requestId }, 400);
    }

    // Rate limit
    const rl = checkRateLimit(body.clientWallet);
    if (!rl.allowed) {
      return c.json({
        error: "Rate limited: 1 launch per 24h",
        nextAllowedAt: rl.nextAllowedAt,
        cooldown: formatCooldown(rl.remainingMs),
        requestId,
      }, 429);
    }

    // Verify agent
    const agent = await verifyAgent(body.clientWallet as Address, body.agentId);
    if (!agent) {
      return c.json(errorResponse("Agent verification failed", 403, requestId), 403);
    }

    // Deploy
    try {
      const result = await deployToken(body, platformWallet, clankerInstance);
      if (!result.success) {
        return c.json({ error: sanitizeError(result.error), requestId }, 400);
      }

      const shareText = `${body.name} ($${body.symbol.toUpperCase()}) is now live on Base!\n\nDeployed via @Conlaunch_Bot\n\nhttps://dexscreener.com/base/${result.tokenAddress}`;
      return c.json({
        success: true,
        requestId,
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
        rewards: result.rewardsConfig,
        warnings: validation.warnings,
        message: `${body.name} ($${body.symbol.toUpperCase()}) deployed on Base!`,
      });
    } catch (err: any) {
      return c.json({ error: sanitizeError(err), requestId }, 500);
    }
  });

  // ── Image Upload (authenticated) ──

  app.post("/upload", async (c) => {
    const authErr = requireAuth(c);
    if (authErr) return authErr;

    const body = await parseBody(c);
    if (body instanceof Response) return body;

    if (!body.image) {
      return c.json(errorResponse("image field required", 400, (c.get as any)("requestId")), 400);
    }
    const result = await uploadImage(body.image, body.name);
    return c.json(result);
  });

  // ── Fees (authenticated for claim, public for check) ──

  app.get("/fees/:tokenAddress", async (c) => {
    const addr = c.req.param("tokenAddress");
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return c.json(errorResponse("Invalid token address", 400, (c.get as any)("requestId")), 400);
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
      return c.json(errorResponse("Invalid token address", 400, (c.get as any)("requestId")), 400);
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
      return c.json(errorResponse("Invalid token address", 400, (c.get as any)("requestId")), 400);
    }
    const analytics = getTokenAnalytics(addr);
    if (!analytics) return c.json(errorResponse("Token not found", 404, (c.get as any)("requestId")), 404);
    return c.json(analytics);
  });

  app.get("/analytics/agent/:wallet", (c) => {
    const wallet = c.req.param("wallet");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return c.json(errorResponse("Invalid wallet address", 400, (c.get as any)("requestId")), 400);
    }
    return c.json(getAgentAnalytics(wallet));
  });

  app.get("/analytics/leaderboard", (c) => {
    const sort = (c.req.query("sort") as "launches" | "fees") || "launches";
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50")));
    return c.json(getLeaderboard(sort, limit));
  });

  // ── 404 ──

  app.notFound((c) => {
    return c.json(errorResponse("Not found", 404, (c.get as any)("requestId") || "unknown"), 404);
  });

  return app;
}
