import "dotenv/config";
import { serve } from "@hono/node-server";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync } from "fs";
import { createClients } from "./deployer.js";
import { createServer } from "./server.js";
import { getDb, getStats } from "./db.js";
import { startAutoClaim, stopAutoClaim } from "./autoclaim.js";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY env var required. See .env.example");
    process.exit(1);
  }

  if (!process.env.API_KEY) {
    console.warn("  WARNING: No API_KEY set — write endpoints are unprotected!");
    console.warn("  Generate one with: openssl rand -hex 32");
    console.warn("");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const { publicClient, walletClient } = createClients(account);

  console.log(`
   ██████╗ ██████╗ ███╗   ██╗██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗
  ██╔════╝██╔═══██╗████╗  ██║██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║
  ██║     ██║   ██║██╔██╗ ██║██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║
  ██║     ██║   ██║██║╚██╗██║██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║
  ╚██████╗╚██████╔╝██║ ╚████║███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║
   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝

  Native Conway Agent Launchpad
  https://conlaunch.com
  `);

  // Initialize Clanker SDK
  let clanker: any;
  try {
    const { Clanker } = await import("clanker-sdk/v4");
    clanker = new Clanker({ wallet: walletClient, publicClient: publicClient as any });
    console.log("  Clanker SDK v4 initialized");
  } catch {
    console.error("  Failed to load clanker-sdk. Run: npm install clanker-sdk");
    process.exit(1);
  }

  // Verify persistent storage
  const dbPath = process.env.DB_PATH || "";
  const isOnPersistentDisk = dbPath.startsWith("/data/");
  if (isOnPersistentDisk) {
    const diskExists = existsSync("/data");
    if (!diskExists) {
      console.error("  FATAL: DB_PATH points to /data/ but /data/ does not exist!");
      console.error("  Persistent disk is NOT mounted. All data WILL be lost on redeploy.");
      console.error("  Go to Render dashboard → Disks → Add Disk (mount: /data, size: 1GB)");
      process.exit(1);
    }
    // Verify writable
    try {
      writeFileSync("/data/.disk-check", "ok");
      console.log("  Storage: /data/ persistent disk ✓");
    } catch {
      console.error("  FATAL: /data/ exists but is not writable!");
      process.exit(1);
    }
  } else {
    console.warn("  WARNING: DB not on persistent disk — data will be lost on redeploy!");
    console.warn(`  DB_PATH: ${dbPath || "(default: ./conlaunch.db)"}`);
  }

  // Init database
  getDb();
  const stats = getStats();

  const feeBps = process.env.PLATFORM_FEE_BPS || "2000";
  console.log(`  Wallet:    ${account.address}`);
  console.log(`  Chain:     Base (8453)`);
  console.log(`  DB:        ${dbPath || "./conlaunch.db"}`);
  console.log(`  Fee:       ${feeBps} bps (${parseInt(feeBps) / 100}%)`);
  console.log(`  Auth:      ${process.env.API_KEY ? "API key required" : "OPEN (dev mode)"}`);
  console.log(`  CORS:      ${process.env.CORS_ORIGINS || "* (all origins)"}`);
  console.log(`  Deployed:  ${stats.totalTokensDeployed} tokens`);
  console.log(`  Claimed:   ${stats.totalFeesClaimedWeth} WETH`);
  console.log("");

  // Start auto-claim daemon
  startAutoClaim(account.address, clanker);

  // Start API server
  const port = parseInt(process.env.PORT || "3000");
  const app = createServer(account.address, clanker);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`  API: http://localhost:${info.port}`);
    console.log("");
    console.log("  Public endpoints:");
    console.log("    GET  /health               Health check");
    console.log("    GET  /stats                Platform statistics");
    console.log("    GET  /tokens               All deployed tokens");
    console.log("    POST /preview              Validate before deploy");
    console.log("    POST /deploy               Deploy a token");
    console.log("    GET  /rate-limit/:wallet   Check cooldown");
    console.log("    GET  /fees/:addr           Check available fees");
    console.log("    GET  /analytics/*          Token/agent analytics");
    console.log("");
    console.log("  Authenticated endpoints (requires Bearer token):");
    console.log("    POST /upload               Upload token image");
    console.log("    POST /fees/:addr/claim     Claim fees");
    console.log("    POST /fees/claim-all       Batch claim all");
    console.log("");
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n  Shutting down gracefully...");
    stopAutoClaim();
    server.close(() => {
      console.log("  Server closed.");
      process.exit(0);
    });
    // Force exit after 10s if graceful fails
    setTimeout(() => process.exit(1), 10000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
