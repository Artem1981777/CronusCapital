#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.CRONUS_BASE_URL || "https://cronus-capital.vercel.app").replace(/\/+$/, "");
const PAY_TO = process.env.CRONUS_PAYTO || "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd";
const NETWORK = process.env.X402_NETWORK || "arc-testnet";

async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body };
}

const TOOLS = [
  {
    name: "cronus_consult",
    description: "FREE Cronus Capital market verdict for a trading pair on Arc. Returns verdict (BUY/SKIP/HOLD/CACHE), conviction, deterministic reasoning, a price cross-check, and a content-addressed traceHash that is independently re-verifiable at /api/trace. No payment required.",
    inputSchema: {
      type: "object",
      properties: {
        instId: { type: "string", description: "Instrument id, e.g. ETH-USDC or BTC-USDC. Defaults to ETH-USDC." },
      },
    },
  },
  {
    name: "cronus_signal",
    description: "Cronus premium trading signal, paid via x402 (0.02 USDC on Arc). Without payment this returns the HTTP 402 payment quote (x402 accepts + discovery) so an agent wallet can settle and retry with a paid x402 client.",
    inputSchema: {
      type: "object",
      properties: {
        instId: { type: "string", description: "Instrument id, e.g. ETH-USDC. Defaults to ETH-USDC." },
      },
    },
  },
  {
    name: "cronus_nano_signal",
    description: "Cronus nano signal, paid via Circle Gateway nanopayments (~0.001 USDC). Without payment returns the HTTP 402 quote. Pay-per-call micropayment channel for autonomous agents.",
    inputSchema: {
      type: "object",
      properties: {
        instId: { type: "string", description: "Instrument id. Defaults to ETH-USDC." },
      },
    },
  },
  {
    name: "cronus_pay",
    description: "Get exact on-chain payment instructions to buy a Cronus premium signal with USDC on Arc (x402 / Circle Gateway). Returns the live HTTP 402 payment quote, the pay-to address, amount, and network so a wallet or agent can settle and then retry cronus_signal. This tool never moves funds and never fabricates payers: a payment is counted as a verified external payer only after it is confirmed on-chain (see /api/receipts). Self-generated test traffic is always labeled separately and never counted as external demand.",
    inputSchema: {
      type: "object",
      properties: {
        instId: { type: "string", description: "Instrument id, e.g. ETH-USDC. Defaults to ETH-USDC." },
      },
    },
  },
];

async function callTool(name, instId) {
  if (name === "cronus_pay" || name === "pay") {
    const path = "/api/signal?instId=" + encodeURIComponent(instId);
    const r = await apiGet(path);
    return {
      endpoint: path,
      httpStatus: r.status,
      payment_required: r.status === 402,
      pay_to: PAY_TO,
      network: NETWORK,
      asset: "USDC",
      quote: r.body,
      how_to_pay: [
        "1. Settle the quoted USDC amount on Arc to pay_to using an x402-capable wallet or client.",
        "2. Retry cronus_signal with the paid x402 client to receive the premium signal.",
        "3. Your settlement is recorded on-chain and surfaced publicly at /api/receipts.",
      ],
      honest_note: "Cronus never fabricates demand. This tool does not move funds. A payment counts as a verified external payer only after on-chain confirmation; self-generated test traffic stays labeled separately and is never counted as external demand.",
      _isError: r.status >= 500,
    };
  }
  const map = {
    cronus_consult: "/api/consult",
    cronus_signal: "/api/signal",
    cronus_nano_signal: "/api/nano-signal",
    consult: "/api/consult",
    signal: "/api/signal",
    "nano-signal": "/api/nano-signal",
  };
  const route = map[name];
  if (!route) return { _unknown: true, error: "Unknown tool: " + String(name) };
  const path = route + "?instId=" + encodeURIComponent(instId);
  const r = await apiGet(path);
  const payload = {
    endpoint: path,
    httpStatus: r.status,
    paymentRequired: r.status === 402,
    result: r.body,
    _isError: r.status >= 500,
  };
  if (r.status === 402) {
    payload.note = "Payment required (x402). Pay the quoted USDC amount on Arc, then retry with a paid x402 client to receive the signal.";
  }
  return payload;
}

const argv = process.argv.slice(2);
const CLI = { consult: 1, signal: 1, "nano-signal": 1, pay: 1 };
if (argv[0] && (CLI[argv[0]] || argv[0] === "-h" || argv[0] === "--help")) {
  const cmd = argv[0];
  if (cmd === "-h" || cmd === "--help") {
    console.log("cronus-mcp - MCP server + CLI for Cronus Capital x402 signals on Arc");
    console.log("");
    console.log("Usage:");
    console.log("  cronus-mcp                      start the MCP stdio server (for MCP clients)");
    console.log("  cronus-mcp consult [INSTID]     free market verdict");
    console.log("  cronus-mcp signal [INSTID]      premium signal (402 quote if unpaid)");
    console.log("  cronus-mcp nano-signal [INSTID] nano signal (Gateway 402 quote if unpaid)");
    console.log("  cronus-mcp pay [INSTID]         on-chain USDC payment instructions");
    console.log("");
    console.log("Env: CRONUS_BASE_URL (default https://cronus-capital.vercel.app)");
    process.exit(0);
  }
  const inst = argv[1] && argv[1].charAt(0) !== "-" ? argv[1] : "ETH-USDC";
  const out = await callTool(cmd, inst);
  const err = out._isError === true;
  delete out._isError;
  delete out._unknown;
  console.log(JSON.stringify(out, null, 2));
  process.exit(err ? 1 : 0);
}

const server = new Server(
  { name: "cronus-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};
  const instId = typeof args.instId === "string" && args.instId ? args.instId : "ETH-USDC";
  const out = await callTool(name, instId);
  if (out._unknown) {
    return { isError: true, content: [{ type: "text", text: out.error }] };
  }
  const isError = out._isError === true;
  delete out._isError;
  delete out._unknown;
  return {
    content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
    isError,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
