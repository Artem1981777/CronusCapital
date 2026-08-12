// scripts/verify-canary.mjs — a throwaway copy of the guard, built with the npm compiler,
// deployed only to answer one question: can this explorer verify a 0.8.35 build of this exact
// source? The copy holds no roles, owns nothing and is wired to nobody.
// Pass 1: node scripts/verify-canary.mjs            -> compile only, print the constructor
// Pass 2: node scripts/verify-canary.mjs --deploy '["0x...","0x..."]'
import { readFileSync } from "fs";
import os from "os";
import path from "path";
import solc from "solc";
import { ethers } from "ethers";

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
const BASE = "https://testnet.arcscan.app";
const file = "CronusAgentGuardV2.sol";
const NAME = "CronusAgentGuardV2";
const content = readFileSync("contracts/" + file, "utf8");

const settings = {
  optimizer: { enabled: true, runs: 200 },
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
};
const input = { language: "Solidity", sources: { [file]: { content } }, settings };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors || []).filter((e) => e.severity === "error");
if (errs.length) {
  console.error("COMPILE ERRORS:\n" + errs.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const C = out.contracts[file][NAME];
const abi = C.abi;
const bytecode = "0x" + C.evm.bytecode.object;
console.log("compiler: " + solc.version());
console.log("compiled OK: bytecode " + ((bytecode.length - 2) / 2) + " bytes");

const ctor = abi.find((f) => f.type === "constructor");
const types = ctor ? ctor.inputs.map((i) => i.type + " " + i.name) : [];
console.log("constructor(" + types.join(", ") + ")");

const idx = process.argv.indexOf("--deploy");
if (idx === -1) {
  console.log("");
  console.log("no deploy requested. Re-run with --deploy followed by a JSON array of constructor args.");
  process.exit(0);
}
const args = JSON.parse(process.argv[idx + 1] || "[]");
if (ctor && args.length !== ctor.inputs.length) {
  console.error("constructor needs " + ctor.inputs.length + " args, got " + args.length);
  process.exit(1);
}

const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.+)$", "m"));
  if (!m) throw new Error("missing " + k);
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k);
const env = readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8");
const provider = new ethers.JsonRpcProvider(RPC, 5042002);
const wallet = new ethers.Wallet(norm(pick(env, "BUYER_PRIVATE_KEY")), provider);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const c = await factory.deploy(...args);
const tx = c.deploymentTransaction();
console.log("deploy tx: " + tx.hash);
const rc = await provider.waitForTransaction(tx.hash);
const address = await c.getAddress();
console.log("canary at: " + address + "  block " + rc.blockNumber + "  status " + rc.status);
if (rc.status !== 1) process.exit(1);

const std = { language: "Solidity", sources: { [file]: { content } }, settings };
const fd = new FormData();
fd.append("compiler_version", "v0.8.35+commit.47b9dedd");
fd.append("license_type", "mit");
fd.append("autodetect_constructor_args", "true");
fd.append("files[0]", new Blob([JSON.stringify(std)], { type: "application/json" }), "standard-input.json");
const r = await fetch(BASE + "/api/v2/smart-contracts/" + address + "/verification/via/standard-input", { method: "POST", body: fd });
console.log("submitted: " + r.status + " " + (await r.text()).slice(0, 160));

for (const wait of [20000, 25000, 30000]) {
  await new Promise((s) => setTimeout(s, wait));
  const j = await fetch(BASE + "/api/v2/addresses/" + address, { headers: { accept: "application/json" } }).then((x) => x.json()).catch(() => ({}));
  console.log("verified: " + j.is_verified);
  if (j.is_verified === true) break;
}
console.log("");
console.log("canary address: " + address);
console.log(BASE + "/address/" + address);
