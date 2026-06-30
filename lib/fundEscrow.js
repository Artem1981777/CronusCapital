// lib/fundEscrow.js — server-side gas top-up for the stake escrow.
// Signs with STAKE_PRIVATE_KEY (agent-identity wallet 0x46213abe) and sends native gas to STAKE_ESCROW
// so the resolver can pay gas without touching staked principal.
// GET = no-funds preview. POST (Bearer CRON_SECRET) = execute. Routed via vercel.json -> /api/info?kind=fund-escrow.
import { createWalletClient, createPublicClient, http, defineChain, parseEther, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || "5042002")
const ARC_RPC = process.env.ARC_RPC || process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app"
const ESCROW = process.env.STAKE_ESCROW ? getAddress(process.env.STAKE_ESCROW) : null
const arcChain = defineChain({ id: ARC_CHAIN_ID, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } })
function normPk(pk) { if (!pk) return null; return pk.startsWith("0x") ? pk : "0x" + pk }
export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
	if (req.method === "OPTIONS") { res.status(200).end(); return }
	const pk = normPk(process.env.STAKE_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY)
	let funder = null, funderNative = "0", escrowNative = "0"
	const pub = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) })
	if (pk) { try { const a = privateKeyToAccount(pk); funder = a.address; try { funderNative = String(await pub.getBalance({ address: a.address })) } catch (_) {} } catch (_) {} }
	if (ESCROW) { try { escrowNative = String(await pub.getBalance({ address: ESCROW })) } catch (_) {} }
	if (req.method !== "POST") {
		res.status(200).json({ ok: true, mode: "dry-run", funder: funder, escrow: ESCROW, funderNativeWei: funderNative, escrowNativeWei: escrowNative, defaultAmount: "0.5", note: "POST with Bearer CRON_SECRET sends native gas to escrow. ?amount=0.5 (cap 2)." })
		return
	}
	const secret = process.env.CRON_SECRET || ""
	const auth = (req.headers && req.headers.authorization) || ""
	if (!secret || auth !== "Bearer " + secret) { res.status(401).json({ ok: false, error: "unauthorized" }); return }
	if (!pk) { res.status(500).json({ ok: false, error: "STAKE_PRIVATE_KEY not set" }); return }
	if (!ESCROW) { res.status(500).json({ ok: false, error: "STAKE_ESCROW not set" }); return }
	const amtStr = (req.query && req.query.amount) ? String(req.query.amount) : "0.5"
	const amtNum = Number(amtStr)
	if (!isFinite(amtNum) || amtNum <= 0 || amtNum > 2) { res.status(400).json({ ok: false, error: "amount must be 0 < x <= 2" }); return }
	const account = privateKeyToAccount(pk)
	const wallet = createWalletClient({ account: account, chain: arcChain, transport: http(ARC_RPC) })
	try {
		const hash = await wallet.sendTransaction({ to: ESCROW, value: parseEther(amtStr) })
		const rc = await pub.waitForTransactionReceipt({ hash: hash })
		const after = String(await pub.getBalance({ address: ESCROW }))
		res.status(rc.status === "success" ? 200 : 502).json({ ok: rc.status === "success", fundTx: hash, explorer: EXPLORER + "/tx/" + hash, funder: account.address, escrow: ESCROW, amount: amtStr, escrowNativeWeiAfter: after })
	} catch (e) { res.status(502).json({ ok: false, error: String((e && e.message) || e) }) }
}
