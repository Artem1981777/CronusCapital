// Cronus autonomous oracle: REAL live price (OKX) -> REAL LLM decision (Groq / Llama 3.3, free tier).
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

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(200).json({ ok:false, live:false, price, changePct, trace:["GROQ_API_KEY not configured"], verdict:"SKIP", conviction:0 });
  }

  const sys = "You are Cronus, an autonomous on-chain oracle agent on Arc. Given a live market price, reason step by step and issue a verdict. Respond ONLY with strict JSON, no prose.";
  const user = [
    "Topic: " + topic,
    "Instrument: " + instId,
    "Live price: " + (price == null ? "unknown" : price),
    "24h change %: " + (changePct == null ? "unknown" : changePct.toFixed(2)),
    "",
    "Return a JSON object with keys:",
    "trace: array of 6-9 short reasoning lines across stages SCOUT, DECOMPOSE, DISCOVER, DECIDE, SUFFICIENCY, ATTRIBUTE, EXECUTOR; each line must cite a concrete number from above.",
    "verdict: one of YES, NO, SKIP.",
    "conviction: integer 0-100.",
    "decisions: array of objects with keys src, ev, price, action where action is BUY or SKIP or REUSE."
  ].join("\n");

  let data = null;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }]
      })
    });
    data = await resp.json();
  } catch (e) {
    return res.status(200).json({ ok:false, live:true, price, changePct, trace:["LLM fetch threw"], verdict:"SKIP", conviction:0, debug: String(e) });
  }

  let text = "";
  if (data && data.choices && data.choices[0] && data.choices[0].message) {
    text = data.choices[0].message.content || "";
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
