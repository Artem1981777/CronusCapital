// lib/cctpStatus.js — READ-ONLY Circle CCTP v2 attestation status for an Arc burn tx.
// Arc is CCTP source domain 26. Given a burn txHash on Arc, query Circle IRIS for the
// attestation status only. NEVER mints or moves funds (that is /api/complete-stellar).
const IRIS = process.env.CCTP_IRIS_URL || "https://iris-api-sandbox.circle.com"
const ARC_DOMAIN = Number(process.env.CCTP_ARC_DOMAIN || "26")
const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const STELLAR_FORWARDER = process.env.CCTP_STELLAR_FORWARDER || "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"

async function fetchT(url, ms) {
  const c = new AbortController()
  const t = setTimeout(function () { c.abort() }, ms || 8000)
  try { return await fetch(url, { signal: c.signal, headers: { accept: "application/json" } }) }
  finally { clearTimeout(t) }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=15")
  const txHash = String((req.query && req.query.txHash) || "").trim()
  const base = {
    ok: true,
    product: "cronus_cctp_status",
    protocol: "Circle CCTP v2 (burn-and-mint via attestation)",
    source_domain: ARC_DOMAIN,
    source_chain: "arc-testnet",
    destination: "stellar-testnet (Soroban)",
    stellar_forwarder: STELLAR_FORWARDER,
    iris: IRIS,
    read_only: true,
    note: "Read-only attestation status. This tool never mints or moves funds; mint/execution is a separate authenticated flow (/api/complete-stellar).",
  }
  if (!txHash) {
    res.status(200).json(Object.assign({}, base, { status: "info", hint: "Pass ?txHash=<Arc burn txHash> to check its Circle attestation status (pending -> complete)." }))
    return
  }
  if (!HASH_RE.test(txHash)) {
    res.status(400).json(Object.assign({}, base, { ok: false, status: "bad_request", error: "txHash must be 0x + 64 hex (an Arc burn tx on CCTP domain " + ARC_DOMAIN + ")" }))
    return
  }
  try {
    const url = IRIS + "/v2/messages/" + ARC_DOMAIN + "?transactionHash=" + encodeURIComponent(txHash)
    const r = await fetchT(url, 8000)
    if (!r.ok) {
      res.status(200).json(Object.assign({}, base, { txHash: txHash, status: "not_found", iris_http: r.status, hint: "No CCTP message for this txHash yet. If just burned, retry shortly; ensure it is an Arc (domain " + ARC_DOMAIN + ") burn tx." }))
      return
    }
    const j = await r.json()
    const m = j && j.messages && j.messages[0]
    if (!m) {
      res.status(200).json(Object.assign({}, base, { txHash: txHash, status: "not_found", hint: "IRIS returned no messages for this txHash yet." }))
      return
    }
    const attestationReady = !!(m.status === "complete" && m.attestation && m.attestation !== "PENDING")
    res.status(200).json(Object.assign({}, base, {
      txHash: txHash,
      status: attestationReady ? "complete" : (m.status || "pending"),
      attestation_ready: attestationReady,
      cctp: {
        message_status: m.status || null,
        attestation_present: !!(m.attestation && m.attestation !== "PENDING"),
        event_nonce: m.eventNonce || null,
        cctp_version: m.cctpVersion || null,
        source_domain: m.sourceDomain != null ? m.sourceDomain : ARC_DOMAIN,
        destination_domain: m.destinationDomain != null ? m.destinationDomain : null,
      },
      next: attestationReady ? "Attestation ready; it can be minted on the destination chain (separate authenticated step; this tool does not mint)." : "Attestation pending on Circle; retry shortly.",
    }))
  } catch (e) {
    res.status(502).json(Object.assign({}, base, { ok: false, txHash: txHash, status: "iris_unreachable", error: String((e && e.message) || e) }))
  }
}
