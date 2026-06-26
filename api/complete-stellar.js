import { Contract, Keypair, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk"

export const config = { maxDuration: 60 }

const FORWARDER = "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"
const RPC_URL = "https://soroban-testnet.stellar" + ".org"
const PASSPHRASE = "Test SDF Network ; September 2015"
const IRIS = "https://iris-api-sandbox.circle" + ".com"
const FRIENDBOT = "https://friendbot.stellar" + ".org"
const STELLAR_EXPLORER = "https://stellar" + ".expert/explorer/testnet/tx/"
const ARC_DOMAIN = 26

function scvBytesFromHex(hex) {
  const clean = String(hex).replace(/^0x/, "")
  return xdr.ScVal.scvBytes(Buffer.from(clean, "hex"))
}

async function getAttestation(txHash) {
  const url = IRIS + "/v2/messages/" + ARC_DOMAIN + "?transactionHash=" + txHash
  const r = await fetch(url)
  if (!r.ok) return { ok: false, code: r.status }
  const j = await r.json()
  const m = j && j.messages && j.messages[0]
  return { ok: true, msg: m }
}

function sleep(ms) { return new Promise(function (done) { setTimeout(done, ms) }) }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const txHash = String((req.query && req.query.txHash) || "").trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ status: "bad_request", detail: "missing or invalid txHash" })
  }

  try {
    const att = await getAttestation(txHash)
    if (!att.ok) return res.status(502).json({ status: "iris_error", code: att.code })
    const m = att.msg
    if (!m || m.status !== "complete" || !m.message || !m.attestation || m.attestation === "PENDING") {
      return res.status(200).json({ status: "pending", iris: m ? m.status : "none" })
    }

    const kp = Keypair.random()
    const fb = await fetch(FRIENDBOT + "?addr=" + encodeURIComponent(kp.publicKey()))
    if (!fb.ok) return res.status(502).json({ status: "fund_failed", code: fb.status })

    const server = new rpc.Server(RPC_URL)
    let account = null
    for (let i = 0; i < 10; i++) {
      try { account = await server.getAccount(kp.publicKey()); break }
      catch { await sleep(1500) }
    }
    if (!account) return res.status(504).json({ status: "account_not_ready" })

    const contract = new Contract(FORWARDER)
    const tx = new TransactionBuilder(account, { fee: "10000000", networkPassphrase: PASSPHRASE })
      .addOperation(contract.call("mint_and_forward", scvBytesFromHex(m.message), scvBytesFromHex(m.attestation)))
      .setTimeout(120)
      .build()

    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) {
      return res.status(500).json({ status: "sim_failed", detail: String(sim.error || "") })
    }

    const prepared = rpc.assembleTransaction(tx, sim).build()
    prepared.sign(kp)

    const sent = await server.sendTransaction(prepared)
    if (sent.status === "ERROR") {
      return res.status(500).json({ status: "send_failed", detail: JSON.stringify(sent.errorResult || sent) })
    }

    let got = await server.getTransaction(sent.hash)
    let tries = 0
    while (got.status === "NOT_FOUND" && tries < 20) {
      await sleep(2000)
      got = await server.getTransaction(sent.hash)
      tries++
    }
    if (got.status !== "SUCCESS") {
      return res.status(500).json({ status: "tx_failed", detail: got.status, stellarTxHash: sent.hash })
    }

    return res.status(200).json({
      status: "success",
      stellarTxHash: sent.hash,
      explorer: STELLAR_EXPLORER + sent.hash,
      relayer: kp.publicKey()
    })
  } catch (e) {
    return res.status(500).json({ status: "error", detail: (e && e.message) ? e.message : String(e) })
  }
}
