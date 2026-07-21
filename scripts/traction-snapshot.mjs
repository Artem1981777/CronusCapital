// Generates docs/onchain-activity.md — live activity snapshot of the whole
// Cronus Capital system (treasury + all smart contracts) from ArcScan.
// Usage: node scripts/traction-snapshot.mjs   (no keys required)
import { writeFileSync } from "node:fs";

const BASE = "https://testnet.arcscan.app";
const PER_ADDRESS = 10;

const TARGETS = [
  ["Treasury (agent wallet)", "0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd"],
  ["Vault (ERC-4626-style)", "0x13B6984357e27dAB17DF44a6396042239e70542C"],
  ["Identity (ERC-8004)", "0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c"],
  ["Reputation (ERC-8004)", "0x2A19ad056EaE83364B0a6420685974cA219c209E"],
  ["Escrow (ERC-8183)", "0x64e55De4CbC3CDf981B2c970807129FA61806873"],
  ["Conviction Staking", "0x46213abeCa58Cc9a89A269fD25A8737C700Ca164"],
  ["Stake Escrow", "0xd6Cb6BfA4e922A30a244473ddb2fd3ABA39D5d4D"],
  ["Payout Signer (CCTP agent)", "0x6829860b7f61FA01E5bf3D194d9f780ACa5B6787"],
  ["Arc Memo", "0x5294E9927c3306DcBaDb03fe70b92e01cCede505"],
];

const short = (h) => h ? h.slice(0, 10) + "..." + h.slice(-6) : "?";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sections = [];
for (const [name, addr] of TARGETS) {
  const a = addr.toLowerCase();
  let items = [];
  try {
    const res = await fetch(`${BASE}/api/v2/addresses/${a}/transactions`);
    if (res.ok) items = ((await res.json()).items || []).slice(0, PER_ADDRESS);
    else console.error(`${name}: HTTP ${res.status}`);
  } catch (e) { console.error(`${name}: ${e.message}`); }

  const rows = items.map((t) => {
    const from = (t.from && t.from.hash || "").toLowerCase();
    const dir = from === a ? "OUT" : "IN";
    const method = t.method || (t.tx_types || []).join(", ") || "transfer";
    const when = (t.timestamp || "").replace("T", " ").slice(0, 16);
    const val = t.value ? (Number(t.value) / 1e18).toFixed(6) : "0";
    const status = t.status === "ok" ? "success" : (t.status || "?");
    return `| ${when} | [${short(t.hash)}](${BASE}/tx/${t.hash}) | ${method} | ${dir} | ${val} | ${status} |`;
  });

  sections.push([
    `## ${name}`,
    "",
    `Address: [\`${addr}\`](${BASE}/address/${addr})`,
    "",
    rows.length
      ? ["| When (UTC) | Tx | Method | Dir | Value (native) | Status |", "|---|---|---|---|---|---|", ...rows].join("\n")
      : "_No transactions returned (API busy — rerun the script)._",
    "",
  ].join("\n"));

  console.log(`${name}: ${rows.length} txs`);
  await sleep(1200);
}

const md = [
  "# On-chain activity — full system snapshot (auto-generated)",
  "",
  "Latest transactions of the Cronus Capital treasury and every deployed contract on Arc Testnet.",
  "",
  `Generated: ${new Date().toISOString()} — regenerate anytime with \`node scripts/traction-snapshot.mjs\` (public API only, zero private keys).`,
  "",
  ...sections,
].join("\n");

writeFileSync("docs/onchain-activity.md", md);
console.log("Wrote docs/onchain-activity.md");
