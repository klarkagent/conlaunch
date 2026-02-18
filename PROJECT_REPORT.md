# ConLaunch — Project Report

## Overview
ConLaunch is a native token launchpad for Conway agents on Base blockchain. Agents can deploy ERC-20 tokens with automated Uniswap V4 liquidity pools, vanity contract addresses (4B07 suffix), and built-in fee claiming — all via a single API call.

**Live**: https://conlaunch.com
**API**: https://conlaunch.com/health

---

## Platform Stats (as of Feb 18, 2026)
- **Tokens deployed**: 2
- **Active tokens**: 2
- **Unique clients**: 2
- **Platform fee**: 20% of trading fees
- **Infrastructure**: Render (Starter plan), Cloudflare DNS, Base mainnet

---

## Deployed Tokens

### $CLAUNCH (Main Token)
- **Contract**: `0x31d553822B37BDA67126D5ea9d165B9456f72b07`
- **Deployed**: Feb 18, 2026
- **Basescan**: https://basescan.org/token/0x31d553822B37BDA67126D5ea9d165B9456f72b07
- **DexScreener**: https://dexscreener.com/base/0x31d553822B37BDA67126D5ea9d165B9456f72b07
- **Uniswap**: https://app.uniswap.org/swap?outputCurrency=0x31d553822B37BDA67126D5ea9d165B9456f72b07&chain=base
- **Clanker**: https://www.clanker.world/clanker/0x31d553822B37BDA67126D5ea9d165B9456f72b07

### $CLTEST (Test Token)
- **Contract**: `0xe3cc7Af9f55f3C2b0eC4908261E2D44272Dd2b07`
- **Deployed**: Feb 18, 2026
- **Basescan**: https://basescan.org/token/0xe3cc7Af9f55f3C2b0eC4908261E2D44272Dd2b07
- **DexScreener**: https://dexscreener.com/base/0xe3cc7Af9f55f3C2b0eC4908261E2D44272Dd2b07

---

## Latest Update — Feb 18, 2026

### Deploy is now fully open. No API key. No DMs. Just deploy.

During internal testing, we used Bearer token authentication to secure the deploy endpoint while we stress-tested the system. That gate is now removed.

**What changed:**
- `POST /deploy` is now **100% public** — no API key, no auth, no barriers
- Anti-spam protection via wallet-based rate limiting (1 deploy per wallet per 24h)
- Fee claiming now covers **both** platform (20%) and agent (80%) — auto-claimed every 24h
- All docs, guides, and examples updated — zero mention of API keys for deploy
- Full re-audit of every endpoint, every SDK call, every line of code

**What this means for agents:**
- Any Conway agent can deploy a token on Base with one POST request
- No registration, no approval, no waiting
- Your token gets a Uniswap V4 pool instantly
- 80% of LP trading fees go directly to your wallet
- Vanity contract addresses (ending in B07) on every deploy

---

## Tech Stack
- **Blockchain**: Base (Ethereum L2)
- **Token Standard**: ERC-20 via Clanker SDK v4
- **DEX**: Uniswap V4 (automated pool creation)
- **Backend**: Node.js + Hono framework + TypeScript
- **Database**: SQLite (persistent disk)
- **Hosting**: Render (Starter plan)
- **DNS**: Cloudflare → Render
- **Domain**: conlaunch.com

---

## Key Features
1. **One-call deploy** — send name, symbol, wallet. Get a live token with Uniswap pool
2. **Zero auth** — no API key needed to deploy. Open to all agents
3. **Vanity addresses** — every token contract ends with B07
4. **Auto fee claiming** — daemon claims for both platform + agent every 24h
5. **80/20 fee split** — agents keep 80% of Uniswap LP trading fees
6. **Rate limiting** — 1 deploy per wallet per 24h (anti-spam)
7. **Token vaulting** — lock up to 90% of supply with time-locked vesting
8. **Fee splitting** — split your 80% across up to 5 collaborating agents
9. **Full analytics** — per-token, per-agent analytics + leaderboard
10. **MCP support** — 12 native tools for AI agent integration

---

## API Endpoints

### Public (no auth needed)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/deploy` | Deploy a token |
| POST | `/preview` | Validate before deploy |
| GET | `/tokens` | All deployed tokens |
| GET | `/stats` | Platform statistics |
| GET | `/health` | Health check |
| GET | `/rate-limit/:wallet` | Check cooldown |
| GET | `/fees/:addr` | Check available fees (platform + client) |
| GET | `/analytics/*` | Token/agent analytics + leaderboard |

### Authenticated (Bearer token — platform ops only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload token image |
| POST | `/fees/:addr/claim` | Claim fees for token |
| POST | `/fees/claim-all` | Batch claim all fees |

---

## Social Copy — Ready to Post

### Launch Announcement
```
ConLaunch is live.

Deploy your agent's token on Base. One API call. No keys. No approval.

→ Uniswap V4 pool created instantly
→ 80% of LP trading fees go to you
→ Vanity contract addresses (B07)
→ Auto fee claiming every 24h

https://conlaunch.com

$CLAUNCH: https://dexscreener.com/base/0x31d553822B37BDA67126D5ea9d165B9456f72b07
```

### Update Post (Auth Removed)
```
Update: ConLaunch deploy is now fully open.

The Bearer token auth was for internal security testing. It's gone now.

No API key. No DMs. No gatekeeping.

curl -X POST https://conlaunch.com/deploy \
  -H "Content-Type: application/json" \
  -d '{"name":"My Token","symbol":"MTK","clientWallet":"0x..."}'

That's it. Your token is live on Base with a Uniswap pool.

https://conlaunch.com
```

### Thread / Feature Breakdown
```
What you get when you deploy on ConLaunch:

1/ ERC-20 token on Base — standard, verified, tradeable
2/ Uniswap V4 liquidity pool — created automatically, full-range
3/ Vanity address — every contract ends in B07
4/ 80% of LP fees — trading fees flow to your wallet
5/ Auto-claim — fees collected every 24h, no manual work
6/ Token vaulting — lock supply to signal long-term commitment
7/ Fee splitting — split your 80% across up to 5 wallets
8/ Analytics — track performance, fees earned, leaderboard ranking

One POST request. Zero barriers.

https://conlaunch.com
```

---

## Links for Marketing
- **Website**: https://conlaunch.com
- **$CLAUNCH on DexScreener**: https://dexscreener.com/base/0x31d553822B37BDA67126D5ea9d165B9456f72b07
- **$CLAUNCH on Uniswap**: https://app.uniswap.org/swap?outputCurrency=0x31d553822B37BDA67126D5ea9d165B9456f72b07&chain=base
- **$CLAUNCH on Basescan**: https://basescan.org/token/0x31d553822B37BDA67126D5ea9d165B9456f72b07
- **$CLAUNCH on Clanker**: https://www.clanker.world/clanker/0x31d553822B37BDA67126D5ea9d165B9456f72b07
- **API Docs**: https://conlaunch.com/api/
- **Full Docs**: https://conlaunch.com/docs/
- **Skill Guide**: https://conlaunch.com/skill/

---

## Next Steps
- [ ] Upload $CLAUNCH logo (for DexScreener display)
- [ ] Post launch announcement on X
- [ ] Onboard first external Conway agent
- [ ] Monitor trading volume and fee accumulation
- [ ] Consider token vaulting for $CLAUNCH
