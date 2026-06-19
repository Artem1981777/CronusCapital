// Cronus autonomous oracle: REAL OKX market data (price + 24h high/low/volume) -> REAL LLM decision + historical-analog recall (Groq / Llama 3.3).
export default async function handler(req, res) {
  const topic = (req.query && req.query.topic) || "BTC-USDC momentum";
  const instId = (req.query && req.query.instId) || "BTC-USDC";

  let price = null, prevPrice = null, changePct = null, high24h = null, low24h = null, vol24h = null;
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId));
    const j = await r.json();
    const t = j && j.data && j.data[0];
    if (t) {
      price = Number(t.last);
      prevPrice = Number(t.open24h);
      high24h = Number(t.high24h);
      low24h = Number(t.low24h);
      vol24h = Number(t.vol24h);
      if (prevPrice) changePct = ((price - prevPrice) / prevPrice) * 100;
    }
  } catch (e) { /* market data stays null */ }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(200).json({ ok:false, live:false, price, changePct, trace:["GROQ_API_KEY not configured"], verdict:"SKIP", conviction:0 });
  }

  const sys = "You are Cronus, an autonomous on-chain trading oracle on the Arc network. You get real live market data and must output a crisp quantitative reasoning trace, a historical-analog recall, and a trade verdict, like a sharp quant desk. Be numeric and decisive. Never hedge. Respond ONLY with strict minified JSON, no prose, no markdown.";
  const user = [
    "Topic: " + topic,
    "Instrument: " + instId,
    "Live price: " + (price == null ? "unknown" : price),
    "24h change %: " + (changePct == null ? "unknown" : changePct.toFixed(2)),
    "24h high: " + (high24h == null ? "unknown" : high24h),
    "24h low: " + (low24h == null ? "unknown" : low24h),
    "24h volume (base units): " + (vol24h == null ? "unknown" : vol24h),
    "",
    "Return a JSON object with keys trace, analog, verdict, conviction, decisions.",
    "trace: array of 7-9 lines, exactly one per stage in this order: SCOUT, DECOMPOSE, DISCOVER, DECIDE, SUFFICIENCY, ATTRIBUTE, EXECUTOR. Each line starts with the stage name + colon, cites a concrete number, and is terse and decisive.",
    "DATA HONESTY RULE: you may cite ONLY these provided facts (live price, 24h change %, 24h high, 24h low, 24h volume), values you derive from them (e.g. position within the 24h range, distance to high/low), and your own EV (0-1), conviction, and thresholds. You may propose plan levels (entry, stop, target) derived from the provided high/low. You must NOT invent any data you were not given: no RSI, no moving averages (MA/EMA), no Bollinger bands, no 7d/14d/50d or other multi-day averages, no support/resistance levels, and no volume figure other than the provided 24h volume. Fabricating data is prohibited.",
    "Forbidden filler words: indicating, seems, may, potential, can be made, high value.",
    "Style example: 'DECIDE: +0.42% 24h clears +0.20% trigger -> long bias, EV 0.62 vs 0.50 hurdle'.",
    "analog: object with keys regime, outcome, similarity. regime = short label of the closest historical market regime to the current move; outcome = what typically followed, terse; similarity = 0-1 heuristic closeness. This is heuristic recall, NOT a backtest.",
    "verdict: YES if conviction >= 65 and bias bullish; NO if conviction >= 65 and bias bearish; else SKIP.",
    "conviction: integer 0-100 from the size/direction of the move and position in the 24h range.",
    "decisions: array of 1-3 objects with keys src, ev (0-1), price (the live price), action (BUY/SELL/SKIP)."
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
    ok:true, live:true, price, changePct, high24h, low24h, vol24h,
    trace: Array.isArray(parsed.trace) ? parsed.trace : [],
    analog: (parsed.analog && typeof parsed.analog === "object") ? parsed.analog : null,
    verdict: parsed.verdict || "SKIP",
    conviction: parsed.conviction || 0,
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
  });
}
