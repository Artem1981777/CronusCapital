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
  // Declared because they are verified. Every path below is exercised by
      // npm run verify-live against production; a spec that lists more than the
      // checks cover is a brochure, and one that lists less hides working routes
      // from the agents this spec exists for.
      "/api/settlements": { get: { summary: "Gateway settlement resolver: payments mapped to on-chain settlements", parameters: [{ name: "windows", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 24 }, description: "10k-block log windows to scan (default 6)" }, { name: "fresh", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Bypass the 120s cache and re-scan the chain" }, { name: "transferId", in: "query", required: false, schema: { type: "string" }, description: "Look up one Circle Gateway transfer (needs facilitator credentials)" }], responses: { "200": { description: "Direct x402-exact settlements 1:1 on-chain, plus the batched Gateway footprint. Batched and unavailable mappings are labeled, never fabricated. May carry cache.stale with its real age when Arc is unreachable." } } } },
      "/api/treasury-yield": { get: { summary: "USYC treasury benchmark computed from on-chain NAV", parameters: [{ name: "days", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 365 }, description: "Projection horizon in days (default 30)" }, { name: "fresh", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Re-read Arc instead of serving the cached read" }], responses: { "200": { description: "Oracle and ERC-4626 teller NAV cross-checked, APY annualized from on-chain NAV points, corrupt oracle rounds listed rather than hidden, entitlement proven by canCall(). Idle-capital yield is counterfactual and never booked." }, "502": { description: "Arc unreadable and no stored read to fall back on: refused rather than answered with nulls." } } } },
      "/api/make-good": { get: { summary: "Make-good escrow: where a wrong stake's principal goes", responses: { "200": { description: "Positions read from the live stake ledger with the slash destination applied. If the ledger cannot be read, ok:false with reason ledger_unreachable or kv_not_configured - never zero positions." } } } },
      "/api/disclosure": { get: { summary: "Selective disclosure of a receipt (Merkle-committed)", responses: { "200": { description: "Reveals the agreed fields and a predicate over the rest, under one Merkle root; hidden fields stay hidden and a tampered leaf is rejected with 422." } } } },
      "/api/capabilities": { get: { summary: "What this service can do, and what it refuses", responses: { "200": { description: "Per-route kinds, aliases and the refusal reasons each route can return. Missing data produces a refusal, never a default value." } } } },
      "/api/council": { get: { summary: "Multi-model council decision with dissent recorded", responses: { "200": { description: "Per-member votes, agreement, and the correlation caveat stated in the answer itself." } } } },
      "/api/kelly": { get: { summary: "Kelly-criterion position sizing", responses: { "200": { description: "Fractional Kelly stake from an edge estimate, with the estimate's basis shown." } } } },
      "/api/thompson": { get: { summary: "Thompson sampling over live pricing", responses: { "200": { description: "Posterior draw per arm; the price actually shown is logged with the draw." } } } },
      "/api/passport": { get: { summary: "Agent passport (identity + reputation, on-chain)", responses: { "200": { description: "ERC-8004 identity resolved on Arc; unverifiable claims are labeled." } } } },
      "/api/rigor": { get: { summary: "Rigor gate: what this service will not claim", responses: { "200": { description: "The checks a claim must pass before it is published." } } } },
      "/api/pay-to-think": { get: { summary: "Rational spend: pay for compute only when it changes the decision", responses: { "200": { description: "Expected value of information versus its price; declines to think when it cannot pay for itself." } } } },
      "/api/vault-nav": { get: { summary: "Vault NAV read from chain", responses: { "200": { description: "Share price and total assets; synthetic yield accrual stays disabled." } } } },
      "/api/spend-intent": { get: { summary: "EIP-712 spend-intent schema and verification", responses: { "200": { description: "Typed-data domain and types; a garbage signature is rejected with the recovery failure stated." } } } },
      "/api/scorecard": { get: { summary: "Verifiability scorecard", responses: { "200": { description: "Which claims are on-chain-verifiable, which are computed, and which are neither." } } } },
      "/api/traction": { get: { summary: "External versus self-generated payers", responses: { "200": { description: "Payment counts split by whether the payer is ours; self-generated volume is not presented as demand." } } } },
      "/api/leaderboard": { get: { summary: "Signal leaderboard", responses: { "200": { description: "Settled predictions ranked by realized outcome, not by claimed accuracy." } } } },
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
    "post": {
      "summary": "Open a conviction stake (auth). POST only: a GET is answered 405 POST only, so no GET is advertised here",
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
