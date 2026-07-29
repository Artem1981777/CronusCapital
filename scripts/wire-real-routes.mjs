import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
const P = "api/info.js"
let s = readFileSync(P, "utf8")
mkdirSync(".wip-backup", { recursive: true })
if (!existsSync(".wip-backup/info.js.prewire2")) writeFileSync(".wip-backup/info.js.prewire2", s)

const imp = 'import { REAL_ROUTES } from "../lib/council/routes.js"'
const anchorImp = 'import { UPGRADE_ROUTES } from "../lib/upgrades/router.js"'
if (!s.includes(imp)) {
  if (!s.includes(anchorImp)) { console.error("import anchor not found"); process.exit(1) }
  s = s.replace(anchorImp, anchorImp + "\n" + imp)
}
const anchorSpread = "const ROUTES = { ...UPGRADE_ROUTES,"
if (!s.includes("...REAL_ROUTES")) {
  if (!s.includes(anchorSpread)) { console.error("spread anchor not found"); process.exit(1) }
  s = s.replace(anchorSpread, "const ROUTES = { ...UPGRADE_ROUTES, ...REAL_ROUTES,")
}
writeFileSync(P, s)
console.log("info.js: REAL_ROUTES wired in")
