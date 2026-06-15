const PRIMARY = process.env.VITE_RPC_URL || process.env.VITE_ARC_RPC_URL || "https://rpc.testnet.arc.network";
const FALLBACK = "https://rpc.testnet.arc.network";

async function tryRpc(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  return { ok: r.ok, status: r.status, text: text, json: json };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  try {
    let out = await tryRpc(PRIMARY, body);
    if ((!out.json || out.json.error) && PRIMARY !== FALLBACK) {
      const fb = await tryRpc(FALLBACK, body);
      if (fb.json && !fb.json.error) out = fb;
    }
    if (out.json) return res.status(200).json(out.json);
    return res.status(502).json({ error: "upstream non-JSON", status: out.status, body: String(out.text).slice(0, 160) });
  } catch (error) {
    try {
      const fb = await tryRpc(FALLBACK, body);
      if (fb.json) return res.status(200).json(fb.json);
    } catch (e2) {}
    return res.status(500).json({ error: String((error && error.message) || error) });
  }
}
