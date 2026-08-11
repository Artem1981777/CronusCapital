import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, Interface } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const CHAIN = 5042002;
const MULTISIG = "0xde8874C53D82a38c1c2864ea575f9E62Dc29dA5F";
const HOT = "0xB8D0054Dd4FE76115E75BF196d89E760bbCD3bc6";

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

const ms = new Interface([
  "function submit(address to, uint256 value, bytes data) returns (uint256)",
  "function confirm(uint256 id)",
  "function execute(uint256 id)",
  "function txCount() view returns (uint256)",
  "function ownersCount() view returns (uint256)",
  "function threshold() view returns (uint256)",
  "function isOwner(address a) view returns (bool)",
  "function removeOwner(address o)",
]);
const rd = async (fn, args) =>
  ms.decodeFunctionResult(fn, await provider.call({ to: MULTISIG, data: ms.encodeFunctionData(fn, args || []) }))[0];

const before = Number(await rd("ownersCount", []));
const th = Number(await rd("threshold", []));
console.log("before:", before, "owners, threshold", th);
if (!(await rd("isOwner", [HOT]))) throw new Error("hot key is already not an owner");
if (before - 1 < th) throw new Error("would drop below threshold, aborting");

for (const w of [signerA, signerB]) {
  const isOwn = await rd("isOwner", [w.address]);
  const bal = await provider.getBalance(w.address);
  console.log(w.address, "owner:", isOwn, "gas:", bal.toString());
  if (!isOwn) throw new Error("signer is not an owner: " + w.address);
  if (bal === 0n) throw new Error("no gas on " + w.address);
}

const inner = ms.encodeFunctionData("removeOwner", [HOT]);
const id = Number(await rd("txCount", []));
console.log("multisig tx id will be:", id);

const send = async (w, data, label) => {
  const tx = await w.sendTransaction({ to: MULTISIG, data });
  console.log(label, "sent", tx.hash);
  const r = await tx.wait();
  console.log(label, "status", r.status, "block", r.blockNumber);
  if (r.status !== 1) throw new Error(label + " reverted");
  return tx.hash;
};

const h1 = await send(signerA, ms.encodeFunctionData("submit", [MULTISIG, 0, inner]), "submit");
const h2 = await send(signerB, ms.encodeFunctionData("confirm", [id]), "confirm");
const h3 = await send(signerA, ms.encodeFunctionData("execute", [id]), "execute");

const after = Number(await rd("ownersCount", []));
const stillOwner = await rd("isOwner", [HOT]);
console.log("after:", after, "owners, threshold", Number(await rd("threshold", [])));
console.log("hot key still an owner:", stillOwner);
console.log(JSON.stringify({ multisigTx: id, submit: h1, confirm: h2, execute: h3, ownersBefore: before, ownersAfter: after, hotRemoved: !stillOwner }, null, 2));
