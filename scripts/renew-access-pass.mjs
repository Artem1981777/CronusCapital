// scripts/renew-access-pass.mjs — extend the live access pass by one paid period.
// This spends real testnet USDC from the buyer key. It refuses to guess: if the ABI's
// renew() does not look the way this script expects, it stops and prints the signature.
import { ethers } from "ethers";
import { readFileSync } from "fs";
import path from "path";
import os from "os";

const RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const EXPLORER = "https://testnet.arcscan.app/tx/";

const pick = (s, k) => {
  const m = s.match(new RegExp("^" + k + "=(.*)$", "m"));
  if (!m) throw new Error("missing " + k);
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k);
const usdc = (v) => Number(v) / 1e6;

const env = readFileSync(path.join(os.homedir(), ".cronus-buyer.env"), "utf8");
const provider = new ethers.JsonRpcProvider(RPC, 5042002);
const wallet = new ethers.Wallet(norm(pick(env, "BUYER_PRIVATE_KEY")), provider);
const PASS = readFileSync("access-pass-address.txt", "utf8").trim();
const abi = JSON.parse(readFileSync("abi/CronusAccessPass.json", "utf8"));
const pass = new ethers.Contract(PASS, abi, wallet);

const frag = pass.interface.fragments.find((f) => f.type === "function" && f.name === "renew");
if (!frag) throw new Error("this ABI has no renew()");
if (frag.inputs.length !== 1 || frag.inputs[0].type !== "uint256") {
  console.log("renew signature is renew(" + frag.inputs.map((i) => i.type).join(",") + ") - stopping rather than guessing arguments");
  process.exit(1);
}

const token = new ethers.Contract(USDC, [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
], wallet);

const me = await wallet.getAddress();
const price = await pass.price();
const before = {
  balance: await token.balanceOf(me),
  pool: await pass.poolUsdc(),
  backed: await pass.backedPerPass(),
  id: await pass.passOf(me),
};
if (before.id === 0n) throw new Error("this key holds no pass to renew");
const expBefore = await pass.expiresAt(before.id);

console.log("account:      " + me);
console.log("pass id:      " + before.id);
console.log("expires now:  " + new Date(Number(expBefore) * 1000).toISOString());
console.log("price:        " + usdc(price) + " USDC");
console.log("balance:      " + usdc(before.balance) + " USDC");
console.log("pool before:  " + usdc(before.pool) + " USDC");
console.log("backed before:" + usdc(before.backed) + " USDC");
if (before.balance < price) throw new Error("not enough USDC to renew");

const allowance = await token.allowance(me, PASS);
if (allowance < price) {
  const a = await token.approve(PASS, price);
  const ar = await provider.waitForTransaction(a.hash);
  console.log("approve:      " + a.hash + "  block " + ar.blockNumber + "  status " + ar.status);
  if (ar.status !== 1) throw new Error("approve reverted");
}

const tx = await pass.renew(before.id);
const rc = await provider.waitForTransaction(tx.hash);
console.log("renew:        " + tx.hash + "  block " + rc.blockNumber + "  gas " + rc.gasUsed);
console.log("explorer:     " + EXPLORER + tx.hash);
if (rc.status !== 1) throw new Error("renew reverted");

const after = {
  pool: await pass.poolUsdc(),
  backed: await pass.backedPerPass(),
  balance: await token.balanceOf(me),
};
const expAfter = await pass.expiresAt(before.id);
const [live, reason] = await pass.coverage();

console.log("");
console.log("expires now:  " + new Date(Number(expAfter) * 1000).toISOString());
console.log("extended by:  " + ((Number(expAfter) - Number(expBefore)) / 86400) + " days");
console.log("pool after:   " + usdc(after.pool) + " USDC");
console.log("backed after: " + usdc(after.backed) + " USDC");
console.log("balance after:" + usdc(after.balance) + " USDC");
console.log("certificate:  " + (await pass.latestCertificateStatus()));
console.log("coverage:     " + live + " - " + reason);
console.log("active:       " + (await pass.isActive(before.id)));
