import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
const pk = generatePrivateKey()
const acct = privateKeyToAccount(pk)
console.log("ADDRESS (public, share this):    " + acct.address)
console.log("PRIVATE_KEY (SECRET, NEVER share): " + pk)
