#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.CRONUS_BASE_URL || "https://cronus-capital.vercel.app").replace(/\/+$/, "");

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
];

const ROUTES = {
  cronus_consult: "/api/consult",
  cronus_signal: "/api/signal",
  cronus_nano_signal: "/api/nano-signal",
};

const server = new Server(
  { name: "cronus-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const route = ROUTES[name];
  if (!route) {
    return { isError: true, content: [{ type: "text", text: "Unknown tool: " + String(name) }] };
  }
  const args = req.params.arguments || {};
  const instId = typeof args.instId === "string" && args.instId ? args.instId : "ETH-USDC";
  const path = route + "?instId=" + encodeURIComponent(instId);
  const r = await apiGet(path);
  const payload = {
    endpoint: path,
    httpStatus: r.status,
    paymentRequired: r.status === 402,
    result: r.body,
  };
  if (r.status === 402) {
    payload.note = "Payment required (x402). Pay the quoted USDC amount on Arc, then retry with a paid x402 client to receive the signal.";
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: r.status >= 500,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
