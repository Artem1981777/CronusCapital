const IRIS = process.env.CCTP_MAINNET_IRIS_URL || "https://iris-api.circle.com"
const HASH_RE = /^0x[0-9a-fA-F]{64}$/

const SOURCE_DOMAINS = {
  arc: 26,
  base: 6,
}

const DESTINATIONS = {
  arc: { chain: "base", domain: 6 },
  base: { chain: "arc", domain: 26 },
}

async function fetchT(url, ms) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms || 8000)
  try {
    return await fetch(url, {
      signal: c.signal,
      headers: { accept: "application/json" },
    })
  } finally {
    clearTimeout(t)
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=15")

  const q = req.query || {}
  const source = String(q.source || q.sourceChain || "arc").trim().toLowerCase()
  const sourceDomain = SOURCE_DOMAINS[source]
  const destination = DESTINATIONS[source]
  const txHash = String(q.txHash || "").trim()

  if (!sourceDomain || !destination) {
    res.status(400).json({
      ok: false,
      status: "bad_request",
      error: "source must be arc or base",
    })
    return
  }

  const base = {
    ok: true,
    product: "cronus_cctp_status",
    protocol: "Circle CCTP v2 (EVM burn-and-mint via attestation)",
    source_domain: sourceDomain,
    source_chain: source + "-mainnet",
    destination: destination.chain + "-mainnet",
    destination_domain: destination.domain,
    iris: IRIS,
    read_only: true,
    note: "Read-only attestation status. This tool never mints or moves funds.",
  }

  if (!txHash) {
    res.status(200).json(Object.assign({}, base, {
      status: "info",
      hint: "Pass ?source=arc&txHash=<burn tx hash> or ?source=base&txHash=<burn tx hash>.",
    }))
    return
  }

  if (!HASH_RE.test(txHash)) {
    res.status(400).json(Object.assign({}, base, {
      ok: false,
      status: "bad_request",
      error: "txHash must be 0x + 64 hex characters",
    }))
    return
  }

  try {
    const url = IRIS + "/v2/messages/" + sourceDomain +
      "?transactionHash=" + encodeURIComponent(txHash)
    const r = await fetchT(url, 8000)

    if (!r.ok) {
      res.status(200).json(Object.assign({}, base, {
        txHash,
        status: "not_found",
        iris_http: r.status,
        hint: "No CCTP message found yet; retry shortly.",
      }))
      return
    }

    const j = await r.json()
    const m = j && j.messages && j.messages[0]

    if (!m) {
      res.status(200).json(Object.assign({}, base, {
        txHash,
        status: "not_found",
        hint: "IRIS returned no messages for this transaction yet.",
      }))
      return
    }

    const attestationReady =
      m.status === "complete" &&
      m.attestation &&
      m.attestation !== "PENDING"

    res.status(200).json(Object.assign({}, base, {
      txHash,
      status: attestationReady ? "complete" : (m.status || "pending"),
      attestation_ready: attestationReady,
      cctp: {
        message_status: m.status || null,
        attestation_present: !!(m.attestation && m.attestation !== "PENDING"),
        event_nonce: m.eventNonce || null,
        cctp_version: m.cctpVersion || null,
        source_domain: m.sourceDomain != null ? m.sourceDomain : sourceDomain,
        destination_domain: m.destinationDomain != null
          ? m.destinationDomain
          : destination.domain,
      },
      next: attestationReady
        ? "Attestation ready; call cronus_bridge_complete for destination mint."
        : "Attestation pending on Circle; retry shortly.",
    }))
  } catch (e) {
    res.status(502).json(Object.assign({}, base, {
      ok: false,
      txHash,
      status: "iris_unreachable",
      error: String((e && e.message) || e),
    }))
  }
}
