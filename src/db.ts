import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import type { TokenRecord, FeeClaimResult, LaunchpadStats } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "conlaunch.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      token_address TEXT NOT NULL UNIQUE,
      tx_hash TEXT NOT NULL,
      client_wallet TEXT NOT NULL,
      client_bps INTEGER NOT NULL,
      platform_bps INTEGER NOT NULL,
      vault_percentage INTEGER DEFAULT 0,
      deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_fees_claimed_weth TEXT DEFAULT '0',
      total_fees_claimed_token TEXT DEFAULT '0',
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS fee_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      weth_claimed TEXT NOT NULL,
      token_claimed TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (token_address) REFERENCES tokens(token_address)
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_client ON tokens(client_wallet);
    CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
    CREATE INDEX IF NOT EXISTS idx_claims_token ON fee_claims(token_address);
  `);

  // Seed: ensure known deployed tokens always exist in DB
  seedKnownTokens(d);
}

function seedKnownTokens(d: Database.Database) {
  const knownTokens = [
    { name: "ConLaunch", symbol: "CLAUNCH", token_address: "0x31d553822B37BDA67126D5ea9d165B9456f72b07", tx_hash: "0x3e84e5a48fc11deaff79367c4a884413d554e5714b53eb441a49c90b3c0f9bcc", client_wallet: "0xd068B9dbf5B60539d4f4B0A0D36c90aD99A1C5F1", client_bps: 8000, platform_bps: 2000 },
    { name: "ConLaunch Test", symbol: "CLTEST", token_address: "0xe3cc7Af9f55f3C2b0eC4908261E2D44272Dd2b07", tx_hash: "0x6b5315caed8b10a361eda99be2ebab5114b14d3098b446711edfc1d947596a19", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Open Test", symbol: "OTEST", token_address: "0xDecBc0F9245098722c22533840C955AB2C519B07", tx_hash: "0x43bde68c5762defa79f814760c423edfc1bbd3b1aa3bdf7b6aeac39e3cb35fed", client_wallet: "0xd068B9dbf5B60539d4f4B0A0D36c90aD99A1C5F1", client_bps: 8000, platform_bps: 2000 },
  ];

  const insert = d.prepare(`
    INSERT OR IGNORE INTO tokens (name, symbol, token_address, tx_hash, client_wallet, client_bps, platform_bps, vault_percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);

  for (const t of knownTokens) {
    insert.run(t.name, t.symbol, t.token_address, t.tx_hash, t.client_wallet, t.client_bps, t.platform_bps);
  }
}

export function recordDeployment(
  name: string,
  symbol: string,
  tokenAddress: string,
  txHash: string,
  clientWallet: string,
  clientBps: number,
  platformBps: number,
  vaultPercentage: number
): TokenRecord {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO tokens (name, symbol, token_address, tx_hash, client_wallet, client_bps, platform_bps, vault_percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, symbol, tokenAddress, txHash, clientWallet, clientBps, platformBps, vaultPercentage);
  return getToken(result.lastInsertRowid as number)!;
}

export function getToken(id: number): TokenRecord | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as TokenRecord | undefined;
}

export function getTokenByAddress(address: string): TokenRecord | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM tokens WHERE token_address = ?").get(address) as TokenRecord | undefined;
}

export function getAllTokens(status?: string, sort?: string): TokenRecord[] {
  const d = getDb();
  const orderBy = sort === "fees" ? "CAST(total_fees_claimed_weth AS REAL) DESC" : "deployed_at DESC";
  if (status) {
    return d.prepare(`SELECT * FROM tokens WHERE status = ? ORDER BY ${orderBy}`).all(status) as TokenRecord[];
  }
  return d.prepare(`SELECT * FROM tokens ORDER BY ${orderBy}`).all() as TokenRecord[];
}

export function getTokensByClient(clientWallet: string): TokenRecord[] {
  const d = getDb();
  return d.prepare("SELECT * FROM tokens WHERE client_wallet = ? ORDER BY deployed_at DESC").all(clientWallet) as TokenRecord[];
}

export function recordFeeClaim(
  tokenAddress: string,
  txHash: string,
  wethClaimed: string,
  tokenClaimed: string
): FeeClaimResult {
  const d = getDb();
  d.prepare(`
    INSERT INTO fee_claims (token_address, tx_hash, weth_claimed, token_claimed)
    VALUES (?, ?, ?, ?)
  `).run(tokenAddress, txHash, wethClaimed, tokenClaimed);

  // Update running totals
  d.prepare(`
    UPDATE tokens SET
      total_fees_claimed_weth = CAST(CAST(total_fees_claimed_weth AS REAL) + CAST(? AS REAL) AS TEXT),
      total_fees_claimed_token = CAST(CAST(total_fees_claimed_token AS REAL) + CAST(? AS REAL) AS TEXT)
    WHERE token_address = ?
  `).run(wethClaimed, tokenClaimed, tokenAddress);

  return { tokenAddress, txHash, wethClaimed, tokenClaimed, claimedAt: new Date().toISOString() };
}

export function getStats(period?: string): LaunchpadStats {
  const d = getDb();
  const timeFilter = period === "24h" ? " WHERE deployed_at >= datetime('now', '-1 day')" : "";
  const timeAnd = period === "24h" ? " AND deployed_at >= datetime('now', '-1 day')" : "";

  const total = d.prepare(`SELECT COUNT(*) as count FROM tokens${timeFilter}`).get() as { count: number };
  const active = d.prepare(`SELECT COUNT(*) as count FROM tokens WHERE status = 'active'${timeAnd}`).get() as { count: number };
  const clients = d.prepare(`SELECT COUNT(DISTINCT client_wallet) as count FROM tokens${timeFilter}`).get() as { count: number };
  const fees = d.prepare(`SELECT COALESCE(SUM(CAST(total_fees_claimed_weth AS REAL)), 0) as total FROM tokens${timeFilter}`).get() as { total: number };
  const claimsFilter = period === "24h" ? " WHERE claimed_at >= datetime('now', '-1 day')" : "";
  const claims = d.prepare(`SELECT COUNT(*) as count FROM fee_claims${claimsFilter}`).get() as { count: number };

  return {
    totalTokensDeployed: total.count,
    totalFeesClaimedWeth: fees.total.toString(),
    activeTokens: active.count,
    uniqueClients: clients.count,
    totalFeesClaimed: claims.count,
  };
}
