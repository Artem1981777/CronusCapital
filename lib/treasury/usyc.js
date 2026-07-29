// USYC treasury benchmark on Arc testnet.
//
// What this does: reads the real tokenized money-market fund (USYC) straight
// from Arc, and reports what Cronus idle USDC would earn there.
//
// What this does NOT do: it does not pretend Cronus holds a position. USYC is
// a permissioned token - only allowlisted addresses may hold it. We prove our
// own entitlement status on-chain instead of claiming it, and we never credit
// any of this yield to the vault NAV.
import { createPublicClient, http, parseAbi } from "viem"

export const USYC_VERSION = "usyc-1"

export const ARC = {
  chainId: 5042002,
  // Same precedence as the other eleven modules that touch Arc; hardcoding it here
  // meant this module could not be pointed at another node, or tested against a dead one.
  rpc: process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  usdc: "0x3600000000000000000000000000000000000000",
  usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
  teller: "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A",
  oracle: "0x52b56c7642E71dc54714d879127d97cd0B3D4581",
  entitlements: "0xcc205224862c7641930c87679e98999d23c26113",
  treasury: "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd",
  agent: "0xd81a420BFa4CE8778473BD46195B8E97e928880f",
}

// ERC-4626 selectors on the Teller
export const SELECTORS = { deposit: "0x6e553f65", redeem: "0xba087652" }

// A tokenized T-bill share must stay near 1 USDC. Arc testnet has published
// at least one corrupt round (275.69), so anything outside this band is junk.
export const SANE_MIN = 0.5
export const SANE_MAX = 2.0

export function isSanePrice(p) {
  return typeof p === "number" && Number.isFinite(p) && p >= SANE_MIN && p <= SANE_MAX
}

// Drop corrupt oracle rounds and rounds that repeat an earlier timestamp.
export function cleanRounds(rounds) {
  const kept = []
  const seenTs = new Set()
  const dropped = []
  for (const r of rounds) {
    if (!isSanePrice(r.price)) { dropped.push({ round: r.round, why: "price outside sane band", price: r.price }); continue }
    if (!Number.isFinite(r.ts) || r.ts <= 0) { dropped.push({ round: r.round, why: "no timestamp" }); continue }
    if (seenTs.has(r.ts)) { dropped.push({ round: r.round, why: "duplicate timestamp (oracle round ids are not contiguous)" }); continue }
    seenTs.add(r.ts)
    kept.push(r)
  }
  kept.sort((a, b) => a.ts - b.ts)
  return { kept, dropped }
}

export function annualize(oldest, newest) {
  if (!oldest || !newest) return null
  const days = (newest.ts - oldest.ts) / 86400
  if (!(days > 1)) return null
  const growth = newest.price / oldest.price - 1
  if (!Number.isFinite(growth)) return null
  return {
    spanDays: Number(days.toFixed(2)),
    navGrowthPct: Number((growth * 100).toFixed(6)),
    apyPct: Number(((Math.pow(1 + growth, 365 / days) - 1) * 100).toFixed(3)),
    from: { round: oldest.round, price: oldest.price, at: new Date(oldest.ts * 1000).toISOString() },
    to: { round: newest.round, price: newest.price, at: new Date(newest.ts * 1000).toISOString() },
  }
}

// Counterfactual only: what idle USDC would have earned. Never booked anywhere.
export function projectIdleYield(idleUsdc, apyPct, days) {
  if (!(idleUsdc > 0) || typeof apyPct !== "number" || !(days > 0)) return null
  const earned = idleUsdc * (Math.pow(1 + apyPct / 100, days / 365) - 1)
  return {
    idleUsdc: Number(idleUsdc.toFixed(6)),
    days,
    apyPct,
    wouldEarnUsdc: Number(earned.toFixed(6)),
    booked: false,
    note: "counterfactual: Cronus holds no USYC and this number is never added to vault NAV",
  }
}

function client() {
  return createPublicClient({
    chain: { id: ARC.chainId, name: "arc-testnet", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [ARC.rpc] } } },
    transport: http(ARC.rpc),
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function readSafe(c, address, sig, args = []) {
  const abi = parseAbi([sig])
  const fn = sig.split(" ")[1].split("(")[0]
  for (let i = 0; i < 3; i++) {
    try { return { ok: true, value: await c.readContract({ address, abi, functionName: fn, args }) } }
    catch (e) {
      const m = String((e && (e.shortMessage || e.message)) || e)
      if (/revert|no data/i.test(m)) return { ok: false, why: "reverted" }
      await sleep(300 + i * 400)
    }
  }
  return { ok: false, why: "rpc unavailable" }
}

// Entitlement is a fact on-chain, not a claim in a README.
// Multicall3 is deployed on Arc testnet, so every read below costs one request
// instead of one per call. Falls back to individual reads if the aggregator is
// unreachable: fewer requests must never mean fewer facts.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"

async function batchRead(c, calls) {
	const contracts = calls.map((x) => ({
		address: x.address,
		abi: parseAbi([x.sig]),
		functionName: x.sig.match(/function\s+([A-Za-z0-9_]+)/)[1],
		args: x.args || [],
	}))
	let out = calls.map(() => ({ ok: false, why: "not attempted" }))
	// The Arc node drops requests under load, and a dropped aggregate call fails
	// every read inside it at once. Retry the batch, then repair what is still
	// missing one call at a time: per-call fallback means fewer requests can
	// never mean fewer facts.
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await c.multicall({ contracts, allowFailure: true, multicallAddress: MULTICALL3 })
			out = res.map((r) => (r.status === "success" ? { ok: true, value: r.result, via: "multicall" } : { ok: false, why: "reverted" }))
			if (out.some((r) => r.ok)) break
		} catch (_) { /* fall through to retry, then to per-call reads */ }
		await sleep(400)
	}
	for (let i = 0; i < calls.length; i++) {
		if (out[i] && out[i].ok) continue
		const r = await readSafe(c, calls[i].address, calls[i].sig, calls[i].args || [])
		out[i] = r.ok ? { ok: true, value: r.value, via: "single" } : r
		await sleep(120)
	}
	return out
}

export async function readEntitlement(c, who) {
	const [roles, canDeposit, canRedeem] = await batchRead(c, [
		{ address: ARC.entitlements, sig: "function getUserRoles(address) view returns (bytes32)", args: [who] },
		{ address: ARC.entitlements, sig: "function canCall(address,address,bytes4) view returns (bool)", args: [who, ARC.teller, SELECTORS.deposit] },
		{ address: ARC.entitlements, sig: "function canCall(address,address,bytes4) view returns (bool)", args: [who, ARC.teller, SELECTORS.redeem] },
	])
	const entitled = canDeposit.ok === true && canDeposit.value === true
	return {
		address: who,
		entitled,
		roles: roles.ok ? String(roles.value) : null,
		canSubscribe: canDeposit.ok ? canDeposit.value : null,
		canRedeem: canRedeem.ok ? canRedeem.value : null,
		howToVerify: `cast call ${ARC.entitlements} "canCall(address,address,bytes4)(bool)" ${who} ${ARC.teller} ${SELECTORS.deposit} --rpc-url ${ARC.rpc}`,
		caveat: "maxDeposit() returns a non-zero limit even for non-entitled addresses; the authority check is canCall(), not the limit",
	}
}

export async function readFund(c) {
	const [navRound, tellerNav, totalAssets, feeRate] = await batchRead(c, [
		{ address: ARC.oracle, sig: "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)" },
		{ address: ARC.teller, sig: "function convertToAssets(uint256) view returns (uint256)", args: [1000000n] },
		{ address: ARC.teller, sig: "function totalAssets() view returns (uint256)" },
		{ address: ARC.teller, sig: "function subscriptionFeeRate(address) view returns (uint256)", args: [ARC.agent] },
	])
	const oraclePrice = navRound.ok ? Number(navRound.value[1]) / 1e18 : null
	const tellerPrice = tellerNav.ok ? Number(tellerNav.value) / 1e6 : null
	return {
		oraclePrice,
		oracleUpdatedAt: navRound.ok ? new Date(Number(navRound.value[3]) * 1000).toISOString() : null,
		latestRound: navRound.ok ? Number(navRound.value[0]) : null,
		tellerPrice,
		// two independent reads of the same fact; if they disagree, say so
		crossCheck: oraclePrice && tellerPrice
			? { agreeWithin: Number(Math.abs(oraclePrice - tellerPrice).toFixed(8)), agrees: Math.abs(oraclePrice - tellerPrice) < 0.001 }
			: null,
		fundTotalAssetsUsdc: totalAssets.ok ? Number(totalAssets.value) / 1e6 : null,
		subscriptionFeePct: feeRate.ok ? Number(feeRate.value) / 1e16 : null,
	}
}

export const MIN_BASIS_DAYS = 30
// Oracle round ids are not contiguous and many repeat the previous timestamp,
// so stepping back one id at a time buys very little history for a lot of RPC.
// Widening strides reach months of NAV, and Multicall3 fetches them at once.
export const ROUND_OFFSETS = [0, 1, 2, 4, 8, 14, 22, 32, 44, 58, 74, 92]

export async function readNavHistory(c, latestRound, { offsets = ROUND_OFFSETS } = {}) {
	if (!Number.isFinite(latestRound)) return { kept: [], dropped: [], yield: null }
	const sig = "function getRoundData(uint80) view returns (uint80,int256,uint256,uint256,uint80)"
	const ids = offsets.map((o) => latestRound - o).filter((id) => id >= 1)
	const res = await batchRead(c, ids.map((id) => ({ address: ARC.oracle, sig, args: [BigInt(id)] })))
	const raw = []
	res.forEach((r, i) => {
		if (r.ok) raw.push({ round: ids[i], price: Number(r.value[1]) / 1e18, ts: Number(r.value[3]) })
	})
	const { kept, dropped } = cleanRounds(raw)
	const y = kept.length >= 2 ? annualize(kept[0], kept[kept.length - 1]) : null
	if (y) {
		y.basisAdequate = y.spanDays >= MIN_BASIS_DAYS
		y.basisNote = y.basisAdequate
			? "annualized from " + kept.length + " on-chain NAV points spanning " + y.spanDays + " days"
			: "short basis (" + y.spanDays + "d): a yearly rate extrapolated from this window is indicative only"
	}
	return { kept, dropped, yield: y }
}

export async function readIdleUsdc(c, who) {
  const b = await readSafe(c, ARC.usdc, "function balanceOf(address) view returns (uint256)", [who])
  return b.ok ? Number(b.value) / 1e6 : null
}

export async function buildTreasuryYield({ horizonDays = 30 } = {}) {
  const c = client()
  const fund = await readFund(c)
  const history = await readNavHistory(c, fund.latestRound)
  const entitlement = await readEntitlement(c, ARC.agent)
  const idle = await readIdleUsdc(c, ARC.treasury)
  const apy = history.yield ? history.yield.apyPct : null

  // Both NAV reads are independent, and readSafe never throws - it returns ok:false
  // after retries. So a dead RPC used to arrive here as nulls and leave as ok:true,
  // presenting "we could not look" as a fact about the fund. Refuse instead, and let
  // the route decide whether it has an older honest answer to serve.
  if (fund.oraclePrice === null && fund.tellerPrice === null) {
    return {
      ok: false,
      reason: "arc_rpc_unavailable",
      version: USYC_VERSION,
      detail: "latestRoundData() and convertToAssets() both failed after retries via " + ARC.rpc,
    }
  }

  return {
    ok: true,
    version: USYC_VERSION,
    asset: { name: "USYC", what: "tokenized short-duration US Treasury fund", token: ARC.usyc, teller: ARC.teller, oracle: ARC.oracle, chain: "Arc testnet" },
    nav: fund,
    yieldFromChain: history.yield,
    roundsUsed: history.kept.length,
    roundsRejected: history.dropped,
    entitlement,
    idleTreasuryUsdc: idle,
    projection: apy !== null && idle !== null ? projectIdleYield(idle, apy, horizonDays) : null,
    honesty: {
      position: "none",
      why: entitlement.entitled ? "entitled but not allocated" : "USYC is permissioned and this agent is not on the allowlist - proven above by canCall(), not asserted",
      yieldSource: "computed from the fund NAV growth recorded on-chain by the Arc oracle, not copied from a marketing page",
      vaultImpact: "zero - synthetic yield accrual stays disabled; vault NAV only moves on real strategy P&L",
      corruptData: "Arc testnet has published at least one corrupt oracle round; rounds outside a sane price band are rejected and listed",
    },
    verify: {
      nav: `cast call ${ARC.oracle} "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url ${ARC.rpc}`,
      entitlement: entitlement.howToVerify,
      explorer: `${ARC.explorer}/address/${ARC.usyc}`,
    },
  }
}
