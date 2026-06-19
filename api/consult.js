// Cronus autonomous oracle: REAL live price -> REAL LLM decision (with error surfacing).
export default async function handler(req, res) {
  const topic = (req.query && req.query.topic) || "BTC-USDC momentum";
  const instId = (req.query && req.query.instId) || "BTC-USDC";

  let price = null, prevPrice = null, changePct = null;
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId));
    const j = await r.json();
    const t = j && j.data && j.data[0];
    if (t) {
      price = Number(t.last);
      prevPrice = Number(t.open24h);
      if (prevPrice) changePct = ((price - prevPrice) / prevPrice) * 100;
    }
  } catch (e) { /* price stays null */ }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(200).json({ ok:false, live:false, price, changePct, trace:["LLM key not configured"], verdict:"SKIP", conviction:0 });
  }

  const sys = "You are Cronus, an autonomous on-chain oracle agent on Arc. Given a live market price, reason step by step and issue a verdict. Respond ONLY with strict minified JSON, no prose.";
  const user = [
    "Topic: " + topic,
    "Instrument: " + instId,
    "Live price: " + (price == null ? "unknown" : price),
    "24h change %: " + (changePct == null ? "unknown" : changePct.toFixed(2)),
    "",
    "Return JSON with keys:",
    "trace: array of 6-9 short reasoning lines across stages SCOUT, DECOMPOSE, DISCOVER, DECIDE, SUFFICIENCY, ATTRIBUTE, EXECUTOR; each line must cite a concrete number from above.",
    "verdict: one of YES, NO, SKIP.",
    "conviction: integer 0-100.",
    "decisions: array of objects with keys src, ev, price, action where action is BUY or SKIP or REUSE."
  ].join("\n");

  let data = null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 700,
        system: sys,
        messages: [{ role: "user", content: user }]
      })
    });
    data = await resp.json();
  } catch (e) {
    return res.status(200).json({ ok:false, live:true, price, changePct, trace:["LLM fetch threw"], verdict:"SKIP", conviction:0, debug: String(e) });
  }

  let text = "";
  if (data && Array.isArray(data.content)) {
    for (const c of data.content) { if (c.type === "text") text += c.text; }
  }
  if (!text) {
    return res.status(200).json({ ok:false, live:true, price, changePct, trace:["LLM returned no text"], verdict:"SKIP", conviction:0, debug: JSON.stringify(data).slice(0, 700) });
  }

  let parsed = null;
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1));
  } catch (err) { parsed = null; }

  if (!parsed) {
    return res.status(200).json({ ok:true, live:true, price, changePct, trace:["ANALYST raw: " + text.slice(0, 400)], verdict:"SKIP", conviction:0 });
  }
  return res.status(200).json({
    ok:true, live:true, price, changePct,
    trace: Array.isArray(parsed.trace) ? parsed.trace : [],
    verdict: parsed.verdict || "SKIP",
    conviction: parsed.conviction || 0,
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
  });
}
