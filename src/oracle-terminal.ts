// Cronus oracle terminal — additive, self-contained. v2
// Typewriter agent log that fills the empty area of the hero card.
// Anchors to .cd-head-title ("CRONUS ORACLE DASHBOARD"), mounts into its hero
// container; pointer-events:none so it never blocks clicks.
// Remove = delete this file + its import line in the entry file.
const MAX_LINES = 9

function pad(n: number): string { return n < 10 ? "0" + n : String(n) }
function stamp(): string {
  const d = new Date()
  return "[" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "]"
}

const LINES: Array<() => string> = [
  () => "SCOUT ▸ scanning agora feeds · " + (3 + Math.floor(Math.random() * 6)) + " signals detected",
  () => "ANALYST ▸ EV model: implied vs fair odds · edge " + (1 + Math.random() * 4).toFixed(1) + "%",
  () => "EXECUTOR ▸ risk caps OK · max exposure 5% bankroll",
  () => "x402 ▸ nano settlement verified on Arc · $0.001 USDC",
  () => "GATEWAY ▸ gas-free transfer via Circle Gateway ✓",
  () => "COVER ▸ parametric policies armed · resolver cron live",
  () => "ORACLE ▸ regime: RANGE-BOUND · confidence " + (74 + Math.floor(Math.random() * 21)),
  () => "LEDGER ▸ decision hash committed on-chain · ERC-8004 ✓",
  () => "VAULT ▸ TVL stable · agents idle-scanning mempool",
]

function typeLine(box: HTMLDivElement, text: string) {
  const el = document.createElement("div")
  el.style.cssText = "color:#39e014;text-shadow:0 0 6px rgba(57,224,20,0.35);white-space:nowrap;overflow:hidden;"
  box.appendChild(el)
  while (box.children.length > MAX_LINES) box.removeChild(box.children[0])
  for (let i = 0; i < box.children.length; i++) {
    const c = box.children[i] as HTMLElement
    const age = box.children.length - 1 - i
    c.style.opacity = String(Math.max(0.18, 1 - age * 0.11))
  }
  let i = 0
  const t = setInterval(() => {
    i++
    el.textContent = text.slice(0, i)
    if (i >= text.length) clearInterval(t)
  }, 18)
}

function mount(host: HTMLElement) {
  if (document.getElementById("cronus-oracle-terminal")) return
  if (window.getComputedStyle(host).position === "static") host.style.position = "relative"
  const box = document.createElement("div")
  box.id = "cronus-oracle-terminal"
  box.style.cssText = "position:absolute;left:18px;top:60px;bottom:16px;width:min(50%,520px);overflow:hidden;pointer-events:none;z-index:0;display:flex;flex-direction:column;justify-content:flex-end;gap:3px;font-family:'Courier New',monospace;font-size:11px;line-height:1.45;letter-spacing:0.4px;text-align:left;"
  host.appendChild(box)
  let idx = 0
  const emit = () => {
    const mk = LINES[idx % LINES.length]
    idx++
    typeLine(box, stamp() + " " + mk())
  }
  emit()
  const iv = setInterval(() => {
    if (!box.isConnected) { clearInterval(iv); boot(); return }
    emit()
  }, 3200)
}

function findHost(): HTMLElement | null {
  const title = document.querySelector(".cd-head-title")
  if (!title) return null
  const card = title.closest("header, .cd-card, .cd-panel")
  return (card as HTMLElement | null) || (title.parentElement as HTMLElement | null)
}

function boot() {
  const first = findHost()
  if (first) { mount(first); return }
  let tries = 0
  const timer = setInterval(() => {
    tries++
    const host = findHost()
    if (host) { clearInterval(timer); mount(host) }
    else if (tries > 80) clearInterval(timer)
  }, 250)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot)
} else {
  boot()
}
export {}
