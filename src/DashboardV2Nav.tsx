// src/DashboardV2Nav.tsx — Dashboard V2 sidebar + section wrapper (additive).
import { useState } from "react"
import type { ReactNode } from "react"
import { GROUPS } from "./dashboardV2"

export function SectionNav({ section, onSelect, wallet }: { section: string; onSelect: (id: string) => void; wallet?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="cd2-burger" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">☰</button>
      <nav className={open ? "cd2-nav cd2-nav-open" : "cd2-nav"}>
        <div className="cd2-brand">
          <span className="cd2-brand-glyph">𓂀</span>
          <span className="cd2-brand-name">CRONUS</span>
        </div>
        {wallet ? <div className="cd2-wallet">{wallet}</div> : null}
        <div className="cd2-groups">
          {GROUPS.map((g) => (
            <div key={g.label} className="cd2-group">
              <div className="cd2-group-label">{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={section === it.id ? "cd2-item cd2-item-active" : "cd2-item"}
                  onClick={() => { onSelect(it.id); setOpen(false) }}
                >
                  <span className="cd2-item-glyph">{it.glyph}</span>
                  <span className="cd2-item-label">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
    </>
  )
}

export function Sec({ id, section, children }: { id: string; section: string; children: ReactNode }) {
  if (section !== "__ALL__" && section !== id) return null
  return <section className="cd2-section" data-sec={id}>{children}</section>
}
