'use client'

// Sankey man-day: รวม → ไซต์ → กลุ่มงาน → คน
// รับ rows ละเอียด (ไซต์×ทีม×คน) แล้วสร้าง node/link เอง + Top-N + bucket "อื่นๆ" + กรองไซต์
// ใช้ recharts <Sankey> ; ถ้าไม่สวยพอค่อยย้าย d3-sankey ภายหลัง
import { useMemo } from 'react'
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import { teamHex, siteHex, INK, MUTED } from '@/lib/chartTheme'

export interface SankeyRow {
  siteId: number; siteCode: string; siteColor: string
  teamCode: string; personId: number; personLabel: string; days: number
}

const N_SITES = 8, N_PEOPLE = 12
const round1 = (n: number) => Math.round(n * 10) / 10

interface Node { name: string; color: string; kind: 'total' | 'site' | 'team' | 'person' }

function buildGraph(rows: SankeyRow[]) {
  // Top-N จากผลรวม (global) ; ที่เหลือ → bucket
  const siteSum = new Map<number, number>()
  const persSum = new Map<number, number>()
  for (const r of rows) {
    siteSum.set(r.siteId, (siteSum.get(r.siteId) ?? 0) + r.days)
    persSum.set(r.personId, (persSum.get(r.personId) ?? 0) + r.days)
  }
  const topSites = new Set(Array.from(siteSum.entries()).sort((a, b) => b[1] - a[1]).slice(0, N_SITES).map(([id]) => id))
  const topPers  = new Set(Array.from(persSum.entries()).sort((a, b) => b[1] - a[1]).slice(0, N_PEOPLE).map(([id]) => id))

  const siteMeta = new Map<number, { code: string; color: string }>()
  const persMeta = new Map<number, string>()
  for (const r of rows) { siteMeta.set(r.siteId, { code: r.siteCode, color: r.siteColor }); persMeta.set(r.personId, r.personLabel) }

  const nodes: Node[] = []
  const idx = new Map<string, number>()
  const nodeId = (key: string, make: () => Node) => {
    if (!idx.has(key)) { idx.set(key, nodes.length); nodes.push(make()) }
    return idx.get(key)!
  }
  const total = nodeId('total', () => ({ name: 'รวม', color: '#64748b', kind: 'total' }))
  const siteKey = (r: SankeyRow) => topSites.has(r.siteId) ? `site:${r.siteId}` : 'site:other'
  const persKey = (r: SankeyRow) => topPers.has(r.personId) ? `pers:${r.personId}` : 'pers:other'
  const siteNode = (r: SankeyRow) => nodeId(siteKey(r), () => topSites.has(r.siteId)
    ? { name: siteMeta.get(r.siteId)!.code, color: siteHex(siteMeta.get(r.siteId)!.color), kind: 'site' }
    : { name: 'ไซต์อื่นๆ', color: '#cbd5e1', kind: 'site' })
  const teamNode = (r: SankeyRow) => nodeId(`team:${r.teamCode}`, () => ({ name: r.teamCode, color: teamHex(r.teamCode), kind: 'team' }))
  const persNode = (r: SankeyRow) => nodeId(persKey(r), () => topPers.has(r.personId)
    ? { name: persMeta.get(r.personId)!, color: '#38b787', kind: 'person' }
    : { name: 'อื่นๆ', color: '#a7d9c3', kind: 'person' })

  // รวม value ต่อคู่ (source→target) จาก rows เดียวกัน → man-day อนุรักษ์ทุกชั้น
  const linkMap = new Map<string, number>()
  const addLink = (s: number, t: number, v: number) => linkMap.set(`${s}>${t}`, (linkMap.get(`${s}>${t}`) ?? 0) + v)
  for (const r of rows) {
    const s = siteNode(r), tm = teamNode(r), p = persNode(r)
    addLink(total, s, r.days)
    addLink(s, tm, r.days)
    addLink(tm, p, r.days)
  }
  const links = Array.from(linkMap.entries()).map(([k, v]) => {
    const [source, target] = k.split('>').map(Number)
    return { source, target, value: round1(v) }
  })
  return { nodes, links }
}

// ── custom renderers ──
function SankeyNode(props: any) {
  const { x, y, width, height, payload, containerWidth } = props
  const right = x > containerWidth / 2
  const v = Math.round(payload?.value ?? 0)
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} rx={2} fill={payload?.color ?? MUTED} fillOpacity={0.92} />
      <text x={right ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={right ? 'end' : 'start'}
        dominantBaseline="middle" fontSize={11} fill={INK}>
        {payload?.name} <tspan fill={MUTED}>{v}</tspan>
      </text>
    </g>
  )
}

function SankeyLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props
  const color = payload?.target?.color ?? payload?.source?.color ?? MUTED
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeWidth={Math.max(linkWidth, 1)} strokeOpacity={0.3}
    />
  )
}

export default function ManDaySankey({ rows, siteFilter }: { rows: SankeyRow[]; siteFilter?: string }) {
  const filtered = useMemo(
    () => siteFilter ? rows.filter(r => String(r.siteId) === siteFilter) : rows,
    [rows, siteFilter],
  )
  const graph = useMemo(() => buildGraph(filtered), [filtered])

  if (graph.links.length === 0) return <p className="py-10 text-center text-sm text-slate-300">ยังไม่มีข้อมูล man-day ในเดือนนี้</p>

  const cols = 4
  const perCol = Math.max(1, Math.ceil(graph.nodes.length / cols))
  const height = Math.min(Math.max(perCol * 34 + 40, 360), 900)

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 680, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={graph}
            nodePadding={14}
            nodeWidth={12}
            linkCurvature={0.5}
            margin={{ top: 8, right: 90, bottom: 8, left: 40 }}
            node={<SankeyNode />}
            link={<SankeyLink />}
          >
            <Tooltip formatter={(v) => [`${v} วัน-คน`, '']} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
