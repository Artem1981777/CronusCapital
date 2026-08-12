// lib/nft.js — read-only NFT state, taken off Arc rather than from our own database.
//
// Two tokens, one rule between them. The soulbound certificate records a fire drill and
// rots by itself one day later. The access pass sells API access and a parametric policy,
// and asks the certificate whether coverage should be live at all. If we stop drilling,
// the pass says so without anyone editing this file.
//
// A value the node refuses to return is reported as unread, never defaulted. A missing
// pool balance must not render as zero coverage, and a missing status must not render as
// a healthy one.
import { Interface } from "ethers"

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network"
const CERT = (process.env.DRILL_CERTIFICATE || "0xB327a942A64A190b453c7D6b27Cc03FE7ACDF166").toLowerCase()
const PASS = (process.env.ACCESS_PASS || "0x6D59E3bF169743Dd31b5ba9eb394FEad0A9756C2").toLowerCase()
const EXPLORER = "https://testnet.arcscan.app"
const ADDR = EXPLORER + "/address/"

const CERT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function status(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function holder() view returns (address)",
  "function guard() view returns (address)",
]

const PASS_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function price() view returns (uint256)",
  "function period() view returns (uint256)",
  "function coveragePerPass() view returns (uint256)",
  "function poolUsdc() view returns (uint256)",
  "function backedPerPass() view returns (uint256)",
  "function latestCertificateStatus() view returns (string)",
  "function coverage() view returns (bool, string)",
  "function breached() view returns (bool)",
  "function ownerOf(uint256) view returns (address)",
  "function expiresAt(uint256) view returns (uint64)",
  "function isActive(uint256) view returns (bool)",
  "function tokenURI(uint256) view returns (string)",
]

const CI = new Interface(CERT_ABI)
const PI = new Interface(PASS_ABI)

// Every contract we publicly point at. The verified flag is asked of the explorer on each
// request, so the claim cannot drift away from reality the way a README does.
const PUBLISHED = [
  { label: "Fire drill certificate (ERC-721, soulbound)", address: CERT },
  { label: "Access pass and policy (ERC-721)", address: PASS },
  { label: "Agent guard v2", address: "0xeA4788164c63B0EF2788d9c74859B43f42BC391E" },
  { label: "Multisig owner", address: "0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F" },
  { label: "Agent guard v1", address: "0x363A585faeECC19c001978e7674EB0D52a641181" },
  { label: "Identity registry (ERC-8004)", address: "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c" },
  { label: "Reputation", address: "0x2A19ad056EaE83364B0a6420685974cA219c209E" },
  { label: "Job escrow", address: "0x64e55De4CbC3CDf981B2c970807129FA61806873" },
  { label: "Vault", address: "0x13B6984357e27dAB17DF44a6396042239e70542C" },
  { label: "Swap pool", address: "0x0924Dae7005FC214D3A243E4f811ae4A34607400" },
]

// Contracts we know we cannot verify, with the reason. Kept next to the live check so the
// limitation is published rather than quietly omitted.
const KNOWN_UNVERIFIABLE = {
  "0xea4788164c63b0ef2788d9c74859b43f42bc391e":
    "built with the Termux compiler 0.8.36+commit.8a079791.Android.clang, which is not among the explorer's reference builds, so the verifier cannot reproduce the bytecode",
  "0xde8874c53d82a38c1c2864ea575f9e62dc29da5f":
    "built with the Termux compiler 0.8.36+commit.8a079791.Android.clang, which is not among the explorer's reference builds, so the verifier cannot reproduce the bytecode",
}

// The public Arc RPC rate-limits bursts, and a rate-limited read is an unread value rather
// than a zero. Rather than firing twenty calls at once and reporting half the page as
// unknown, reads are queued one at a time with a small gap and retried on rate limits.
let rpcQueue = Promise.resolve()
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

function ethCall(to, data) {
  const run = rpcQueue.then(() => callWithRetry(to, data))
  rpcQueue = run.then(() => pause(120), () => pause(120))
  return run
}

async function callWithRetry(to, data) {
  let last
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await rawCall(to, data)
    } catch (e) {
      last = e
      const msg = String(e.message || e)
      if (!/rate limit|429|too many/i.test(msg)) throw e
      await pause(400 * (attempt + 1))
    }
  }
  throw last
}

async function rawCall(to, data) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message || "eth_call failed")
  return j.result
}

function makeReader(iface, address, unread) {
  return async function read(fn, args = []) {
    try {
      const out = iface.decodeFunctionResult(fn, await ethCall(address, iface.encodeFunctionData(fn, args)))
      return out.length === 1 ? out[0] : out
    } catch (e) {
      unread.push({ contract: address, call: fn, reason: String(e.message || e).slice(0, 160) })
      return null
    }
  }
}

const micros = (v) => (v === null || v === undefined ? null : Number(v) / 1e6)

// The metadata is base64 inside the contract. We decode it here only so the dashboard can
// render it; nothing is added, and the image stays exactly the data URI the contract built.
function decodeTokenUri(uri) {
  if (!uri || typeof uri !== "string") return null
  const marker = "base64,"
  const i = uri.indexOf(marker)
  if (i === -1) return null
  try {
    return JSON.parse(Buffer.from(uri.slice(i + marker.length), "base64").toString("utf8"))
  } catch {
    return null
  }
}

async function verificationStatus() {
  const rows = await Promise.all(
    PUBLISHED.map(async (c) => {
      const key = c.address.toLowerCase()
      try {
        const r = await fetch(EXPLORER + "/api/v2/addresses/" + c.address)
        if (!r.ok) throw new Error("explorer http " + r.status)
        const j = await r.json()
        const verified = j.is_verified === true
        return {
          label: c.label,
          address: c.address,
          explorer: ADDR + c.address,
          verified,
          reason: verified ? null : KNOWN_UNVERIFIABLE[key] || "not verified on the explorer",
        }
      } catch (e) {
        return {
          label: c.label,
          address: c.address,
          explorer: ADDR + c.address,
          verified: null,
          reason: "could not be read from the explorer: " + String(e.message || e).slice(0, 120),
        }
      }
    })
  )
  const verified = rows.filter((r) => r.verified === true).length
  const unknown = rows.filter((r) => r.verified === null).length
  return {
    checkedAt: new Date().toISOString(),
    total: rows.length,
    verified,
    unverified: rows.length - verified - unknown,
    unknown,
    note:
      "This count is read from the explorer on every request. Contracts we cannot verify are listed with the reason instead of being left out.",
    contracts: rows,
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120")

  const unread = []
  const rc = makeReader(CI, CERT, unread)
  const rp = makeReader(PI, PASS, unread)

  try {
    const [certSupply, certName, operator, guardian, holder, guardAddr] = await Promise.all([
      rc("totalSupply"),
      rc("name"),
      rc("operator"),
      rc("guardian"),
      rc("holder"),
      rc("guard"),
    ])

    let latestCert = null
    if (certSupply !== null && Number(certSupply) > 0) {
      const id = Number(certSupply)
      const [status, owner, uri] = await Promise.all([rc("status", [id]), rc("ownerOf", [id]), rc("tokenURI", [id])])
      const meta = decodeTokenUri(uri)
      latestCert = {
        tokenId: id,
        status,
        owner,
        ownerExplorer: owner ? ADDR + owner : null,
        image: meta?.image || null,
        metadata: meta ? { name: meta.name, description: meta.description, attributes: meta.attributes } : null,
        metadataReadable: meta !== null,
      }
    }

    const [passSupply, price, period, cap, pool, backed, certStatusSeen, cov, breached] = await Promise.all([
      rp("totalSupply"),
      rp("price"),
      rp("period"),
      rp("coveragePerPass"),
      rp("poolUsdc"),
      rp("backedPerPass"),
      rp("latestCertificateStatus"),
      rp("coverage"),
      rp("breached"),
    ])

    let latestPass = null
    if (passSupply !== null && Number(passSupply) > 0) {
      const id = Number(passSupply)
      const [owner, expires, active, uri] = await Promise.all([
        rp("ownerOf", [id]),
        rp("expiresAt", [id]),
        rp("isActive", [id]),
        rp("tokenURI", [id]),
      ])
      const meta = decodeTokenUri(uri)
      latestPass = {
        tokenId: id,
        owner,
        ownerExplorer: owner ? ADDR + owner : null,
        expiresAtUnix: expires === null ? null : Number(expires),
        expiresAtIso: expires === null ? null : new Date(Number(expires) * 1000).toISOString(),
        active,
        image: meta?.image || null,
        metadata: meta ? { name: meta.name, description: meta.description, attributes: meta.attributes } : null,
        metadataReadable: meta !== null,
      }
    }

    const coverageLive = cov === null ? null : Boolean(cov[0])
    const coverageReason = cov === null ? null : String(cov[1])

    const verification = await verificationStatus()

    const body = {
      ok: true,
      resolver: "cronus-nft-v1",
      generatedAt: new Date().toISOString(),
      network: { name: "Arc testnet", chainId: 5042002, rpc: RPC },

      certificate: {
        address: CERT,
        explorer: ADDR + CERT,
        name: certName,
        supply: certSupply === null ? null : Number(certSupply),
        operator,
        guardian,
        holder,
        guardUnderTest: guardAddr,
        latest: latestCert,
        rules: [
          "Only the operator that runs the drills can mint, and it mints to the multisig, never to itself.",
          "The guardian can revoke a certificate but can never issue one: the watcher holds negative power only.",
          "Transfers revert. A certificate cannot be sold, gifted or laundered into someone else's track record.",
          "A certificate expires one day after the drill it describes, so silence turns into EXPIRED without anyone acting.",
          "A skipped scenario is counted as skipped, which is why certificate #1 reads INCOMPLETE rather than passing.",
        ],
        limit:
          "The contract stores the transaction hashes of each drill scenario but cannot itself verify them. Check them on the explorer.",
      },

      pass: {
        address: PASS,
        explorer: ADDR + PASS,
        supply: passSupply === null ? null : Number(passSupply),
        priceUsdc: micros(price),
        periodDays: period === null ? null : Number(period) / 86400,
        coverageCapPerPassUsdc: micros(cap),
        poolUsdc: micros(pool),
        backedPerPassUsdc: micros(backed),
        payoutCondition: "the latest fire-drill certificate reads BREACHED",
        breachedNow: breached,
        latest: latestPass,
        rules: [
          "Half of every payment stays in this contract as the coverage pool; the other half goes to the treasury.",
          "backedPerPass is the smaller of the cap and what the pool can actually pay per pass, so the policy cannot promise more than it holds.",
          "A payout is only possible while the pass is unexpired and the certificate reads BREACHED, and only once per pass.",
        ],
      },

      link: {
        rule: "coverage follows the drills",
        certificateStatusSeenByPass: certStatusSeen,
        coverageLive,
        coverageReason,
        explanation:
          "The pass reads the certificate's status on chain. Once the certificate goes stale, coverage is suspended by the contract itself, so we cannot keep selling protection while letting the proofs rot.",
      },

      verification,

      unread,
      complete: unread.length === 0,
      honesty:
        unread.length === 0
          ? "Every number on this page was read from Arc at request time."
          : unread.length + " value(s) could not be read and are reported as unread rather than guessed.",
    }

    return res.status(200).json(body)
  } catch (e) {
    return res.status(500).json({
      ok: false,
      resolver: "cronus-nft-v1",
      error: String(e.message || e),
      note: "No cached or assumed values are served in place of a failed read.",
    })
  }
}
