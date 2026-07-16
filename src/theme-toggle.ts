// Cronus comfort-theme toggle — additive, self-contained.
// Injects a floating control that tunes neon intensity via a CSS filter on the
// app root. Touches no existing component. Remove = delete this file + its
// import line in the entry file.
type Mode = "signature" | "soft" | "night"
const KEY = "cronus:theme"
const MODES: Mode[] = ["signature", "soft", "night"]
const META: Record<Mode, { label: string; icon: string; title: string }> = {
  signature: { label: "SIG", icon: "◉", title: "Signature — original neon theme" },
  soft: { label: "SOFT", icon: "◐", title: "Soft — dimmed, easy on the eyes" },
  night: { label: "NIGHT", icon: "🌙", title: "Night — calmest, low light" },
}

function apply(mode: Mode) {
  document.documentElement.setAttribute("data-cronus-theme", mode)
  try { localStorage.setItem(KEY, mode) } catch (e) {}
  document.querySelectorAll<HTMLButtonElement>("[data-cronus-seg]").forEach((b) => {
    const on = b.getAttribute("data-cronus-seg") === mode
    b.style.background = on ? "linear-gradient(180deg,#e8d48b,#b9962f)" : "transparent"
    b.style.color = on ? "#08130b" : "rgba(232,212,139,0.8)"
    b.style.fontWeight = on ? "700" : "500"
  })
}

function init() {
  if (document.getElementById("cronus-theme-style")) return
  const root =
    document.getElementById("root") ||
    (document.body.firstElementChild as HTMLElement | null)
  if (root) root.classList.add("cronus-fx-root")

  const style = document.createElement("style")
  style.id = "cronus-theme-style"
  style.textContent = `
    .cronus-fx-root { transition: filter .45s ease; }
    html[data-cronus-theme="soft"] .cronus-fx-root { filter: brightness(.9) saturate(.65) contrast(.98); }
    html[data-cronus-theme="night"] .cronus-fx-root { filter: brightness(.78) saturate(.5) contrast(.96); }
    #cronus-theme-toggle { position: fixed; top: 10px; right: 10px; z-index: 2147483000;
      display: flex; gap: 2px; padding: 3px; border-radius: 999px;
      background: rgba(6,20,12,.72); backdrop-filter: blur(8px);
      border: 1px solid rgba(212,175,55,.35); box-shadow: 0 2px 12px rgba(0,0,0,.45);
      font-family: inherit; }
    #cronus-theme-toggle button { border: 0; cursor: pointer; border-radius: 999px;
      padding: 5px 9px; font-size: 11px; letter-spacing: .5px; line-height: 1;
      display: flex; align-items: center; gap: 4px; transition: all .2s ease;
      background: transparent; color: rgba(232,212,139,.8); }
    #cronus-theme-toggle button:hover { color: #fff; }
    @media (max-width: 600px) {
      #cronus-theme-toggle button span.lbl { display: none; }
      #cronus-theme-toggle button { padding: 6px 9px; font-size: 14px; }
    }
  `
  document.head.appendChild(style)

  const bar = document.createElement("div")
  bar.id = "cronus-theme-toggle"
  MODES.forEach((m) => {
    const b = document.createElement("button")
    b.setAttribute("data-cronus-seg", m)
    b.title = META[m].title
    b.innerHTML =
      '<span aria-hidden="true">' + META[m].icon + '</span>' +
      '<span class="lbl">' + META[m].label + '</span>'
    b.onclick = () => apply(m)
    bar.appendChild(b)
  })
  document.body.appendChild(bar)

  let saved: Mode = "signature"
  try {
    const s = localStorage.getItem(KEY) as Mode | null
    if (s && MODES.indexOf(s) >= 0) saved = s
  } catch (e) {}
  apply(saved)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
export {}
