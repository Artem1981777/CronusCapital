// Cronus Matrix rain — additive, self-contained.
// Renders classic green digital rain INSIDE the existing full-screen background
// layer (.egypt-bg), so it sits exactly where the background shows: behind all
// panels/content. Visible ONLY in BLACK theme; auto-pauses when hidden or when
// theme != black. Remove = delete this file + its import in main.tsx.
const GREEN = "#39e014"
const HEAD = "#d6ffcf"
const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789=+-*<>¦｜:.".split("")

function mount(host: HTMLElement) {
  if (document.getElementById("cronus-matrix")) return
  const asBg = host !== document.body
  const canvas = document.createElement("canvas")
  canvas.id = "cronus-matrix"
  canvas.style.cssText = asBg
    ? "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;"
    : "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:none;"
  host.appendChild(canvas)
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D

  let cols = 0
  let drops: number[] = []
  let fontSize = 18
  let dpr = 1

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    fontSize = w < 600 ? 14 : 18
    cols = Math.max(1, Math.floor(w / fontSize))
    drops = new Array(cols).fill(0).map(() => Math.random() * -60)
  }
  resize()
  window.addEventListener("resize", resize)

  function isOn() {
    return (
      document.documentElement.getAttribute("data-cronus-theme") === "black" &&
      document.visibilityState === "visible"
    )
  }

  let last = 0
  const stepMs = 55

  function frame(t: number) {
    requestAnimationFrame(frame)
    if (!isOn()) {
      if (canvas.style.display !== "none") {
        canvas.style.display = "none"
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }
    if (canvas.style.display === "none") {
      canvas.style.display = "block"
      last = 0
    }
    if (t - last < stepMs) return
    last = t
    ctx.fillStyle = "rgba(0,0,0,0.09)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const fs = fontSize * dpr
    ctx.font = fs + "px monospace"
    for (let i = 0; i < cols; i++) {
      const x = i * fs
      const y = drops[i] * fs
      ctx.fillStyle = HEAD
      ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x, y)
      ctx.fillStyle = GREEN
      ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x, y - fs)
      if (y > canvas.height && Math.random() > 0.975) drops[i] = Math.random() * -20
      drops[i]++
    }
  }
  requestAnimationFrame(frame)
}

function boot() {
  const now = document.querySelector(".egypt-bg") as HTMLElement | null
  if (now) { mount(now); return }
  let tries = 0
  const timer = window.setInterval(() => {
    tries++
    const host = document.querySelector(".egypt-bg") as HTMLElement | null
    if (host) { window.clearInterval(timer); mount(host) }
    else if (tries >= 40) { window.clearInterval(timer); mount(document.body) }
  }, 150)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot)
} else {
  boot()
}
export {}
