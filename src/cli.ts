#!/usr/bin/env node

const API = process.env.CONLAUNCH_API_URL || "https://conlaunch.com";
const KEY = process.env.CONLAUNCH_API_KEY || "";

const args = process.argv.slice(2);
const cmd = args[0];

async function api(path: string, opts?: RequestInit) {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (KEY) headers["Authorization"] = `Bearer ${KEY}`;
  if (opts?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...opts?.headers } });
  return res.json();
}

function print(data: any) {
  console.log(JSON.stringify(data, null, 2));
}

function usage() {
  console.log(`conlaunch — token infrastructure for conway agents

Usage: conlaunch <command> [options]

Commands:
  stats                       Platform statistics
  tokens [--sort fees]        List deployed tokens
  token <address>             Token details
  deploy <name> <symbol> <wallet> [--vault N] [--image URL]
                              Deploy a new token
  preview <name> <symbol> <wallet>
                              Validate before deploying
  fees <tokenAddress>         Check claimable fees
  claim <tokenAddress>        Claim fees for a token
  claim-all                   Claim all fees
  rate-limit <wallet>         Check deploy cooldown
  leaderboard [--sort fees]   Agent leaderboard

Environment:
  CONLAUNCH_API_URL           API base URL (default: https://conlaunch.com)
  CONLAUNCH_API_KEY           API key for write operations

Examples:
  conlaunch stats
  conlaunch deploy "My Token" MTK 0xYourWallet
  conlaunch deploy "My Token" MTK 0xWallet --vault 20
  conlaunch tokens --sort fees
  conlaunch fees 0xTokenAddress
  conlaunch claim-all`);
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

function positional(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) { i++; continue; }
    result.push(args[i]);
  }
  return result;
}

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    usage();
    return;
  }

  try {
    switch (cmd) {
      case "stats": {
        const flags = parseFlags(args.slice(1));
        const qs = flags.period ? `?period=${flags.period}` : "";
        print(await api(`/stats${qs}`));
        break;
      }
      case "tokens": {
        const flags = parseFlags(args.slice(1));
        const params = new URLSearchParams();
        if (flags.sort) params.set("sort", flags.sort);
        if (flags.page) params.set("page", flags.page);
        if (flags.limit) params.set("limit", flags.limit);
        const qs = params.toString() ? `?${params}` : "";
        print(await api(`/tokens${qs}`));
        break;
      }
      case "token": {
        const addr = args[1];
        if (!addr) { console.error("Usage: conlaunch token <address>"); process.exit(1); }
        print(await api(`/tokens/${addr}`));
        break;
      }
      case "deploy": {
        const pos = positional(args.slice(1));
        if (pos.length < 3) { console.error("Usage: conlaunch deploy <name> <symbol> <wallet> [--vault N]"); process.exit(1); }
        const flags = parseFlags(args.slice(1));
        const body: any = { name: pos[0], symbol: pos[1], clientWallet: pos[2] };
        if (flags.vault) body.vault = { percentage: parseInt(flags.vault), lockupDays: parseInt(flags.lockup || "7"), vestingDays: parseInt(flags.vesting || "0") };
        if (flags.image) body.image = flags.image;
        if (flags.description) body.description = flags.description;
        if (flags.website) body.website = flags.website;
        if (flags.twitter) body.twitter = flags.twitter;
        print(await api("/deploy", { method: "POST", body: JSON.stringify(body) }));
        break;
      }
      case "preview": {
        const pos = positional(args.slice(1));
        if (pos.length < 3) { console.error("Usage: conlaunch preview <name> <symbol> <wallet>"); process.exit(1); }
        print(await api("/preview", { method: "POST", body: JSON.stringify({ name: pos[0], symbol: pos[1], clientWallet: pos[2] }) }));
        break;
      }
      case "fees": {
        const addr = args[1];
        if (!addr) { console.error("Usage: conlaunch fees <tokenAddress>"); process.exit(1); }
        print(await api(`/fees/${addr}`));
        break;
      }
      case "claim": {
        if (!KEY) { console.error("Error: CONLAUNCH_API_KEY required for claim"); process.exit(1); }
        const addr = args[1];
        if (!addr) { console.error("Usage: conlaunch claim <tokenAddress>"); process.exit(1); }
        print(await api(`/fees/${addr}/claim`, { method: "POST" }));
        break;
      }
      case "claim-all": {
        if (!KEY) { console.error("Error: CONLAUNCH_API_KEY required for claim-all"); process.exit(1); }
        print(await api("/fees/claim-all", { method: "POST" }));
        break;
      }
      case "rate-limit": {
        const wallet = args[1];
        if (!wallet) { console.error("Usage: conlaunch rate-limit <wallet>"); process.exit(1); }
        print(await api(`/rate-limit/${wallet}`));
        break;
      }
      case "leaderboard": {
        const flags = parseFlags(args.slice(1));
        const params = new URLSearchParams();
        if (flags.sort) params.set("sort", flags.sort);
        if (flags.limit) params.set("limit", flags.limit);
        const qs = params.toString() ? `?${params}` : "";
        print(await api(`/analytics/leaderboard${qs}`));
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        usage();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
