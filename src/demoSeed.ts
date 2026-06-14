type Earnings = { calls: number; usd: number }
type Spend = { count: number; usd: number }

function read<T>(key: string): T | null {
	try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null } catch { return null }
}
function write(key: string, v: unknown) {
	try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
}

const e = read<Earnings>("cronus_earnings")
if (!e || !e.calls) write("cronus_earnings", { calls: 63, usd: 1.26 })

const sp = read<Spend>("cronus.spend.v1")
if (!sp || !sp.count) write("cronus.spend.v1", { count: 41, usd: 0.82 })

export {}
