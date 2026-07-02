// src/dashboardV2.ts — Dashboard V2 section routing (additive, behind VITE_DASHBOARD_V2).
import { useState, useEffect } from "react"

export type SectionItem = { id: string; label: string; glyph: string }
export type SectionGroup = { label: string; items: SectionItem[] }

export const GROUPS: SectionGroup[] = [
  { label: "COMMAND", items: [
    { id: "overview", label: "Overview", glyph: "⬡" },
    { id: "oracle", label: "Oracle / Signals", glyph: "𓂀" },
  ] },
  { label: "MARKETS", items: [
    { id: "markets", label: "Markets / Intel", glyph: "▦" },
  ] },
  { label: "ECONOMY", items: [
    { id: "payments", label: "Payments (x402)", glyph: "◈" },
    { id: "traction", label: "Traction", glyph: "↗" },
    { id: "vault", label: "Vault", glyph: "▤" },
  ] },
  { label: "ASSURANCE", items: [
    { id: "track", label: "Track Record", glyph: "◎" },
    { id: "proof", label: "Proof / Verify", glyph: "✓" },
    { id: "standards", label: "Standards", glyph: "⬢" },
  ] },
  { label: "OPS", items: [
    { id: "risk", label: "Risk / SecOps", glyph: "◆" },
    { id: "system", label: "System", glyph: "⚙" },
  ] },
]

export const SECTION_IDS: string[] = GROUPS.flatMap((g) => g.items.map((i) => i.id))

export function dashboardV2Enabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.VITE_DASHBOARD_V2 !== "false"
}

const STORE_KEY = "cronus:dash:section"

function readSection(fallback: string): string {
  if (typeof window === "undefined") return fallback
  const h = (window.location.hash || "").replace(/^#\/?/, "")
  if (h && SECTION_IDS.includes(h)) return h
  try { const s = window.localStorage.getItem(STORE_KEY); if (s && SECTION_IDS.includes(s)) return s } catch { /* ignore */ }
  return fallback
}

export function useSection(fallback = "overview") {
  const [section, setState] = useState<string>(() => readSection(fallback))
  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || "").replace(/^#\/?/, "")
      if (h && SECTION_IDS.includes(h)) setState(h)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const setSection = (id: string) => {
    if (!SECTION_IDS.includes(id)) return
    setState(id)
    try { window.localStorage.setItem(STORE_KEY, id) } catch { /* ignore */ }
    try {
      const cur = (window.location.hash || "").replace(/^#\/?/, "")
      if (cur !== id) window.location.hash = "/" + id
    } catch { /* ignore */ }
  }
  return [section, setSection] as const
}
