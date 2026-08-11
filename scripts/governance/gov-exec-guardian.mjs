import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, Interface } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const CHAIN = 5042002;

const op = JSON.parse(readFileSync("governance-op.json", "utf8"));
console.log("op:", op.op, "->", op.newGuardian);

const envText = readFileSync(process.env.HOME + "/.cronus-cold.env", "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const pickKey = (name) => {
  if (!env[name]) {
    console.log("available names:", Object.keys(env).join(", "));
    throw new Error("missing " + name);
  }
  return env[name];
};

const provider = new JsonRpcProvider(RPC, CHAIN);
const signerA = new Wallet(pickKey("COSIGNER2_PRIVATE_KEY"), provider);
const signerB = new Wallet(pickKey("COSIGNER3_PRIVATE_KEY"), provider);

const guard = new Interface([
  "function execute(bytes data, bytes32 salt) returns (bytes)",
  "function guardian() view returns (address)",
  "function operator() view returns (address)",
  "function opEta(bytes32) view returns (uint256)",
]);
const ms = new Interface([
  "function submit(address to, uint256 value, bytes data) returns (uint256)",
  "function confirm(uint256 id)",
  "function execute(uint256 id)",
  "function txCount() view returns (uint256)",
  "function isOwner(address a) view returns (bool)",
]);
const rd = async (to, iface, fn, args) =>
  iface.decodeFunctionResult(fn, await provider.call({ to, data: iface.encodeFunctionData(fn, args || []) }))[0];

const eta = BigInt(await rd(op.guard, guard, "opEta", [op.id]));
if (eta === 0n) throw new Error("op not queued, or already executed");
const now = BigInt(Math.floor(Date.now() / 1000));
if (now < eta) throw new Error("timelock not expired, seconds left " + (eta - now));
console.log("timelock ok: eta", eta.toString(), "now", now.toString());

for (const w of [signerA, signerB]) {
  const isOwn = await rd(op.multisig, ms, "isOwner", [w.address]);
  const bal = await provider.getBalance(w.address);
  console.log(w.address, "owner:", isOwn, "gas:", bal.toString());
  if (!isOwn) throw new Error("not a multisig owner: " + w.address);
  if (bal === 0n) throw new Error("no gas on " + w.address);
}

const inner = guard.encodeFunctionData("execute", [op.data, op.salt]);
const id = Number(await rd(op.multisig, ms, "txCount", []));
console.log("multisig tx id will be:", id);

const send = async (w, data, label) => {
  const tx = await w.sendTransaction({ to: op.multisig, data });
  console.log(label, "sent", tx.hash);
  const r = await tx.wait();
  console.log(label, "status", r.status, "block", r.blockNumber);
  if (r.status !== 1) throw new Error(label + " reverted");
  return tx.hash;
};

const h1 = await send(signerA, ms.encodeFunctionData("submit", [op.guard, 0, inner]), "submit");
const h2 = await send(signerB, ms.encodeFunctionData("confirm", [id]), "confirm");
const h3 = await send(signerA, ms.encodeFunctionData("execute", [id]), "execute");

const g = await rd(op.guard, guard, "guardian", []);
const o = await rd(op.guard, guard, "operator", []);
console.log("guardian now:", g);
console.log("operator now:", o);
console.log("roles split:", g.toLowerCase() !== o.toLowerCase());
console.log(JSON.stringify({ multisigTx: id, submit: h1, confirm: h2, execute: h3, guardian: g, operator: o }, null, 2));
