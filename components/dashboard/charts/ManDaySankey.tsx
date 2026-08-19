'use client'

// Sankey man-day แบบ drill ทีละชั้น: รวม → ไซต์ → (คลิก) กลุ่มงาน → (คลิก) คน
// เส้นน้อยเสมอเพราะกางเฉพาะกิ่งที่เลือก ; recharts <Sankey> + rebuild กราฟตอนคลิก
import { useMemo, useState } from 'react'
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import { teamHex, siteHex, INK, MUTED } from '@/lib/chartTheme'

export interface SankeyRow {
  siteId: number; siteCode: string; siteColor: string
  teamCode: string; personId: number; personLabel: string; days: number
}

const N_SITES = 10, N_PEOPLE = 14
const round1 = (n: number) => Math.round(n * 10) / 10

type Kind = 'total' | 'site' | 'team' | 'person'
interface GNode { name: string; color: string; kind: Kind; key?: string }

function buildGraph(rows: SankeyRow[], focusSite: string, focusTeam: string) {
  let r = rows
  if (focusSite) r = r.filter(x => String(x.siteId) === focusSite)
  if (focusSite && focusTeam) r = r.filter(x => x.teamCode === focusTeam)

  const nodes: GNode[] = []
  const idx = new Map<string, number>()
  const nid = (k: string, make: () => GNode) => { if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push(make()) } return idx.get(k)! }
  const linkMap = new Map<string, number>()
  const add = (s: number, t: number, v: number) => linkMap.set(`${s}>${t}`, (linkMap.get(`${s}>${t}`) ?? 0) + v)

  const total = nid('total', () => ({ name: 'รวม', color: '#64748b', kind: 'total' }))

  if (!focusSite) {
    // ชั้น 1: รวม → ไซต์ (Top-N + อื่นๆ) — สร้าง node ไซต์เรียงมาก→น้อย แล้ว "ไซต์อื่นๆ" ท้ายสุด (ล่างสุด)
    const sum = new Map<number, number>()
    for (const x of r) sum.set(x.siteId, (sum.get(x.siteId) ?? 0) + x.days)
    const sorted = Array.from(sum.entries()).sort((a, b) => b[1] - a[1])
    const top = new Set(sorted.slice(0, N_SITES).map(([id]) => id))
    const meta = new Map<number, { code: string; color: string }>()
    for (const x of r) meta.set(x.siteId, { code: x.siteCode, color: x.siteColor })
    for (const [id] of sorted) if (top.has(id)) nid(`s${id}`, () => ({ name: meta.get(id)!.code, color: siteHex(meta.get(id)!.color), kind: 'site', key: String(id) }))
    const hasOther = sorted.some(([id]) => !top.has(id))
    if (hasOther) nid('s_other', () => ({ name: 'ไซต์อื่นๆ', color: '#cbd5e1', kind: 'site' }))   // สร้างท้ายสุด → ล่างสุด
    for (const x of r) add(total, top.has(x.siteId) ? idx.get(`s${x.siteId}`)! : idx.get('s_other')!, x.days)
  } else {
    const siteMeta = r[0]
    const site = nid('site', () => ({ name: siteMeta?.siteCode ?? '', color: siteHex(siteMeta?.siteColor), kind: 'site' }))
    add(total, site, r.reduce((s, x) => s + x.days, 0))
    if (!focusTeam) {
      // ชั้น 2: ไซต์ → กลุ่มงาน
      for (const x of r) {
        const tm = nid(`t${x.teamCode}`, () => ({ name: x.teamCode, color: teamHex(x.teamCode), kind: 'team', key: x.teamCode }))
        add(site, tm, x.days)
      }
    } else {
      // ชั้น 3: ไซต์ → กลุ่มงาน → คน (Top-N + อื่นๆ)
      const tm = nid(`t${focusTeam}`, () => ({ name: focusTeam, color: teamHex(focusTeam), kind: 'team' }))
      add(site, tm, r.reduce((s, x) => s + x.days, 0))
      const sum = new Map<number, number>()
      for (const x of r) sum.set(x.personId, (sum.get(x.personId) ?? 0) + x.days)
      const sorted = Array.from(sum.entries()).sort((a, b) => b[1] - a[1])
      const top = new Set(sorted.slice(0, N_PEOPLE).map(([id]) => id))
      const meta = new Map<number, string>()
      for (const x of r) meta.set(x.personId, x.personLabel)
      for (const [id] of sorted) if (top.has(id)) nid(`p${id}`, () => ({ name: meta.get(id)!, color: '#38b787', kind: 'person' }))
      const hasOther = sorted.some(([id]) => !top.has(id))
      if (hasOther) nid('p_other', () => ({ name: 'อื่นๆ', color: '#a7d9c3', kind: 'person' }))   // ท้ายสุด → ล่างสุด
      for (const x of r) add(tm, top.has(x.personId) ? idx.get(`p${x.personId}`)! : idx.get('p_other')!, x.days)
    }
  }
  const links = Array.from(linkMap.entries()).map(([k, v]) => {
    const [source, target] = k.split('>').map(Number)
    return { source, target, value: round1(v) }
  })
  return { nodes, links }
}

function makeNode(onFocus: (kind: Kind, key?: string) => void, containerWidth: number) {
  return function SankeyNode(props: any) {
    const { x, y, width, height, payload } = props
    const right = x > containerWidth / 2
    const clickable = (payload?.kind === 'site' && payload?.key) || (payload?.kind === 'team' && payload?.key)
    return (
      <g style={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => clickable && onFocus(payload.kind, payload.key)}>
        <rect x={x} y={y} width={width} height={Math.max(height, 1)} rx={2} fill={payload?.color ?? MUTED} fillOpacity={0.92} />
        <text x={right ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={right ? 'end' : 'start'}
          dominantBaseline="middle" fontSize={11} fill={INK}>
          {payload?.name} <tspan fill={MUTED}>{Math.round(payload?.value ?? 0)}</tspan>
          {clickable && <tspan fill="#38b787"> ›</tspan>}
        </text>
      </g>
    )
  }
}

function SankeyLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props
  const color = payload?.target?.color ?? payload?.source?.color ?? MUTED
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeWidth={Math.max(linkWidth, 1)} strokeOpacity={0.3} />
  )
}

export default function ManDaySankey({ rows }: { rows: SankeyRow[] }) {
  const [focusSite, setFocusSite] = useState('')
  const [focusTeam, setFocusTeam] = useState('')

  const siteOpts = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) m.set(String(r.siteId), r.siteCode)
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const siteLabel = focusSite ? (rows.find(r => String(r.siteId) === focusSite)?.siteCode ?? '') : ''
  const graph = useMemo(() => buildGraph(rows, focusSite, focusTeam), [rows, focusSite, focusTeam])

  function onFocus(kind: Kind, key?: string) {
    if (kind === 'site' && key) { setFocusSite(key); setFocusTeam('') }
    else if (kind === 'team' && key) setFocusTeam(key)
  }

  const height = Math.min(Math.max(graph.nodes.length * 30 + 60, 340), 900)

  return (
    <div>
      {/* breadcrumb + jump */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <button onClick={() => { setFocusSite(''); setFocusTeam('') }}
          className={`rounded px-2 py-0.5 ${focusSite ? 'text-emerald-700 hover:bg-emerald-50' : 'bg-slate-100 font-medium text-slate-700'}`}>ทั้งหมด</button>
        {focusSite && <><span className="text-slate-300">›</span>
          <button onClick={() => setFocusTeam('')}
            className={`rounded px-2 py-0.5 ${focusTeam ? 'text-emerald-700 hover:bg-emerald-50' : 'bg-slate-100 font-medium text-slate-700'}`}>{siteLabel}</button></>}
        {focusTeam && <><span className="text-slate-300">›</span><span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{focusTeam}</span></>}
        <span className="ml-auto text-slate-400">
          {!focusSite ? 'คลิกไซต์เพื่อกางกลุ่มงาน' : !focusTeam ? 'คลิกกลุ่มงานเพื่อกางรายคน' : `รายคนของ ${focusTeam} @ ${siteLabel}`}
        </span>
        <select value={focusSite} onChange={e => { setFocusSite(e.target.value); setFocusTeam('') }}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:outline-none">
          <option value="">— กระโดดไปไซต์ —</option>
          {siteOpts.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
        </select>
      </div>

      {graph.links.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-300">ยังไม่มีข้อมูล man-day</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 560, height }}>
            <ResponsiveContainer width="100%" height="100%">
              <Sankey data={graph} nodePadding={16} nodeWidth={12} linkCurvature={0.5}
                margin={{ top: 10, right: 110, bottom: 10, left: 50 }}
                node={<NodeWrap onFocus={onFocus} />} link={<SankeyLink />}>
                <Tooltip formatter={(v) => [`${v} วัน-คน`, '']} />
              </Sankey>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// recharts clone node element ด้วย layout props → wrapper รับ containerWidth มาสร้าง node จริง
function NodeWrap(props: any) {
  const Node = makeNode(props.onFocus, props.containerWidth ?? 800)
  return <Node {...props} />
}
