import { useEffect, useState } from "react"

const SCHEME = "https://"
const HORIZON = SCHEME + "horizon-testnet.stellar" + ".org"
const EXPLORER = SCHEME + "stellar" + ".expert/explorer/testnet"
const ARCSCAN = SCHEME + "testnet.arcscan" + ".app"
const IRIS = SCHEME + "iris-api-sandbox.circle" + ".com"
const CCTP_DOC = SCHEME + "developers.circle" + ".com/cctp/quickstarts/transfer-usdc-stellar-arc"
const STELLAR_REF = SCHEME + "developers.circle" + ".com/cctp/references/stellar"

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
const ARC_DOMAIN = 26
const STELLAR_DOMAIN = 27
const ARC_USDC = "0x3600000000000000000000000000000000000000"
const ARC_MSG_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
const ARC_TOKEN_MINTER = "0xb43db544E2c27092c107639Ad201b3dEfAbcF192"
const ARC_MESSAGE_LIB = "0xbaC0179bB358A8936169a63408C8481D582390C4"

const STAR = "\u2726"
const ARROW = "\u21c4"
const RARR = "\u2192"
const DASH = "\u2014"

function fmtNum(x: any) { const n = Number(x); return Number.isFinite(n) ? n.toLocaleString() : DASH }
function shorten(a: string) { return a && a.length > 14 ? a.slice(0, 8) + "..." + a.slice(-6) : a }

const wrap: any = { maxWidth: 1100, margin: "40px auto", padding: "0 20px" }
const head: any = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }
const glyph: any = { fontSize: 22, color: "#39e014" }
const h2s: any = { margin: 0, color: "#eafff0" }
const badge: any = { color: "#39e014", border: "1px solid #39e01455", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontFamily: "monospace" }
const roadmap: any = { color: "#caa94a", border: "1px solid #caa94a55", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontFamily: "monospace" }
const intro: any = { color: "#9fb09f", lineHeight: 1.6, marginTop: 12 }
const errBox: any = { background: "#0a0f0a", border: "1px solid #cf667955", borderRadius: 12, padding: 16, margin: "12px 0", color: "#cf6679" }
const row: any = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }
const tile: any = { background: "#0d140d", border: "1px solid #39e01422", borderRadius: 10, padding: "14px 16px", flex: "1 1 150px", minWidth: 140 }
const dim: any = { color: "#7a8a7a", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }
const val: any = { color: "#eafff0", fontSize: 20, fontFamily: "monospace", marginTop: 6 }
const link: any = { color: "#39e014", fontSize: 13, textDecoration: "none", marginRight: 16 }
const links: any = { display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }
const routeBox: any = { display: "flex", alignItems: "center", justifyContent: "center", gap: 18, background: "#0d140d", border: "1px solid #39e01433", borderRadius: 12, padding: "22px 16px", marginTop: 14, flexWrap: "wrap" }
const node: any = { textAlign: "center", minWidth: 120 }
const nodeName: any = { color: "#eafff0", fontSize: 16, fontWeight: 700 }
const nodeDom: any = { color: "#39e014", fontFamily: "monospace", fontSize: 12, marginTop: 4 }
const arrowS: any = { color: "#39e014", fontSize: 28 }
const ctrls: any = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }
const dBtn: any = { background: "#0d140d", border: "1px solid #39e01433", color: "#9fb09f", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 13 }
const dBtnA: any = { background: "#0f1f0f", border: "1px solid #39e014", color: "#39e014", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 13 }
const inp: any = { background: "#070b07", border: "1px solid #39e01455", color: "#eafff0", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 13, flex: "1 1 220px" }
const goBtn: any = { background: "#39e014", border: "none", color: "#041006", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 900, fontFamily: "monospace" }
const steps: any = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }
const stepC: any = { flex: "1 1 200px", background: "#0d140d", border: "1px solid #39e01422", borderRadius: 10, padding: 14 }
const stepN: any = { color: "#39e014", fontFamily: "monospace", fontSize: 12 }
const stepT: any = { color: "#cddfcd", marginTop: 6, lineHeight: 1.5, fontSize: 14 }
const trackBox: any = { background: "#0a0f0a", border: "1px solid #39e01433", borderRadius: 12, padding: 16, marginTop: 16 }
const small: any = { color: "#7a8a7a", fontSize: 12, marginTop: 10, lineHeight: 1.5 }
const addrList: any = { marginTop: 16 }
const aRow: any = { display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid #39e01422", flexWrap: "wrap" }
const aName: any = { color: "#9fb09f", fontFamily: "monospace", fontSize: 12 }
const aAddr: any = { color: "#39e014", fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", textDecoration: "none" }

export function StellarBridge() {
  const [ledger, setLedger] = useState<any>(null)
  const [asset, setAsset] = useState<any>(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(true)
  const [dir, setDir] = useState("arc-stellar")
  const [amount, setAmount] = useState("10")
  const [txh, setTxh] = useState("")
  const [track, setTrack] = useState<any>(null)
  const [tracking, setTracking] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const lr = await fetch(HORIZON + "/ledgers?order=desc&limit=1").then(r => r.json())
        const lrec = lr && lr._embedded && lr._embedded.records && lr._embedded.records[0]
        if (alive && lrec) setLedger(lrec)
        const ar = await fetch(HORIZON + "/assets?asset_code=USDC&asset_issuer=" + USDC_ISSUER).then(r => r.json())
        const arec = ar && ar._embedded && ar._embedded.records && ar._embedded.records[0]
        if (alive && arec) {
          const numAcc = arec.num_accounts != null ? arec.num_accounts : (arec.accounts && arec.accounts.authorized)
          const amt = arec.amount != null ? arec.amount : (arec.balances && arec.balances.authorized)
          setAsset({ numAccounts: numAcc, amount: amt })
        }
      } catch {
        if (alive) setErr("Stellar testnet Horizon unreachable")
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  async function doTrack() {
    if (!txh) return
    setTracking(true)
    setTrack(null)
    try {
      const src = dir === "arc-stellar" ? ARC_DOMAIN : STELLAR_DOMAIN
      const u = IRIS + "/v2/messages/" + src + "?transactionHash=" + txh.trim()
      const r = await fetch(u).then(x => x.json())
      const m = r && r.messages && r.messages[0]
      if (m) setTrack({ status: m.status, attestation: m.attestation })
      else setTrack({ status: "not_found" })
    } catch {
      setTrack({ status: "error" })
    } finally {
      setTracking(false)
    }
  }

  const fromLabel = dir === "arc-stellar" ? "Arc Testnet" : "Stellar Testnet"
  const toLabel = dir === "arc-stellar" ? "Stellar Testnet" : "Arc Testnet"
  const fromDom = dir === "arc-stellar" ? ARC_DOMAIN : STELLAR_DOMAIN
  const toDom = dir === "arc-stellar" ? STELLAR_DOMAIN : ARC_DOMAIN

  let statusText = ""
  let statusColor = "#9fb09f"
  if (track) {
    if (track.status === "complete") { statusText = "COMPLETE " + DASH + " attestation signed, ready to mint on " + toLabel; statusColor = "#39e014" }
    else if (track.status === "not_found") { statusText = "No CCTP message for this tx yet " + DASH + " check the hash or wait for the burn to confirm"; statusColor = "#caa94a" }
    else if (track.status === "error") { statusText = "Iris not reachable from this browser " + DASH + " verify via Circle CLI / curl"; statusColor = "#cf6679" }
    else { statusText = "PENDING " + DASH + " Circle Iris is attesting the burn (" + String(track.status) + ")"; statusColor = "#caa94a" }
  }
  const statusStyle: any = { color: statusColor, fontFamily: "monospace", fontSize: 14, marginTop: 10 }

  return (
    <>
      <section style={wrap}>
        <div style={head}>
          <span style={glyph}>{STAR}</span>
          <h2 style={h2s}>Cross-chain reach: Stellar</h2>
          <span style={badge}>CCTP DOMAIN {STELLAR_DOMAIN}</span>
          <span style={roadmap}>LIVE TESTNET</span>
        </div>
        <p style={intro}>Cronus settles x402 payments natively on Arc (CCTP domain {ARC_DOMAIN}). Circle CCTP moves the same canonical USDC 1:1 between Arc and Stellar (domain {STELLAR_DOMAIN}) by burn-and-mint {DASH} no wrapped assets, no custodial bridge. Metrics below are read live from Stellar testnet Horizon.</p>
        {err ? <div style={errBox}>{err}</div> : null}
        <div style={row}>
          <div style={tile}><div style={dim}>Stellar testnet</div><div style={val}>{loading ? "..." : (ledger ? "LIVE" : "n/a")}</div></div>
          <div style={tile}><div style={dim}>Latest ledger</div><div style={val}>{ledger ? "#" + fmtNum(ledger.sequence) : "..."}</div></div>
          <div style={tile}><div style={dim}>USDC trustlines</div><div style={val}>{asset ? fmtNum(asset.numAccounts) : "..."}</div></div>
          <div style={tile}><div style={dim}>USDC supply</div><div style={val}>{asset ? fmtNum(asset.amount) : "..."}</div></div>
        </div>
      </section>

      <section id="cap-bridge" style={wrap}>
        <div style={head}>
          <span style={glyph}>{ARROW}</span>
          <h2 style={h2s}>CCTP Bridge</h2>
          <span style={badge}>Arc {ARC_DOMAIN} {ARROW} Stellar {STELLAR_DOMAIN}</span>
          <span style={roadmap}>BURN AND MINT</span>
        </div>
        <p style={intro}>Move native USDC between Arc and Stellar over Circle CCTP. Pick a direction, then track any burn transaction live against Circle Iris attestation.</p>
        <div style={routeBox}>
          <div style={node}><div style={nodeName}>{fromLabel}</div><div style={nodeDom}>domain {fromDom}</div></div>
          <span style={arrowS}>{RARR}</span>
          <div style={node}><div style={nodeName}>Circle Iris</div><div style={nodeDom}>attestation</div></div>
          <span style={arrowS}>{RARR}</span>
          <div style={node}><div style={nodeName}>{toLabel}</div><div style={nodeDom}>domain {toDom}</div></div>
        </div>
        <div style={ctrls}>
          <button style={dir === "arc-stellar" ? dBtnA : dBtn} onClick={() => setDir("arc-stellar")}>Arc {RARR} Stellar</button>
          <button style={dir === "stellar-arc" ? dBtnA : dBtn} onClick={() => setDir("stellar-arc")}>Stellar {RARR} Arc</button>
          <input style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USDC amount" />
        </div>
        <div style={steps}>
          <div style={stepC}><div style={stepN}>STEP 1 {DASH} BURN</div><div style={stepT}>Burn {amount || "0"} USDC on {fromLabel} via depositForBurn. CCTP emits a burn message for domain {toDom}.</div></div>
          <div style={stepC}><div style={stepN}>STEP 2 {DASH} ATTEST</div><div style={stepT}>Circle Iris observes the burn and signs an attestation once finality is reached.</div></div>
          <div style={stepC}><div style={stepN}>STEP 3 {DASH} MINT</div><div style={stepT}>Submit message and attestation on {toLabel} to mint native USDC 1:1. On Stellar, inbound uses CctpForwarder.</div></div>
        </div>
        <div style={trackBox}>
          <div style={dim}>Live attestation tracker</div>
          <div style={ctrls}>
            <input style={inp} value={txh} onChange={(e) => setTxh(e.target.value)} placeholder={"Burn tx hash on " + fromLabel} />
            <button style={goBtn} onClick={doTrack}>{tracking ? "..." : "TRACK"}</button>
          </div>
          {track ? <div style={statusStyle}>{statusText}</div> : null}
          {track && track.attestation ? <div style={small}>attestation: {shorten(String(track.attestation))}</div> : null}
          <div style={small}>Queries Circle Iris sandbox for source domain {fromDom}. Automated relayer mint is on the Cronus roadmap.</div>
        </div>
        <div style={addrList}>
          <div style={dim}>CCTP contracts {DASH} Arc Testnet (domain {ARC_DOMAIN})</div>
          <div style={aRow}><span style={aName}>USDC ERC-20</span><a style={aAddr} href={ARCSCAN + "/address/" + ARC_USDC} target="_blank" rel="noreferrer">{ARC_USDC}</a></div>
          <div style={aRow}><span style={aName}>MessageTransmitterV2</span><a style={aAddr} href={ARCSCAN + "/address/" + ARC_MSG_TRANSMITTER} target="_blank" rel="noreferrer">{ARC_MSG_TRANSMITTER}</a></div>
          <div style={aRow}><span style={aName}>TokenMinterV2</span><a style={aAddr} href={ARCSCAN + "/address/" + ARC_TOKEN_MINTER} target="_blank" rel="noreferrer">{ARC_TOKEN_MINTER}</a></div>
          <div style={aRow}><span style={aName}>MessageV2</span><a style={aAddr} href={ARCSCAN + "/address/" + ARC_MESSAGE_LIB} target="_blank" rel="noreferrer">{ARC_MESSAGE_LIB}</a></div>
        </div>
        <div style={small}>Decimals: Arc USDC ERC-20 = 6 {DASH} Stellar USDC = 7 {DASH} Arc native gas USDC = 18. Always convert amounts across chains.</div>
        <div style={links}>
          <a style={link} href={CCTP_DOC} target="_blank" rel="noreferrer">Circle: Arc and Stellar quickstart</a>
          <a style={link} href={STELLAR_REF} target="_blank" rel="noreferrer">CCTP on Stellar reference</a>
        </div>
      </section>

      <section id="cap-stellar-net" style={wrap}>
        <div style={head}>
          <span style={glyph}>{STAR}</span>
          <h2 style={h2s}>Stellar Live Network</h2>
          <span style={badge}>HORIZON TESTNET</span>
        </div>
        <p style={intro}>Real-time Stellar testnet network state, read directly from Horizon {DASH} the same ledger that settles CCTP mints.</p>
        <div style={row}>
          <div style={tile}><div style={dim}>Latest ledger</div><div style={val}>{ledger ? "#" + fmtNum(ledger.sequence) : "..."}</div></div>
          <div style={tile}><div style={dim}>Closed at</div><div style={val}>{ledger ? new Date(ledger.closed_at).toLocaleTimeString() : "..."}</div></div>
          <div style={tile}><div style={dim}>Protocol</div><div style={val}>{ledger ? "v" + fmtNum(ledger.protocol_version) : "..."}</div></div>
          <div style={tile}><div style={dim}>Tx in ledger</div><div style={val}>{ledger ? fmtNum(ledger.successful_transaction_count) : "..."}</div></div>
        </div>
        <div style={row}>
          <div style={tile}><div style={dim}>Operations</div><div style={val}>{ledger ? fmtNum(ledger.operation_count) : "..."}</div></div>
          <div style={tile}><div style={dim}>Base fee strps</div><div style={val}>{ledger ? fmtNum(ledger.base_fee_in_stroops) : "..."}</div></div>
          <div style={tile}><div style={dim}>Base reserve strps</div><div style={val}>{ledger ? fmtNum(ledger.base_reserve_in_stroops) : "..."}</div></div>
          <div style={tile}><div style={dim}>Max tx set</div><div style={val}>{ledger ? fmtNum(ledger.max_tx_set_size) : "..."}</div></div>
        </div>
        <div style={row}>
          <div style={tile}><div style={dim}>Total XLM</div><div style={val}>{ledger ? fmtNum(ledger.total_coins) : "..."}</div></div>
          <div style={tile}><div style={dim}>Fee pool</div><div style={val}>{ledger ? fmtNum(ledger.fee_pool) : "..."}</div></div>
          <div style={tile}><div style={dim}>USDC trustlines</div><div style={val}>{asset ? fmtNum(asset.numAccounts) : "..."}</div></div>
          <div style={tile}><div style={dim}>USDC supply</div><div style={val}>{asset ? fmtNum(asset.amount) : "..."}</div></div>
        </div>
        <div style={links}>
          <a style={link} href={EXPLORER + "/asset/USDC-" + USDC_ISSUER} target="_blank" rel="noreferrer">USDC on Stellar Expert</a>
          <a style={link} href={EXPLORER} target="_blank" rel="noreferrer">Stellar testnet explorer</a>
        </div>
      </section>
    </>
  )
}
