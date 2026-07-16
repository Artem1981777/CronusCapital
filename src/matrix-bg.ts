// Cronus Matrix rain — additive, self-contained.
// Classic green digital rain on a fixed canvas BEHIND all content.
// Visible ONLY in the BLACK theme; auto-pauses when the tab is hidden or the
// theme is not black. The pure-black background stays; rain lives on top of it,
// behind every panel. Remove = delete this file + its import in main.tsx.
const GREEN = "#39e014"
const HEAD = "#d6ffcf"
const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789=+-*<>¦｜:.".split("")

function start() {
  if (document.getElementById("cronus-matrix")) return
  const canvas = document.createElement("canvas")
  canvas.id = "cronus-matrix"
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:none;"
  document.body.appendChild(canvas)
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  let cols = 0
  let drops: number[] = []
  let fontSize = 18
  let dpr = 1

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr)
    canvas.height = Math.floor(window.innerHeight * dpr)
    fontSize = window.innerWidth < 600 ? 14 : 18
    cols = Math.max(1, Math.floor(window.innerWidth / fontSize))
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start)
} else {
  start()
}
export {}
