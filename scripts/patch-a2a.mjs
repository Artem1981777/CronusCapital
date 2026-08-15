import fs from "node:fs"

const files = {}
const status = []
const load = (p) => (p in files ? files[p] : (files[p] = fs.readFileSync(p, "utf8")))
const set = (p, v) => { files[p] = v }
const ok = (n) => status.push(["ok  ", n])
const skip = (n) => status.push(["skip", n])
const fail = (n) => status.push(["FAIL", n])

// ---------- api/nano-signal.js ----------
{
  const P = "api/nano-signal.js"
  let s = load(P)
  const HELPER = `function clientTag(req) {
  try {
    const q = req && req.query ? req.query.client : null
    const h = (req && req.headers) ? req.headers : {}
    const raw = String(q || h["x-a2a-client"] || h["x-mcp-client"] || h["user-agent"] || "").replace(/[\\x00-\\x1f]/g, " ").trim()
    return raw ? raw.slice(0, 80) : null
  } catch (_) { return null }
}
`
  if (/function clientTag/.test(s)) skip("nano: clientTag helper")
  else if (/export default async function handler\s*\(/.test(s)) {
    s = s.replace(/export default async function handler\s*\(/, HELPER + "\nexport default async function handler(")
    ok("nano: clientTag helper")
  } else fail("nano: clientTag helper (handler anchor missing)")

  if (/const client = clientTag\(req\)/.test(s)) skip("nano: const client")
  else if (/const host\s*=\s*\(req\.headers && req\.headers\.host\)\s*\|\|\s*"localhost"/.test(s)) {
    s = s.replace(/(const host\s*=\s*\(req\.headers && req\.headers\.host\)\s*\|\|\s*"localhost")/, '$1\n  const client = clientTag(req)')
    ok("nano: const client")
  } else fail("nano: const client (host anchor missing)")

  const before = (s.match(/recordTraction\(\{\s*tier:/g) || []).length
  if (before === 0) skip("nano: recordTraction client (already/none)")
  else { s = s.replace(/recordTraction\(\{\s*tier:/g, "recordTraction({ client, tier:"); ok("nano: recordTraction client x" + before) }

  set(P, s)
}

// ---------- lib/traction.js ----------
{
  const P = "lib/traction.js"
  let s = load(P)
  const RC = `export function reduceClients(ledger, { limit = 12 } = {}) {
  const map = new Map()
  for (const e of ledger) {
    const c = e && e.client ? String(e.client).slice(0, 80) : null
    if (!c) continue
    const key = c.toLowerCase()
    const cur = map.get(key) || { client: c, calls: 0, lastTs: 0, tiers: new Set() }
    cur.calls++
    if (e.ts && e.ts > cur.lastTs) cur.lastTs = e.ts
    if (e.tier) cur.tiers.add(e.tier)
    map.set(key, cur)
  }
  const demoRe = /cronus|a2a-demo|buyer-agent|rhea|self/i
  return [...map.values()]
    .map((x) => ({ client: x.client, calls: x.calls, lastTs: x.lastTs || null, tiers: [...x.tiers], kind: demoRe.test(x.client) ? "self-demo" : "external-client" }))
    .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0) || b.calls - a.calls)
    .slice(0, limit)
}

`
  if (/export function reduceClients/.test(s)) skip("traction: reduceClients")
  else if (/export function verifiedExternalList\(\)/.test(s)) {
    s = s.replace(/export function verifiedExternalList\(\)/, RC + "export function verifiedExternalList()")
    ok("traction: reduceClients")
  } else fail("traction: reduceClients (anchor missing)")
  set(P, s)
}

// ---------- lib/leaderboard.js ----------
{
  const P = "lib/leaderboard.js"
  let s = load(P)
  if (/import \{[^}]*reduceClients[^}]*\} from "\.\/traction\.js"/.test(s)) skip("leaderboard: import reduceClients")
  else if (/import \{ leaderboard,/.test(s)) { s = s.replace(/import \{ leaderboard,/, "import { leaderboard, reduceClients,"); ok("leaderboard: import reduceClients") }
  else fail("leaderboard: import reduceClients (anchor missing)")

  if (/recent_clients:/.test(s)) skip("leaderboard: recent_clients field")
  else if (/self_demo_calls: selfDemo,/.test(s)) { s = s.replace(/self_demo_calls: selfDemo,/, "self_demo_calls: selfDemo,\n\t\t\t\trecent_clients: reduceClients(ledger, { limit }),"); ok("leaderboard: recent_clients field") }
  else fail("leaderboard: recent_clients field (anchor missing)")
  set(P, s)
}

// ---------- scripts/buyer-agent.mjs ----------
{
  const P = "scripts/buyer-agent.mjs"
  let s = load(P)
  if (s.includes('(a2a-demo)"')) skip("buyer-agent: client tag (consume)")
  else if (/const url = resource \+ "\?topic=" \+ encodeURIComponent\(TOPIC\)/.test(s)) {
    s = s.replace(/const url = resource \+ "\?topic=" \+ encodeURIComponent\(TOPIC\)/, 'const url = resource + "?topic=" + encodeURIComponent(TOPIC) + "&client=" + encodeURIComponent("cronus-buyer-agent/0.2 (a2a-demo)")')
    ok("buyer-agent: client tag (consume)")
  } else fail("buyer-agent: client tag (consume) (anchor missing)")

  if (s.includes('(a2a-demo,stream)"')) skip("buyer-agent: client tag (stream)")
  else if (/const sUrl = resource \+ "\?topic=" \+ encodeURIComponent\(TOPIC\) \+ "&stream=" \+ i/.test(s)) {
    s = s.replace(/const sUrl = resource \+ "\?topic=" \+ encodeURIComponent\(TOPIC\) \+ "&stream=" \+ i/, 'const sUrl = resource + "?topic=" + encodeURIComponent(TOPIC) + "&stream=" + i + "&client=" + encodeURIComponent("cronus-buyer-agent/0.2 (a2a-demo,stream)")')
    ok("buyer-agent: client tag (stream)")
  } else skip("buyer-agent: client tag (stream) (optional, anchor not found)")
  set(P, s)
}

// ---------- src/dashboardV2.ts ----------
{
  const P = "src/dashboardV2.ts"
  let s = load(P)
  if (/id: "a2a"/.test(s)) skip("nav: a2a item")
  else if (/\{ id: "leaderboard", label: "Leaderboard", glyph: "★" \},/.test(s)) {
    s = s.replace(/(\{ id: "leaderboard", label: "Leaderboard", glyph: "★" \},)/, '$1\n\t\t{ id: "a2a", label: "A2A / MCP", glyph: "🔌" },')
    ok("nav: a2a item")
  } else fail("nav: a2a item (leaderboard anchor missing)")
  set(P, s)
}

// ---------- src/App.tsx ----------
{
  const P = "src/App.tsx"
  let s = load(P)
  if (/A2APanel/.test(s)) skip("App: import A2APanel")
  else {
    const importRe = /import\s+(?:\{\s*)?LeaderboardPanel(?:\s*\})?\s+from\s+["'][^"']+["']/
    const im = s.match(importRe)
    if (!im) fail("App: import A2APanel (LeaderboardPanel import not found)")
    else { s = s.replace(importRe, im[0] + '\nimport A2APanel from "./components/A2APanel"'); ok("App: import A2APanel") }
  }
  if (/id="a2a"/.test(s)) skip("App: <Sec a2a>")
  else {
    const secRe = /<Sec\s+id="leaderboard"[\s\S]*?<\/Sec>/
    const mm = s.match(secRe)
    if (!mm) fail("App: <Sec a2a> (Sec leaderboard block not found)")
    else if (!/LeaderboardPanel/.test(mm[0])) fail("App: <Sec a2a> (LeaderboardPanel not inside Sec block - manual wiring needed)")
    else {
      const clone = mm[0].replace(/id="leaderboard"/, 'id="a2a"').replace(/LeaderboardPanel/g, "A2APanel")
      s = s.replace(secRe, mm[0] + "\n" + clone)
      ok("App: <Sec a2a>")
    }
  }
  set(P, s)
}

const failed = status.filter((x) => x[0] === "FAIL")
console.log("\n=== patch-a2a report ===")
for (const [st, n] of status) console.log(st + "  " + n)
if (failed.length) {
  console.log("\nABORTED: " + failed.length + " failure(s). NO files written. Paste this report.")
  process.exit(1)
}
for (const p of Object.keys(files)) fs.writeFileSync(p, files[p])
console.log("\nALL OK: wrote " + Object.keys(files).length + " files. Building...")
