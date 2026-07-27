// Подключает lib/upgrades/router.js к api/info.js. Идемпотентно, с бэкапом.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs"

mkdirSync(".wip-backup", { recursive: true })
copyFileSync("api/info.js", ".wip-backup/info.js.orig")
copyFileSync("vercel.json", ".wip-backup/vercel.json.orig")

let s = readFileSync("api/info.js", "utf8")
if (s.includes("upgrades/router.js")) {
  console.log("info.js: уже подключён, изменений нет")
} else {
  const anchor = 'import alerts from "../lib/alerts.js"'
  if (!s.includes(anchor)) throw new Error("не найден якорь импорта alerts")
  s = s.replace(anchor, anchor + '\nimport { UPGRADE_ROUTES } from "../lib/upgrades/router.js"')
  const r = "const ROUTES = { cover,"
  if (!s.includes(r)) throw new Error("не найден якорь ROUTES")
  // upgrades идут ПЕРВЫМИ: любой существующий ключ перекрывает их, старое поведение неизменно
  s = s.replace(r, "const ROUTES = { ...UPGRADE_ROUTES, cover,")
  writeFileSync("api/info.js", s)
  console.log("info.js: подключено (+1 импорт, +1 spread)")
}

const j = JSON.parse(readFileSync("vercel.json", "utf8"))
const want = ["shadow-float", "council", "thompson", "kelly", "use-receipt", "passport"]
const have = new Set((j.rewrites || []).map((x) => x.source))
let added = 0
for (const k of want) {
  const source = "/api/" + k
  if (!have.has(source)) {
    j.rewrites.push({ source, destination: "/api/info?kind=" + k })
    added += 1
  }
}
if (added > 0) writeFileSync("vercel.json", JSON.stringify(j, null, 2) + "\n")
console.log("vercel.json: +" + added + " rewrites, всего " + j.rewrites.length)
