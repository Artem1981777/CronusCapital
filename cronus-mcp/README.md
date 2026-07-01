# cronus-mcp

MCP server exposing [Cronus Capital](https://cronus-capital.vercel.app) on-chain, x402-paid market signals (Arc / Circle Gateway) as agent tools.

## Install

    npx cronus-mcp@latest

## Client config

    {
      "mcpServers": {
        "cronus": {
          "command": "npx",
          "args": ["-y", "cronus-mcp@latest"]
        }
      }
    }

## Tools

- **cronus_consult** — FREE verdict (BUY/SKIP/HOLD/CACHE) + conviction + deterministic reasoning + content-addressed `traceHash` (re-verifiable at `/api/trace`).
- **cronus_signal** — premium signal, paid via x402 (0.02 USDC on Arc). Returns the 402 quote until paid.
- **cronus_nano_signal** — nano signal via Circle Gateway nanopayments (~0.001 USDC).

## Env

- `CRONUS_BASE_URL` — override the API base (defaults to the live deployment).

Thin client only: no business logic is duplicated: every tool proxies the live Cronus HTTP endpoints. MIT.
