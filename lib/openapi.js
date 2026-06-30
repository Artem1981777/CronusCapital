// api/openapi.js — OpenAPI 3.0 spec (a.k.a. swagger.json) for the Cronus x402 paywall.
const NETWORK = process.env.X402_NETWORK || "arc-testnet"
const PRICE   = process.env.SIGNAL_PRICE || "20000"

export default function handler(req, res) {
  const host = (req.headers && req.headers.host) || "localhost"
  const origin = "https://" + host
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Cache-Control", "public, max-age=300")
  res.status(200).json({
    openapi: "3.0.3",
    info: {
      title: "Cronus Capital x402 API",
      version: "1.0.0",
      description: "Pay-per-call market intelligence over the x402 protocol (USDC on Arc). Point your AI agent at this spec to discover and pay for a verifiable +EV signal.",
    },
    servers: [{ url: origin }],
    paths: {
  "/api/manifest": {
    "get": {
      "summary": "Machine-readable x402 service manifest + capabilities",
      "responses": {
        "200": {
          "description": "Identity, settlement, workflow capabilities, services."
        }
      }
    }
  },
  "/api/track-record": {
    "get": {
      "summary": "Skin-in-the-game track record (staked predictions settled on-chain)",
      "responses": {
        "200": {
          "description": "Open/resolved positions, at-risk USDC, accuracy."
        }
      }
    }
  },
  "/api/open-stake": {
    "get": {
      "summary": "Conviction stake diagnostics",
      "responses": {
        "200": {
          "description": "Signer/treasury diagnostics."
        }
      }
    },
    "post": {
      "summary": "Open a conviction stake (auth)",
      "responses": {
        "200": {
          "description": "Stake opened: id, commitment, openTx."
        },
        "401": {
          "description": "Unauthorized."
        }
      }
    }
  },
  "/api/resolve-stake": {
    "get": {
      "summary": "Resolve dry-run (no funds)",
      "responses": {
        "200": {
          "description": "Due positions preview + escrow status."
        }
      }
    },
    "post": {
      "summary": "Settle due positions from escrow (auth)",
      "responses": {
        "200": {
          "description": "Correct returns principal, wrong burns."
        },
        "401": {
          "description": "Unauthorized."
        }
      }
    }
  },
  "/api/fund-escrow": {
    "get": {
      "summary": "Escrow funding preview",
      "responses": {
        "200": {
          "description": "Funder and escrow balances."
        }
      }
    },
    "post": {
      "summary": "Fund settlement escrow (auth)",
      "responses": {
        "200": {
          "description": "fundTx and new escrow balance."
        },
        "401": {
          "description": "Unauthorized."
        }
      }
    }
  },
  "/api/spend-limit": {
    "get": {
      "summary": "Spending policy and spend so far today",
      "responses": {
        "200": {
          "description": "Daily and per-recipient caps, remaining, recent payouts."
        }
      }
    },
    "post": {
      "summary": "check (no auth), set-policy, spend (auth)",
      "responses": {
        "200": {
          "description": "Dry decision or executed payout."
        },
        "401": {
          "description": "Unauthorized."
        },
        "409": {
          "description": "Blocked by policy."
        }
      }
    }
  },
  "/api/split-pay": {
    "get": {
      "summary": "Split config and recent runs",
      "responses": {
        "200": {
          "description": "Recipients and bps weights."
        }
      }
    },
    "post": {
      "summary": "preview (no auth), set-split, execute (auth)",
      "responses": {
        "200": {
          "description": "Allocation preview or executed legs."
        },
        "401": {
          "description": "Unauthorized."
        }
      }
    }
  },
  "/api/subscription": {
    "get": {
      "summary": "Plans and optional subscriber status",
      "responses": {
        "200": {
          "description": "Plans with price, period, call quota."
        }
      }
    },
    "post": {
      "summary": "status (no auth), subscribe, access (auth)",
      "responses": {
        "200": {
          "description": "Status, activation, or metered access."
        },
        "401": {
          "description": "Unauthorized."
        }
      }
    }
  },
      "/api/receipts": { get: { summary: "Public on-chain x402 payment receipts (JSON or CSV)", parameters: [{ name: "format", in: "query", required: false, schema: { type: "string", enum: ["csv"] }, description: "Set to csv to download a CSV export" }], responses: { "200": { description: "Settled x402 payments with txHash, payer, amount, block, commitment, memoId." } } } },
      "/api/metrics": { get: { summary: "Live x402 traction metrics", responses: { "200": { description: "On-chain payment count and total USDC settled." } } } },
      "/api/signal": {
        get: {
          summary: "Buy a verifiable +EV market signal",
          description: "First request without payment returns HTTP 402 with x402 payment requirements. Pay " + PRICE + " atomic USDC on " + NETWORK + " to payTo, then retry with the X-PAYMENT header set to your txHash.",
          parameters: [
            { name: "topic", in: "query", required: false, schema: { type: "string" }, example: "BTC-USDC momentum" },
            { name: "X-PAYMENT", in: "header", required: false, schema: { type: "string" }, description: "Arc txHash (0x + 64 hex) of the USDC payment to payTo" },
          ],
          responses: {
            "402": {
              description: "Payment required (x402).",
              content: { "application/json": { schema: { type: "object", properties: {
                x402Version: { type: "integer" },
                accepts: { type: "array", items: { type: "object", properties: {
                  scheme: { type: "string" }, network: { type: "string" }, maxAmountRequired: { type: "string" },
                  resource: { type: "string" }, payTo: { type: "string" }, asset: { type: "string" },
                } } },
                error: { type: "string" },
              } } } },
            },
            "200": {
              description: "Payment verified on-chain - signal returned.",
              content: { "application/json": { schema: { type: "object", properties: {
                paid: { type: "boolean" },
                payment: { type: "object", properties: { network: { type: "string" }, txHash: { type: "string" }, payer: { type: "string" }, amount: { type: "string" }, explorer: { type: "string" } } },
                commitment: { type: "string", description: "keccak256 commitment of the report" },
                report: { type: "object" },
              } } } },
            },
          },
        },
      },
    },
  })
}
