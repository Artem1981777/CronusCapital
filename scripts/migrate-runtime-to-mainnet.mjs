import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return walk(path)
  return /\.(ts|tsx|js)$/.test(entry.name) ? [path] : []
})
const files = [...walk("src"), ...walk("api"), ...walk("lib"), ".env.example"]
const replacements = new Map([
  ["Arc Testnet", "Arc Mainnet"],
  ["5042002", "5042"],
  ["https://rpc.testnet.arc.network", "https://rpc.mainnet.arc.io"],
  ["https://rpc.testnet.arc.io", "https://rpc.mainnet.arc.io"],
  ["https://rpc.testnet.arc" + ".network", "https://rpc.mainnet.arc.io"],
  ["https://testnet.arcscan" + ".app", "https://explorer.arc.io"],
  ["rpc.testnet.arc.network", "rpc.mainnet.arc.io"],
  ["testnet.arcscan.app", "explorer.arc.io"],
  ["https://rpc.testnet.arc\" + \".network", "https://rpc.mainnet.arc.io"],
  ["https://testnet.arcscan\" + \".app/tx/", "https://explorer.arc.io/tx/"],
  ["https://testnet.arcscan\" + \".app", "https://explorer.arc.io"],
  ["testnet.arcscan\" + \".app/tx/", "explorer.arc.io/tx/"],
  ["testnet.arcscan\" + \".app", "explorer.arc.io"],
  ["https://testnet.arcscan.app", "https://explorer.arc.io"],
  ["arc-testnet", "arc-mainnet"],
  ["0xdc6778c5f8cc74b10aed11c48306d4cfc5737fbd", "0xd4939e42bd3e0ec9cb00091778a331c35d1834aa"],
  ["0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD", "0xd4939e42bd3e0ec9cb00091778a331c35d1834aa"],
  ["0x252cAA46b9b0648908000f6C87e0a561DB4dEb6c", "0x5B179bFF284a17a5C8C3ccaDed1984949B410522"],
  ["0x252caa46b9b0648908000f6c87e0a561db4deb6c", "0x5b179bff284a17a5c8c3ccaDed1984949b410522"],
  ["0x64e55De4CbC3CDf981B2c970807129FA61806873", "0x5C7f8f12D6aEcbA1A7461435F45f25b6c8Be18Ad"],
  ["0x64e55de4cbc3cdf981b2c970807129fa61806873", "0x5c7f8f12d6aecba1a7461435f45f25b6c8be18ad"],
  ["0x2A19ad056EaE83364B0a6420685974cA219c209E", "0x7426bF7ec186F7E0fb57D3f9487fA94234D2C1Dd"],
  ["0x2a19ad056eae83364b0a6420685974ca219c209e", "0x7426bf7ec186f7e0fb57d3f9487fa94234d2c1dd"],
  ["0x13B6984357e27dAB17DF44a6396042239e70542C", "0x6104FC25E1B32B69F5c3Ef0DbBE4D7eC2821b0d3"],
  ["0x13b6984357e27dab17df44a6396042239e70542c", "0x6104fc25e1b32b69f5c3ef0dbbe4d7ec2821b0d3"],
  ["0xeA4788164c63B0EF2788d9c74859B43f42BC391E", "0x37846B767EC1889b0b719945c1168e42228b944C"],
  ["0xea4788164c63b0ef2788d9c74859b43f42bc391e", "0x37846b767ec1889b0b719945c1168e42228b944c"],
  ["0xB327a942A64A190b453c7D6b27Cc03FE7ACDF166", "0x8B5A4aff399e37F5d571A13aABbD095Bb91D0fB5"],
  ["0xb327a942a64a190b453c7d6b27cc03fe7acdf166", "0x8b5a4aff399e37f5d571a13aabbd095bb91d0fb5"],
  ["0x6D59E3bF169743Dd31b5ba9eb394FEad0A9756C2", "0x668811DD7e0b1c9DaBb041BE4a9d064789a77E05"],
  ["0x6d59e3bf169743dd31b5ba9eb394fead0a9756c2", "0x668811dd7e0b1c9dabb041be4a9d064789a77e05"],
  ["0xD9c8DC621e74c66c86D3c49434f1f038167E31B2", "0x6190E140F6a643E16D0B2f61FCDA5883430BE310"],
  ["0xd9c8dc621e74c66c86d3c49434f1f038167e31b2", "0x6190e140f6a643e16d0b2f61fcda5883430be310"],
])
let changed = 0
for (const file of files) {
  let text = readFileSync(file, "utf8")
  const before = text
  for (const [from, to] of replacements) text = text.split(from).join(to)
  if (text !== before) { writeFileSync(file, text); changed += 1; console.log(file) }
}
console.log(`updated ${changed} files`)
