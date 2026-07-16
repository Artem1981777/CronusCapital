// Cronus theme toggle — additive, self-contained.
// Three modes: ORIGINAL (Egyptian photo), BLACK (pure black), MATRIX (black +
// live digital rain, drawn by matrix-bg.ts inside the .egypt-bg layer).
// Layering note: the visible photo is the BODY background (html,body rule in
// cronus.css). The .egypt-bg div paints BELOW body (z-index:-2), so dark modes
// set html to #000 and body to TRANSPARENT — this lets the background layer
// (and the matrix canvas inside it) show through. Content is untouched.
// Remove = delete this file + its import line in the entry file.
type Mode = "original" | "black" | "matrix"
const KEY = "cronus:theme"
const MODES: Mode[] = ["original", "black", "matrix"]
const META: Record<Mode, { label: string; icon: string; title: string }> = {
  original: { label: "ORIGINAL", icon: "◉", title: "Original — Egyptian background" },
  black: { label: "BLACK", icon: "●", title: "Black — pure black background" },
  matrix: { label: "MATRIX", icon: "▦", title: "Matrix — black + digital rain" },
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
  const style = document.createElement("style")
  style.id = "cronus-theme-style"
  style.textContent = `
    html[data-cronus-theme="black"],
    html[data-cronus-theme="matrix"] {
      background: #000 !important;
      background-image: none !important;
    }
    html[data-cronus-theme="black"] body,
    html[data-cronus-theme="matrix"] body {
      background: transparent !important;
      background-image: none !important;
    }
    html[data-cronus-theme="black"] .egypt-bg,
    html[data-cronus-theme="matrix"] .egypt-bg {
      background: #000 !important;
      background-image: none !important;
      filter: none !important;
    }
    html[data-cronus-theme="black"] .egypt-bg::before,
    html[data-cronus-theme="black"] .egypt-bg::after,
    html[data-cronus-theme="matrix"] .egypt-bg::before,
    html[data-cronus-theme="matrix"] .egypt-bg::after {
      display: none !important;
    }
    html[data-cronus-theme="black"] .egypt-bg > :not(#cronus-matrix),
    html[data-cronus-theme="matrix"] .egypt-bg > :not(#cronus-matrix) {
      display: none !important;
    }
    #cronus-theme-toggle { position: fixed; top: 10px; right: 10px; z-index: 2147483000;
      display: flex; gap: 2px; padding: 3px; border-radius: 999px;
      background: rgba(6,20,12,.75); backdrop-filter: blur(8px);
      border: 1px solid rgba(212,175,55,.4); box-shadow: 0 2px 12px rgba(0,0,0,.45);
      font-family: inherit; }
    #cronus-theme-toggle button { border: 0; cursor: pointer; border-radius: 999px;
      padding: 6px 11px; font-size: 11px; letter-spacing: .5px; line-height: 1;
      display: flex; align-items: center; gap: 5px; transition: all .2s ease;
      background: transparent; color: rgba(232,212,139,.8); white-space: nowrap; }
    #cronus-theme-toggle button:hover { color: #fff; }
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

  let saved: Mode = "original"
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
