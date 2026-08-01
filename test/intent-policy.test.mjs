import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseIntent, toAtomicUsdc, isVerifiedRoute, evaluateIntent,
  buildIntentPdr, verifyIntentPdr, INTENT_POLICY_VERSION, SWAP_PAIRS,
} from "../lib/intentPolicy.js"

const SENDER = "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"

test("bridge: plain from/to route parses to allowlisted keys", () => {
  const r = parseIntent("bridge 5 USDC from Base to Arc")
  assert.equal(r.ok, true)
  assert.equal(r.kind, "bridge")
  assert.equal(r.from, "base")
  assert.equal(r.to, "arc")
  assert.equal(r.amount, "5")
})

test("bridge: reversed to/from wording parses the same route", () => {
  const r = parseIntent("send 2 usdc to arc from avalanche fuji")
  assert.equal(r.ok, true)
  assert.equal(r.from, "avalanche")
  assert.equal(r.to, "arc")
})

test("bridge: arrow syntax parses an Arc-outbound route", () => {
  const r = parseIntent("move 0.25 usdc arc -> optimism")
  assert.equal(r.ok, true)
  assert.equal(r.from, "arc")
  assert.equal(r.to, "optimism")
})

test("bridge: a route that never touches Arc is now routable", () => {
  const r = parseIntent("bridge 3 usdc from base to ethereum")
  assert.equal(r.ok, true)
  assert.equal(r.from, "base")
  assert.equal(r.to, "ethereum")
})

test("bridge: an unproven route is flagged as unverified, not hidden", () => {
  const r = parseIntent("bridge 3 usdc from base to ethereum")
  assert.equal(r.routeVerified, false)
})

test("bridge: a route we executed on-chain is flagged verified", () => {
  assert.equal(parseIntent("bridge 1 usdc from base to arc").routeVerified, true)
  assert.equal(parseIntent("bridge 1 usdc from arc to base").routeVerified, true)
  assert.equal(isVerifiedRoute("arc", "optimism"), false)
})

test("bridge: identical source and destination is refused", () => {
  const r = parseIntent("bridge 1 usdc from base to base")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("route_same_network"))
})

test("bridge: a missing destination asks for exactly that field", () => {
  const r = parseIntent("bridge 5 usdc from base")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("clarification_required"))
  assert.ok(r.missing.includes("destination_network"))
})

test("bridge: mainnet is refused because the bridge is testnet-only", () => {
  const r = parseIntent("bridge 1 usdc from base mainnet to arc")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("mainnet_not_supported"))
})

test("bridge: more precision than USDC carries is refused", () => {
  const r = parseIntent("bridge 1.1234567 usdc from base to arc")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("amount_decimals_exceeded"))
})

test("swap: the real USDC to USYC conversion parses", () => {
  const r = parseIntent("swap 10 usdc for usyc")
  assert.equal(r.ok, true)
  assert.equal(r.kind, "swap")
  assert.equal(r.fromToken, "usdc")
  assert.equal(r.toToken, "usyc")
  assert.equal(r.network, "arc")
})

test("swap: redeeming USYC resolves the destination without being told", () => {
  const r = parseIntent("redeem 4 usyc")
  assert.equal(r.ok, true)
  assert.equal(r.fromToken, "usyc")
  assert.equal(r.toToken, "usdc")
})

test("swap: buying USYC resolves USDC as the source", () => {
  const r = parseIntent("buy 7 usyc")
  assert.equal(r.ok, true)
  assert.equal(r.fromToken, "usdc")
  assert.equal(r.toToken, "usyc")
})

test("swap: an ETH pair is refused by name because no DEX is integrated", () => {
  const r = parseIntent("swap 5 eth for usdc")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("token_not_supported"))
  assert.ok(r.reasons.includes("dex_not_integrated"))
})

test("swap: a plausible stablecoin pair is still refused, not routed", () => {
  const r = parseIntent("convert 100 usdc to dai")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("dex_not_integrated"))
})

test("swap: only supported pairs are advertised", () => {
  assert.deepEqual([...SWAP_PAIRS], ["usdc>usyc", "usyc>usdc", "usdc>crn", "crn>usdc"])
})

test("amount: decimal USDC converts to exact atomic units", () => {
  assert.equal(toAtomicUsdc("1.5"), 1500000)
  assert.equal(toAtomicUsdc("0.000001"), 1)
  assert.equal(toAtomicUsdc("1.1234567"), null)
})

test("policy: a small self-bridge inside the caps is allowed", () => {
  const d = evaluateIntent("bridge 5 usdc from base to arc", { sender: SENDER })
  assert.equal(d.allow, true)
  assert.equal(d.amountAtomic, 5000000)
  assert.equal(d.intentPolicyVersion, INTENT_POLICY_VERSION)
})

test("policy: an amount over the per-transaction cap is refused by the kernel", () => {
  const d = evaluateIntent("bridge 500 usdc from base to arc", { sender: SENDER })
  assert.equal(d.allow, false)
  assert.ok(d.reasons.includes("per_tx_cap_exceeded"))
})

test("policy: the bridge may only deliver to the address that initiated it", () => {
  const d = evaluateIntent("bridge 5 usdc from base to arc", {
    sender: SENDER,
    recipient: "0x000000000000000000000000000000000000dead",
  })
  assert.equal(d.allow, false)
  assert.ok(d.reasons.includes("recipient_not_allowlisted"))
})

test("policy: a USDC-funded conversion is capped like any other spend", () => {
  const d = evaluateIntent("swap 10 usdc for usyc", { sender: SENDER })
  assert.equal(d.allow, true)
  assert.equal(d.amountAtomic, 10000000)
})

test("policy: a USYC-denominated amount fails closed without a USDC valuation", () => {
  const d = evaluateIntent("redeem 4 usyc", { sender: SENDER })
  assert.equal(d.allow, false)
  assert.ok(d.reasons.includes("usdc_value_unknown"))
  assert.ok(d.missing.includes("usdcValueAtomic"))
})

test("policy: supplying the USDC valuation lets the same redeem be judged", () => {
  const d = evaluateIntent("redeem 4 usyc", { sender: SENDER, usdcValueAtomic: 4020000 })
  assert.equal(d.allow, true)
  assert.equal(d.amountAtomic, 4020000)
})

test("pdr: a refusal is recorded, not discarded", () => {
  const text = "swap 5 eth for usdc"
  const { record, address } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(record.output.allow, false)
  assert.ok(record.output.reasons.includes("dex_not_integrated"))
  assert.ok(address.startsWith("sha256:"))
})

test("pdr: an unverified route is stated as unverified in the record", () => {
  const text = "bridge 2 usdc from arc to optimism"
  const { record } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(record.input.routeVerified, false)
})

test("pdr: a proven route is stated as verified in the record", () => {
  const text = "bridge 2 usdc from base to arc"
  const { record } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(record.input.routeVerified, true)
})

test("pdr: a swap records the pair and no network route", () => {
  const text = "swap 10 usdc for usyc"
  const { record } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(record.input.pair.toToken, "usyc")
  assert.equal(record.input.route, null)
})

test("pdr: the raw intent text is committed as a digest, never stored", () => {
  const text = "bridge 5 usdc from base to arc"
  const { record } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.ok(record.input.intentDigest.startsWith("sha256:"))
  assert.ok(!JSON.stringify(record).includes("bridge 5 usdc"))
})

test("pdr: tampering with a stored record breaks its address", () => {
  const text = "bridge 5 usdc from base to arc"
  const { record, address } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(verifyIntentPdr(record, address), true)
  const tampered = { ...record, input: { ...record.input, amountAtomic: 25000000 } }
  assert.equal(verifyIntentPdr(tampered, address), false)
})

// --- multilingual (ipdr-3) ---
import { localizeIntent, LANGUAGES } from "../lib/intentPolicy.js"

test("lang: a Russian bridge request parses like its English twin", () => {
  const r = parseIntent("переведи 5 usdc с base на arc")
  assert.equal(r.ok, true)
  assert.equal(r.lang, "ru")
  assert.equal(r.from, "base")
  assert.equal(r.to, "arc")
  assert.equal(r.amount, "5")
})

test("lang: Russian network names in Cyrillic resolve", () => {
  const r = parseIntent("отправь 2 usdc из арбитрума в арк")
  assert.equal(r.ok, true)
  assert.equal(r.from, "arbitrum")
  assert.equal(r.to, "arc")
})

test("lang: a Russian conversion resolves the real USYC pair", () => {
  const r = parseIntent("обменяй 10 usdc на usyc")
  assert.equal(r.ok, true)
  assert.equal(r.kind, "swap")
  assert.equal(r.fromToken, "usdc")
  assert.equal(r.toToken, "usyc")
})

test("lang: a Russian redeem resolves the destination without being told", () => {
  const r = parseIntent("погаси 4 usyc")
  assert.equal(r.ok, true)
  assert.equal(r.fromToken, "usyc")
  assert.equal(r.toToken, "usdc")
})

test("lang: a Russian refusal keeps its reason, translated to nothing", () => {
  const r = parseIntent("обменяй 5 eth на usdc")
  assert.equal(r.ok, false)
  assert.equal(r.lang, "ru")
  assert.ok(r.reasons.includes("dex_not_integrated"))
})

test("lang: Spanish, Portuguese, French and German bridges all parse", () => {
  const cases = [
    ["envía 5 usdc de base a arc", "es"],
    ["envie 5 usdc de base para arc", "pt"],
    ["envoie 5 usdc depuis base vers arc", "fr"],
    ["sende 5 usdc von base nach arc", "de"],
  ]
  for (const [text, lang] of cases) {
    const r = parseIntent(text)
    assert.equal(r.ok, true, text)
    assert.equal(r.lang, lang, text)
    assert.equal(r.from, "base", text)
    assert.equal(r.to, "arc", text)
  }
})

test("lang: the same intent in six languages yields one identical decision", () => {
  const texts = [
    "bridge 5 usdc from base to arc",
    "переведи 5 usdc с base на arc",
    "envía 5 usdc de base a arc",
    "envie 5 usdc de base para arc",
    "envoie 5 usdc depuis base vers arc",
    "sende 5 usdc von base nach arc",
  ]
  const decisions = texts.map((t) => evaluateIntent(t, { sender: SENDER }))
  for (const d of decisions) {
    assert.equal(d.allow, true)
    assert.equal(d.amountAtomic, 5000000)
  }
  const routes = new Set(decisions.map((d) => d.parsed.from + ">" + d.parsed.to))
  assert.equal(routes.size, 1)
})

test("lang: an English sentence is never mangled by a foreign dictionary", () => {
  const { lang, text } = localizeIntent("Bridge 5 USDC from Base to Arc")
  assert.equal(lang, "en")
  assert.equal(text, "bridge 5 usdc from base to arc")
})

test("lang: mainnet is refused in Russian too", () => {
  const r = parseIntent("переведи 1 usdc с base на арк майннет")
  assert.equal(r.ok, false)
  assert.ok(r.reasons.includes("mainnet_not_supported"))
})

test("lang: the record states which language was used", () => {
  const text = "переведи 5 usdc с base на arc"
  const { record } = buildIntentPdr(text, evaluateIntent(text, { sender: SENDER }))
  assert.equal(record.input.lang, "ru")
  assert.ok(!JSON.stringify(record).includes("переведи"))
})

test("lang: the supported language list is explicit", () => {
  assert.deepEqual([...LANGUAGES], ["en", "ru", "es", "pt", "fr", "de"])
})

test("lang: Russian case endings on network names still resolve", () => {
  const cases = [
    ["переведи 3 usdc из базы в арк", "base", "arc"],
    ["переведи 3 usdc с арки в оптимизм", "arc", "optimism"],
    ["отправь 1 usdc из эфириума в арбитрум", "ethereum", "arbitrum"],
  ]
  for (const [text, from, to] of cases) {
    const r = parseIntent(text)
    assert.equal(r.ok, true, text)
    assert.equal(r.from, from, text)
    assert.equal(r.to, to, text)
  }
})

test("swap: the CRN pair parses and is marked tradeable", () => {
  const r = parseIntent("swap 1 usdc for crn")
  assert.equal(r.ok, true)
  assert.equal(r.fromToken, "usdc")
  assert.equal(r.toToken, "crn")
  assert.equal(r.pairTradeable, true)
})

test("swap: selling CRN resolves USDC as the destination", () => {
  const r = parseIntent("sell 50 crn")
  assert.equal(r.ok, true)
  assert.equal(r.fromToken, "crn")
  assert.equal(r.toToken, "usdc")
})

test("swap: USYC still parses but is never marked tradeable", () => {
  const r = parseIntent("swap 10 usdc for usyc")
  assert.equal(r.ok, true)
  assert.equal(r.pairTradeable, false)
})

test("swap: CRN is understood in Russian too", () => {
  const r = parseIntent("обменяй 2 usdc на crn")
  assert.equal(r.ok, true)
  assert.equal(r.toToken, "crn")
  assert.equal(r.pairTradeable, true)
})
