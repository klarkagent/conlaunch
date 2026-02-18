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
      description TEXT,
      image TEXT,
      website TEXT,
      twitter TEXT,
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

  // Migrate: add new columns to existing tables (safe — ALTER TABLE ADD COLUMN is no-op if column exists)
  const migrations = [
    "ALTER TABLE tokens ADD COLUMN description TEXT",
    "ALTER TABLE tokens ADD COLUMN image TEXT",
    "ALTER TABLE tokens ADD COLUMN website TEXT",
    "ALTER TABLE tokens ADD COLUMN twitter TEXT",
  ];
  for (const sql of migrations) {
    try { d.exec(sql); } catch {}
  }

  // Seed: ensure known deployed tokens always exist in DB
  seedKnownTokens(d);
}

function seedKnownTokens(d: Database.Database) {
  const knownTokens = [
    // ConLaunch team tokens
    { name: "ConLaunch", symbol: "CLAUNCH", token_address: "0x31d553822B37BDA67126D5ea9d165B9456f72b07", tx_hash: "0x3e84e5a48fc11deaff79367c4a884413d554e5714b53eb441a49c90b3c0f9bcc", client_wallet: "0xd068B9dbf5B60539d4f4B0A0D36c90aD99A1C5F1", client_bps: 8000, platform_bps: 2000 },
    { name: "ConLaunch Test", symbol: "CLTEST", token_address: "0xe3cc7Af9f55f3C2b0eC4908261E2D44272Dd2b07", tx_hash: "0x6b5315caed8b10a361eda99be2ebab5114b14d3098b446711edfc1d947596a19", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Open Test", symbol: "OTEST", token_address: "0xDecBc0F9245098722c22533840C955AB2C519B07", tx_hash: "0x43bde68c5762defa79f814760c423edfc1bbd3b1aa3bdf7b6aeac39e3cb35fed", client_wallet: "0xd068B9dbf5B60539d4f4B0A0D36c90aD99A1C5F1", client_bps: 8000, platform_bps: 2000 },
    // User-deployed tokens (recovered from on-chain)
    { name: "Conway", symbol: "Conway", token_address: "0xeB7631906dBC28ce6688912f53133d07B1f01B07", tx_hash: "0xf5fa2232680ec27f006390dde74651710ba22d75bcd6c1f8db0741c966f8d063", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Conway", symbol: "Conway", token_address: "0x20A8428C402A7636d23Af3a1178b30F47a950b07", tx_hash: "0x91d97fc8c1ed3828e071bceaf701fe36ddb521ccd8723b51917dad64538f6dd7", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "TST333", symbol: "TST", token_address: "0x98861Ac6D5d7fFCE3004E9164863CBDDf6cf1b07", tx_hash: "0xb24767d3a41d4be270764a75835e265686944e9d4872c50b15257ada86adda6f", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "BEAST", symbol: "BEAST", token_address: "0x00BEd711a65c0b02F0460E72903A6F4aa2DB0b07", tx_hash: "0x4c3df724b95b0bf77e178a3f63d81c4a2d1787371be3e80e7389bbca71626541", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    // All user-deployed tokens (recovered from on-chain via Blockscout + viem)
    { name: "BaZhua AI", symbol: "BAZUA", token_address: "0x5a6802f2098d88d439c0e8b03A4B562103560B07", tx_hash: "0xc504cd372075aea71f61738f40d8b25f6d8c85b63919d1827a7570c2175de5db", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Credit", symbol: "CREDIT", token_address: "0x2919d1BAc83999eEAAa9fa16635552E7996A7B07", tx_hash: "0x55366750f55fada3156c1c1ab59f02081191a7821e2449cfd9121092ad3ae5c7", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Conway Bank", symbol: "CBANK", token_address: "0x1fB66a8EBa73EF4e88c5d5e65A0F7989A3FA3B07", tx_hash: "0xba6352265b003f6c1f2d95c2d82b0c9e0712324d67b7c7f036bd96b8332c8f98", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "MOLTBANK", symbol: "MOLTBANK", token_address: "0xeBB10Aa74a386E372D33ed7792050fBaAB561B07", tx_hash: "0x480ed52b38b063c26804d6198b95ad1a0606aeae4d503e3f8a2b1f70fd93cd0c", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Selon", symbol: "SELON", token_address: "0x311913E299129a42c17B4C9b7EA49a78ac14Bb07", tx_hash: "0x6c4a1a6a224726a72f0e7ecb49b26ef87e4db70a024ae484af6187c6901df66c", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Coinway Launcher", symbol: "CL", token_address: "0x7f261d0964508dd6Db3BAb1C0E15fF8cc91b8b07", tx_hash: "0xbec364a207376c665a73445d70ef377848a680017459a260b9c00300e8227563", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Anoncoin", symbol: "Anoncoin", token_address: "0x1a7023506f5EB537D1835bfAaeDE1Dd46CE65B07", tx_hash: "0xdea8b654f9afc959fff523b6d28d24b45fc09e1b52d2a448d25f99cd8a8a2266", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "SIGIL", symbol: "SIGIL", token_address: "0xc24E560F66aF4219a028C3e75926203f6FbFeb07", tx_hash: "0x6ef302ba637bfbd54239605448df3b84682dc807b4c8484f1648d5049b82debf", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "SOLANO", symbol: "SOLANO", token_address: "0x7EF654203838CdD3a78337471DdD678273d34b07", tx_hash: "0xb36e2c40998f152d5d21ec05845d20509ae5e5fb0bbdb496f75a208e3d622fbb", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Conlaunch Monarch", symbol: "CLMONARCH", token_address: "0xaeB0FeA13bA788aE10c8f0EFACBF6A118F7dfB07", tx_hash: "0xd9a4f1d426940b09135aa1225b937fc8503211fd0f5b916c1aa4d3d0b7ddbc21", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "ClawCash", symbol: "CASH", token_address: "0xc925D9eB3A00172C859b4cD56e27379120854B07", tx_hash: "0x55670f75f3a801ca97295fba9a58b5d719505675f48785557bc04daeb416d499", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Octane AI", symbol: "OCTANE", token_address: "0x8E050b7d0A7ca54e201c9180ef54cd06c9304B07", tx_hash: "0x8b77d5e9355cda0e30725e6c2ec2951042e20a97b75d8ec1c89159d569b81c20", client_wallet: "0x8962E8C0cA02466cA439BC8B75c92053F5893790", client_bps: 8000, platform_bps: 2000 },
    { name: "Conlaunch", symbol: "Conlaunch", token_address: "0x6dDD614c95A65545E96f37B79D1a3485228dcB07", tx_hash: "0x06a2f1707024364ff15fe2eb0a6186da2335a25e67e6bf85c4b5b58c1cc9cb27", client_wallet: "0x3f80284F5F3b6C6bFaDEaE40C229bafc931905AC", client_bps: 8000, platform_bps: 2000 },
    { name: "CoinlClaw", symbol: "CoinlClaw", token_address: "0xB3ead7659b354fc24b91d2538f4eD107a0429B07", tx_hash: "0xa204cfafa3d9fda8fd2bdc06056289e4485a2d5534ffc3ca7db9b83c89093065", client_wallet: "0x0cCe1bf28B673626F140b926d55d7F3A88AA0615", client_bps: 8000, platform_bps: 2000 },
    { name: "BIGMO", symbol: "BIGMO", token_address: "0xfCF60bE60c2C43e8A0473aEF86262bfc60f9AB07", tx_hash: "0x990bdfa613d7342906720013b5fb227b7f57159c019589e324403ed149d151d8", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "conlaunchbot", symbol: "CNLAUNCH", token_address: "0xB652aCe48729F808959763cFC332133ECE8E9b07", tx_hash: "0x5e5af27313ee7f295e2619a0fcc33bb20f326b94e4134ee2ba87d63b177d8427", client_wallet: "0x82a096b07033f033b2426c9938640844582a20f3", client_bps: 8000, platform_bps: 2000 },
    { name: "CLAWN", symbol: "CLAWN", token_address: "0xC4415E78C2784d2c757Ca9992D706D5e4891DB07", tx_hash: "0xcd221c693af3fbade8e2b912aaf8a28d6921bd75607dfdee123256f219d87642", client_wallet: "0xc7d67ba700044d9562d124de7bef0f10493f97e5", client_bps: 8000, platform_bps: 2000 },
    // Wave 3 recovery (2026-02-18)
    { name: "X Agent", symbol: "XAGENT", token_address: "0x43617961eBE93368789B4555102A9086445bBB07", tx_hash: "0x10c22e69f008a8c0d1409d4504a3645fca529775864c40b6f247349bed35c61b", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "MOLTBOOK", symbol: "MOLTBOOK", token_address: "0x9c45483Beb5346C404D27197E1B15Baeb3d09B07", tx_hash: "0x1b21a5ef36ee44411610f8a95487ab10f39349c9e6e86456767620a733eb5fca", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "MOLTX", symbol: "MOLTX", token_address: "0xbde56Bb90841e49478eAACFebf0317815556fb07", tx_hash: "0xac40441b62582a6061f09897ab5350ca9969e666707dab271f7711ff3edb8804", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "ConLaunch", symbol: "CLAUNCH", token_address: "0x2c3C731B1448CE1665C62EDA4fFC1D1b54936b07", tx_hash: "0xb6a6348b5f94601906d6bb5b3514297b848ab7443f1e02c6402f5a870d990469", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "None", symbol: "None", token_address: "0x1A70ff30cD85f9eEFbB8BaD795442b14ebF33b07", tx_hash: "0xee695e7129e9775c0588273e76feae0abd69964562bb892ec6608571d370a687", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "CLAUNCH AI BANK", symbol: "CAB", token_address: "0x9F7980fFd1776f2C78e89EE54219e576EF234b07", tx_hash: "0x47bceb31eaa7524b4aeec5d881e26ce6cb9d8b19d7b5ba0c22d1907c86de653f", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "Agent On Claunch", symbol: "AOC", token_address: "0x1c27b760d6055dA5D2eA5D30c72Ad1839794eB07", tx_hash: "0xf8598971ecc5dab2c1d6a0de0ec18ce58dd0c9f5346759ccf05d954e607cc4f5", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
    { name: "fomoltbook", symbol: "FOMOLTBOOK", token_address: "0x3A910d89CBE63C51361273cDbd1dd4Abc7E53b07", tx_hash: "0xef4b126a7e34a7c48afdec654fd25040d704d62b28767ba60f861eac6f6fe170", client_wallet: "0x2892C415e9A43529437301f389a6b050970c54Ec", client_bps: 8000, platform_bps: 2000 },
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
  vaultPercentage: number,
  meta?: { description?: string; image?: string; website?: string; twitter?: string }
): TokenRecord {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO tokens (name, symbol, token_address, tx_hash, client_wallet, client_bps, platform_bps, vault_percentage, description, image, website, twitter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, symbol, tokenAddress, txHash, clientWallet, clientBps, platformBps, vaultPercentage,
    meta?.description || null, meta?.image || null, meta?.website || null, meta?.twitter || null
  );
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

/**
 * Auto-recover all deployed tokens from Blockscout.
 * Scans platform wallet's deployToken transactions and inserts any missing tokens.
 * Runs async after server startup — never blocks boot.
 */
export async function recoverTokensFromChain(platformWallet: string): Promise<number> {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO tokens (name, symbol, token_address, tx_hash, client_wallet, client_bps, platform_bps, vault_percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);

  let recovered = 0;
  let url: string | null = `https://base.blockscout.com/api/v2/addresses/${platformWallet}/transactions`;

  try {
    // Paginate through all transactions
    for (let page = 0; page < 10 && url; page++) {
      const res = await fetch(url, { headers: { "User-Agent": "ConLaunch/1.0" } });
      const data = (await res.json()) as any;
      const items: any[] = data.items || [];

      for (const tx of items) {
        if (tx.method !== "deployToken" || tx.result !== "success") continue;
        const txHash = tx.hash;

        // Get token address from Transfer(from=0x0) mint event
        try {
          const logsRes = await fetch(
            `https://base.blockscout.com/api/v2/transactions/${txHash}/logs`,
            { headers: { "User-Agent": "ConLaunch/1.0" } }
          );
          const logsData = (await logsRes.json()) as any;
          for (const log of logsData.items || []) {
            const decoded = log.decoded || {};
            if (!decoded.method_call?.startsWith("Transfer")) continue;
            const params = decoded.parameters || [];
            const fromParam = params.find((p: any) => p.name === "from");
            if (fromParam?.value !== "0x0000000000000000000000000000000000000000") continue;

            const tokenAddr = log.address?.hash;
            if (!tokenAddr || !tokenAddr.toLowerCase().endsWith("b07")) continue;

            // Fetch token metadata
            let name = "Unknown", symbol = "UNKNOWN";
            try {
              const tokenRes = await fetch(
                `https://base.blockscout.com/api/v2/tokens/${tokenAddr}`,
                { headers: { "User-Agent": "ConLaunch/1.0" } }
              );
              const tokenData = (await tokenRes.json()) as any;
              name = tokenData.name || name;
              symbol = tokenData.symbol || symbol;
            } catch {}

            const result = insert.run(name, symbol, tokenAddr, txHash, platformWallet, 8000, 2000);
            if (result.changes > 0) {
              recovered++;
              console.log(`  [recovery] Found new token: ${name} ($${symbol}) ${tokenAddr.slice(0, 10)}...`);
            }
            break; // Only need first mint Transfer per tx
          }
        } catch {}
      }

      // Next page
      const npp = data.next_page_params;
      if (npp) {
        const params = Object.entries(npp).map(([k, v]) => `${k}=${v}`).join("&");
        url = `https://base.blockscout.com/api/v2/addresses/${platformWallet}/transactions?${params}`;
      } else {
        url = null;
      }
    }
  } catch (err: any) {
    console.error(`  [recovery] Blockscout scan failed: ${err.message}`);
  }

  if (recovered > 0) {
    console.log(`  [recovery] Recovered ${recovered} new tokens from on-chain`);
  } else {
    console.log(`  [recovery] All tokens accounted for`);
  }
  return recovered;
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
