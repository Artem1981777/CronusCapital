// scripts/verify-retry.mjs — second attempt at the two contracts we could not verify.
// We only ever tried standard-input. The explorer also accepts flattened-code and multi-part,
// and the deployed bytecode carries a 0.8.36 marker that the explorer does offer. This script
// tries each method and reports what actually happened, including silence.
import { readFileSync } from "fs";

const BASE = "https://testnet.arcscan.app";
const COMPILER = "v0.8.36+commit.8a079791";
const TARGETS = [
  { label: "Agent guard v2", address: "0xeA4788164c63B0EF2788d9c74859B43f42BC391E", file: "contracts/CronusAgentGuardV2.sol", name: "CronusAgentGuardV2" },
  { label: "Multisig owner", address: "0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F", file: "contracts/CronusMultisig.sol", name: "CronusMultisig" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isVerified(address) {
  try {
    const r = await fetch(BASE + "/api/v2/addresses/" + address, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.is_verified === true;
  } catch {
    return null;
  }
}

async function submit(method, target, source) {
  const fd = new FormData();
  fd.append("compiler_version", COMPILER);
  fd.append("license_type", "mit");
  fd.append("is_optimization_enabled", "true");
  fd.append("optimization_runs", "200");
  fd.append("autodetect_constructor_args", "true");
  fd.append("evm_version", "default");
  if (method === "flattened-code") {
    fd.append("source_code", source);
    fd.append("contract_name", target.name);
  } else {
    fd.append("files[0]", new Blob([source], { type: "text/plain" }), target.name + ".sol");
  }
  const url = BASE + "/api/v2/smart-contracts/" + target.address + "/verification/via/" + method;
  const r = await fetch(url, { method: "POST", body: fd });
  let body = "";
  try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
  return r.status + " " + body;
}

for (const t of TARGETS) {
  console.log("");
  console.log("=== " + t.label + " " + t.address);
  const already = await isVerified(t.address);
  console.log("currently verified: " + already);
  if (already === true) continue;

  const source = readFileSync(t.file, "utf8");
  console.log("source: " + t.file + " (" + source.length + " chars)");
  if (/^\s*import\s/m.test(source)) console.log("note: this file has imports, so flattened-code may be rejected");

  for (const method of ["flattened-code", "multi-part"]) {
    console.log("-> " + method + ": " + (await submit(method, t, source)));
    await sleep(25000);
    const now = await isVerified(t.address);
    console.log("   after 25s, verified: " + now);
    if (now === true) break;
  }
}

console.log("");
for (const t of TARGETS) console.log(t.label + ": verified=" + (await isVerified(t.address)));
