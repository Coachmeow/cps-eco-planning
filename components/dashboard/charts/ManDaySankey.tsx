'use client'

// Sankey man-day (d3-sankey) แบบ drill: ไซต์ → (คลิก) กลุ่มงาน → (คลิก) คน
// วัดขนาดกล่องจริง (ResizeObserver) แล้ว layout เต็มพื้นที่ — ST ชิดบน · LOG ชิดล่าง · ป้ายขวาชิดขอบ
// header: title (ซ้าย) + ปุ่มไซต์/breadcrumb/hint/dropdown (ขวา) อยู่แถวเดียวกัน ; ซ้ายของ content = leftPanel (Capacity rings)
import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey'
import { teamHex, siteHex, INK, MUTED } from '@/lib/chartTheme'

export interface SankeyRow {
  siteId: number; siteCode: string; siteColor: string
  teamCode: string; personId: number; personLabel: string; days: number
}

const N_SITES = 12, N_PEOPLE = 10
const round1 = (n: number) => Math.round(n * 10) / 10
type Kind = 'site' | 'team' | 'person'
interface GNode { name: string; color: string; kind: Kind; key?: string }
interface GLink { source: number; target: number; value: number }

function buildGraph(rows: SankeyRow[], focusSite: string, focusTeam: string): { nodes: GNode[]; links: GLink[] } {
  let r = rows
  if (focusSite) r = r.filter(x => String(x.siteId) === focusSite)
  if (focusTeam) r = r.filter(x => x.teamCode === focusTeam)

  const nodes: GNode[] = []
  const idx = new Map<string, number>()
  const nid = (k: string, make: () => GNode) => { if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push(make()) } return idx.get(k)! }
  const linkMap = new Map<string, number>()
  const add = (s: number, t: number, v: number) => linkMap.set(`${s}>${t}`, (linkMap.get(`${s}>${t}`) ?? 0) + v)

  // ── ชั้นไซต์ (คอลัมน์แรก) ──
  let siteOf: (x: SankeyRow) => number
  if (focusSite) {
    const s = nid('site', () => ({ name: r[0]?.siteCode ?? '', color: siteHex(r[0]?.siteColor), kind: 'site' }))
    siteOf = () => s
  } else {
    const sum = new Map<number, number>()
    for (const x of r) sum.set(x.siteId, (sum.get(x.siteId) ?? 0) + x.days)
    const sorted = Array.from(sum.entries()).sort((a, b) => b[1] - a[1])
    const top = new Set(sorted.slice(0, N_SITES).map(([id]) => id))
    const meta = new Map<number, { code: string; color: string }>()
    for (const x of r) meta.set(x.siteId, { code: x.siteCode, color: x.siteColor })
    for (const [id] of sorted) if (top.has(id)) nid(`s${id}`, () => ({ name: meta.get(id)!.code, color: siteHex(meta.get(id)!.color), kind: 'site', key: String(id) }))
    if (sorted.some(([id]) => !top.has(id))) nid('s_other', () => ({ name: 'ไซต์อื่นๆ', color: '#cbd5e1', kind: 'site' }))
    siteOf = (x) => top.has(x.siteId) ? idx.get(`s${x.siteId}`)! : idx.get('s_other')!
  }

  // ── ชั้นกลุ่มงาน ──
  const teamSum = new Map<string, number>()
  for (const x of r) teamSum.set(x.teamCode, (teamSum.get(x.teamCode) ?? 0) + x.days)
  for (const [code] of Array.from(teamSum.entries()).sort((a, b) => b[1] - a[1]))
    nid(`t${code}`, () => ({ name: code, color: teamHex(code), kind: 'team', key: focusTeam ? undefined : code }))
  for (const x of r) add(siteOf(x), idx.get(`t${x.teamCode}`)!, x.days)

  // ── ชั้นคน (โชว์เสมอ ; Top-N + อื่นๆ) ──
  {
    const sum = new Map<number, number>()
    for (const x of r) sum.set(x.personId, (sum.get(x.personId) ?? 0) + x.days)
    const sorted = Array.from(sum.entries()).sort((a, b) => b[1] - a[1])
    const top = new Set(sorted.slice(0, N_PEOPLE).map(([id]) => id))
    const meta = new Map<number, string>()
    for (const x of r) meta.set(x.personId, x.personLabel)
    for (const [id] of sorted) if (top.has(id)) nid(`p${id}`, () => ({ name: meta.get(id)!, color: '#38b787', kind: 'person' }))
    if (sorted.some(([id]) => !top.has(id))) nid('p_other', () => ({ name: 'อื่นๆ', color: '#a7d9c3', kind: 'person' }))
    for (const x of r) add(idx.get(`t${x.teamCode}`)!, top.has(x.personId) ? idx.get(`p${x.personId}`)! : idx.get('p_other')!, x.days)
  }

  const links = Array.from(linkMap.entries()).map(([k, v]) => {
    const [source, target] = k.split('>').map(Number)
    return { source, target, value: round1(v) }
  })
  return { nodes, links }
}

const isOther = (n: { name?: string }) => n.name === 'ไซต์อื่นๆ' || n.name === 'อื่นๆ'

// margins ในกล่อง (ซ้าย=ป้ายไซต์ · ขวา=ป้ายคน · บน/ล่าง=ป้ายกลุ่มงาน)
const ML = 110, MR = 88, MT = 14, MB = 8

export default function ManDaySankey({ rows, title, leftPanel }: { rows: SankeyRow[]; title?: ReactNode; leftPanel?: ReactNode }) {
  const [focusSite, setFocusSite] = useState('')
  const [focusTeam, setFocusTeam] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize((s) => (Math.abs(s.w - cr.width) > 1 || Math.abs(s.h - cr.height) > 1 ? { w: cr.width, h: cr.height } : s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const siteOpts = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) m.set(String(r.siteId), r.siteCode)
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])
  const siteLabel = focusSite ? (rows.find(r => String(r.siteId) === focusSite)?.siteCode ?? '') : ''

  const layout = useMemo(() => {
    if (size.w < 60 || size.h < 60) return null
    const g = buildGraph(rows, focusSite, focusTeam)
    if (g.links.length === 0) return null
    const top = MT, bottom = size.h - MB
    const gen = sankey<GNode, GLink>()
      .nodeWidth(13).nodePadding(7).nodeAlign(sankeyLeft)
      .nodeSort((a, b) => (isOther(a) ? 1 : 0) - (isOther(b) ? 1 : 0) || (b.value ?? 0) - (a.value ?? 0))
      .extent([[ML, top], [size.w - MR, bottom]])
    const graph = gen({ nodes: g.nodes.map(d => ({ ...d })), links: g.links.map(d => ({ ...d })) })

    type LNode = typeof graph.nodes[number]
    const shiftNode = (n: LNode, dy: number) => {
      n.y0! += dy; n.y1! += dy
      for (const l of graph.links) { if (l.source === n) l.y0! += dy; if (l.target === n) l.y1! += dy }
    }
    const cols = new Map<number, LNode[]>()
    for (const n of graph.nodes) { const k = Math.round(n.x0 ?? 0); if (!cols.has(k)) cols.set(k, []); cols.get(k)!.push(n) }
    const avail = bottom - top
    for (const list of cols.values()) {
      if (list[0].kind === 'team') {
        // กลุ่มงาน: กระจายเต็มแนวตั้ง (ST ชิดบน · LOG ชิดล่าง) เว้นช่องไฟไว้วางชื่อเหนือแถบ
        list.sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))
        const sumH = list.reduce((s, n) => s + ((n.y1 ?? 0) - (n.y0 ?? 0)), 0)
        const gap = list.length > 1 ? Math.max(18, (avail - sumH) / (list.length - 1)) : 0
        let y = top
        // ถ้าช่องไฟรวมเกิน avail (แถบเยอะ) หดลงแล้วจัดกึ่งกลาง
        const totalH = sumH + gap * (list.length - 1)
        if (totalH > avail) { const g2 = Math.max(3, (avail - sumH) / (list.length - 1)); y = top; for (const n of list) { const h = (n.y1 ?? 0) - (n.y0 ?? 0); shiftNode(n, y - (n.y0 ?? 0)); y += h + g2 } }
        else { for (const n of list) { const h = (n.y1 ?? 0) - (n.y0 ?? 0); shiftNode(n, y - (n.y0 ?? 0)); y += h + gap } }
      } else {
        // ไซต์/คน: เลื่อนทั้งคอลัมน์ให้กึ่งกลาง (คง layout ของ d3)
        const minY = Math.min(...list.map(n => n.y0 ?? 0)), maxY = Math.max(...list.map(n => n.y1 ?? 0))
        const dy = top + (avail - (maxY - minY)) / 2 - minY
        if (Math.abs(dy) >= 0.5) for (const n of list) shiftNode(n, dy)
      }
    }
    return graph
  }, [rows, focusSite, focusTeam, size])

  function onFocus(kind: Kind, key?: string) {
    if (kind === 'site' && key) { setFocusSite(key); setFocusTeam('') }
    else if (kind === 'team' && key) setFocusTeam(key)
  }

  const linkPath = sankeyLinkHorizontal<GNode, GLink>()

  return (
    <div>
      {/* header: title + controls อยู่แถวเดียวกัน (ระดับหัวข้อการ์ด) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {title}
        <button onClick={() => { setFocusSite(''); setFocusTeam('') }}
          className={`rounded px-2 py-0.5 ${focusSite || focusTeam ? 'text-emerald-700 hover:bg-emerald-50' : 'bg-slate-100 font-medium text-slate-700'}`}>ทุกไซต์</button>
        {focusSite && <><span className="text-slate-300">›</span>
          <button onClick={() => setFocusTeam('')}
            className={`rounded px-2 py-0.5 ${focusTeam ? 'text-emerald-700 hover:bg-emerald-50' : 'bg-slate-100 font-medium text-slate-700'}`}>{siteLabel}</button></>}
        {focusTeam && <><span className="text-slate-300">›</span><span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{focusTeam}</span></>}
        <span className="ml-auto text-slate-400">
          {focusTeam ? `รายคนของ ${focusTeam}${siteLabel ? ` @ ${siteLabel}` : ''}` : 'คลิกกลุ่มงาน → เจาะกลุ่มงาน · คลิกไซต์ → เจาะไซต์'}
        </span>
        <select value={focusSite} onChange={e => { setFocusSite(e.target.value); setFocusTeam('') }}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:outline-none">
          <option value="">เลือกเพื่อดูรายไซต์งาน</option>
          {siteOpts.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
        </select>
      </div>

      {/* content: leftPanel (Capacity rings) + Sankey (เต็มพื้นที่กล่อง) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="lg:w-[400px] lg:shrink-0 lg:border-r lg:border-slate-100 lg:pr-6">{leftPanel}</div>
        <div ref={boxRef} className="relative min-h-[380px] min-w-0 flex-1">
          {!layout ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              {rows.length ? 'กำลังจัดวาง…' : 'ยังไม่มีข้อมูล man-day'}
            </p>
          ) : (
            <svg viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }} role="img" aria-label="Sankey man-day">
              {layout.links.map((l, i) => (
                <path key={i} d={linkPath(l) ?? ''} fill="none"
                  stroke={(l.target as GNode).color} strokeOpacity={0.32} strokeWidth={Math.max(1, l.width ?? 1)}>
                  <title>{(l.source as GNode).name} → {(l.target as GNode).name}: {round1(l.value)}</title>
                </path>
              ))}
              {layout.nodes.map((n, i) => {
                const clickable = !!n.key
                const w = (n.x1 ?? 0) - (n.x0 ?? 0)
                const h = Math.max((n.y1 ?? 0) - (n.y0 ?? 0), 1)
                const mid = (n.y0 ?? 0) + h / 2
                const val = Math.round(n.value ?? 0)
                const arrow = clickable ? ' ›' : ''
                const label = n.kind === 'site'
                  ? <text x={(n.x0 ?? 0) - 6} y={mid} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={INK}>{n.name} <tspan fill={MUTED}>{val}{arrow}</tspan></text>
                  : n.kind === 'team'
                  ? <text x={(n.x0 ?? 0) + w / 2} y={(n.y0 ?? 0) - 4} textAnchor="middle" fontSize={10} fill={INK}>{n.name} <tspan fill={MUTED}>{val}{arrow}</tspan></text>
                  : <text x={(n.x1 ?? 0) + 6} y={mid} textAnchor="start" dominantBaseline="middle" fontSize={10} fill={INK}>{n.name} <tspan fill={MUTED}>{val}</tspan></text>
                return (
                  <g key={i} style={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => clickable && onFocus(n.kind, n.key)}>
                    <rect x={n.x0} y={n.y0} width={w} height={h} rx={2} fill={n.color} fillOpacity={0.92}>
                      <title>{n.name}: {val}</title>
                    </rect>
                    {label}
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
