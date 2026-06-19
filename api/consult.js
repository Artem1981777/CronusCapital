// Cronus autonomous oracle: REAL live price (OKX) -> REAL LLM decision + historical-analog recall (Groq / Llama 3.3, free tier).
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

  const sys = "You are Cronus, an autonomous on-chain trading oracle on the Arc network. You get a live market price and must output a crisp quantitative reasoning trace, a historical-analog recall, and a trade verdict, like a sharp quant desk. Be numeric and decisive. Never hedge with vague filler. Respond ONLY with strict minified JSON, no prose, no markdown.";
  const user = [
    "Topic: " + topic,
    "Instrument: " + instId,
    "Live price: " + (price == null ? "unknown" : price),
    "24h change %: " + (changePct == null ? "unknown" : changePct.toFixed(2)),
    "",
    "Return a JSON object with keys trace, analog, verdict, conviction, decisions.",
    "trace: array of 7-9 lines, exactly one per stage in this order: SCOUT, DECOMPOSE, DISCOVER, DECIDE, SUFFICIENCY, ATTRIBUTE, EXECUTOR.",
    "Each line MUST start with the stage name + colon, cite at least one concrete number (live price, 24h change %, an EV 0-1, or a probability threshold), and be terse and decisive.",
    "Forbidden words: indicating, seems, may, potential, can be made, high value. Use trader language instead.",
    "Style example: 'DECIDE: 24h +0.94% clears +0.50% trigger -> long bias, EV 0.62 vs 0.50 hurdle'.",
    "analog: object with keys regime, outcome, similarity. regime = short label of the closest historical market regime to the current 24h move; outcome = what typically followed that regime, terse and numeric if possible; similarity = number 0-1 (heuristic closeness). This is heuristic recall, NOT a backtest.",
    "verdict: YES if conviction >= 65 and bias bullish; NO if conviction >= 65 and bias bearish; else SKIP.",
    "conviction: integer 0-100 derived from the size/direction of the 24h move and price structure.",
    "decisions: array of 1-3 objects with keys src, ev (number 0-1), price (the live price), action (BUY, SELL, or SKIP)."
  ].join("\n");

  let data = null;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        temperature: 0.5,
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
    analog: (parsed.analog && typeof parsed.analog === "object") ? parsed.analog : null,
    verdict: parsed.verdict || "SKIP",
    conviction: parsed.conviction || 0,
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
  });
}
