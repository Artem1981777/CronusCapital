import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"

const OUT = path.join(os.homedir(), ".cronus-cold.env")
if (fs.existsSync(OUT)) {
  console.error("Refusing to overwrite existing " + OUT + " - delete it manually if you really want fresh keys.")
  process.exit(1)
}

const mk = (label) => {
  const w = ethers.Wallet.createRandom()
  return { label, address: w.address, pk: w.privateKey }
}

const keys = [mk("RECOVERY"), mk("COSIGNER2"), mk("COSIGNER3")]
const body = keys.map(k => `${k.label}_ADDRESS=${k.address}\n${k.label}_PRIVATE_KEY=${k.pk}`).join("\n")
fs.writeFileSync(OUT, body + "\n", { mode: 0o600 })

console.log("Cold keys written to " + OUT + " (mode 600, OUTSIDE the repo).")
console.log("=== ADDRESSES ONLY (safe to paste anywhere) ===")
for (const k of keys) console.log(`${k.label}: ${k.address}`)
console.log("Private keys were NOT printed. Keep " + OUT + " offline; never commit it.")
