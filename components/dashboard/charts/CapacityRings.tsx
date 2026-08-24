'use client'

// แผงกำลังคน (แทนเลข "Man-day รวม" เดิมข้างชาร์ต Sankey)
//  บน: Man-day ใช้ / กำลังคน (booked / capacity)
//  ล่าง: วงแหวน utilization ต่อทีม 5 หมวดงาน — ชื่อโค้งบน · % กลาง · "ใช้ of capacity" โค้งล่าง
//        badge หัวเส้น: ≤100% = สีทีมเข้มขึ้น "-เหลือ" · เกิน 100% = แดง "+เกิน"
import type { TeamCapacityRow } from '@/lib/types'
import { teamHex } from '@/lib/chartTheme'

// ชื่อเต็มของสายงาน (โชว์กลางวง)
const FULL: Record<string, string> = { CEMS: 'CEMS', WT: 'Water', ST: 'Stack', WP: 'Workplace', AMB: 'Ambient' }
const ORDER = ['CEMS', 'WT', 'ST', 'WP', 'AMB']

// เข้มสีขึ้นอีกเฉด (สำหรับ badge ตอนยังไม่เกิน 100%)
function darken(hex: string, f: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.round(((n >> 16) & 255) * (1 - f))
  const g = Math.round(((n >> 8) & 255) * (1 - f))
  const b = Math.round((n & 255) * (1 - f))
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

const S = 164, SW = 28, R = (S - SW) / 2, C = S / 2, CIRC = 2 * Math.PI * R, BR = 15, RT = 40
const P = (a: number): [number, number] => [C + RT * Math.cos((a * Math.PI) / 180), C + RT * Math.sin((a * Math.PI) / 180)]

function Ring({ t }: { t: TeamCapacityRow }) {
  const name = FULL[t.teamCode] ?? t.teamCode
  const col = teamHex(t.teamCode)
  const pct = t.usedPct
  const frac = Math.min(pct, 100) / 100
  const isOver = t.booked > t.capacity
  const rem = Math.round(t.capacity - t.booked)
  const over = Math.round(t.booked - t.capacity)
  const badgeCol = isOver ? '#dc2626' : darken(col, 0.3)
  const badgeTxt = isOver ? `+${over}` : `-${rem}`
  const rad = ((frac * 360 - 90) * Math.PI) / 180
  const bx = C + R * Math.cos(rad), by = C + R * Math.sin(rad)
  const dash = frac * CIRC
  const [tlx, tly] = P(216), [trx, trY] = P(324)
  const [blx, bly] = P(150), [brx, brY] = P(30)
  const tid = `at-${t.teamCode}`, bid = `ab-${t.teamCode}`

  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={`${name} ใช้ ${pct}% (${Math.round(t.booked)} จาก ${t.capacity})`}>
      <defs>
        <path id={tid} d={`M ${tlx} ${tly} A ${RT} ${RT} 0 0 1 ${trx} ${trY}`} fill="none" />
        <path id={bid} d={`M ${blx} ${bly} A ${RT} ${RT} 0 0 0 ${brx} ${brY}`} fill="none" />
      </defs>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#e6ebf1" strokeWidth={SW} />
      <circle cx={C} cy={C} r={R} fill="none" stroke={col} strokeWidth={SW} strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRC - dash}`} transform={`rotate(-90 ${C} ${C})`} />
      <text fontSize={13} fontWeight={500} fill="#64748b" letterSpacing="0.3">
        <textPath href={`#${tid}`} startOffset="50%" textAnchor="middle">{name}</textPath>
      </text>
      <text x={C} y={C - 1} textAnchor="middle" dominantBaseline="central" fontSize={31} fontWeight={700}
        fill={isOver ? '#dc2626' : '#1e293b'} fontFamily="var(--font-mono)">{pct}%</text>
      <text fontSize={11.5} fill="#94a3b8" fontFamily="var(--font-mono)">
        <textPath href={`#${bid}`} startOffset="50%" textAnchor="middle">{Math.round(t.booked)} of {t.capacity}</textPath>
      </text>
      <circle cx={bx} cy={by} r={BR} fill={badgeCol} />
      <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fontWeight={700}
        fill="#fff" fontFamily="var(--font-mono)">{badgeTxt}</text>
    </svg>
  )
}

export default function CapacityRings({ rows }: { rows: TeamCapacityRow[] }) {
  const byCode = new Map(rows.map((r) => [r.teamCode, r]))
  const rings = ORDER.map((c) => byCode.get(c)).filter((r): r is TeamCapacityRow => !!r && r.capacity > 0)
  const totCap = rings.reduce((s, t) => s + t.capacity, 0)
  const totBk = rings.reduce((s, t) => s + t.booked, 0)
  const totPct = totCap > 0 ? Math.round((totBk / totCap) * 100) : 0
  const top = rings.slice(0, 2), bot = rings.slice(2)

  return (
    <div>
      <div className="text-xs text-slate-400">Man-day ใช้ / กำลังคน (วัน-คน)</div>
      <div className="mb-5 mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-[44px] font-bold leading-none text-slate-800">{Math.round(totBk)}</span>
        <span className="font-mono text-3xl font-normal leading-none text-slate-300">/</span>
        <span className="font-mono text-3xl font-medium leading-none text-slate-500">{totCap}</span>
        <span className="ml-auto text-[13px] text-slate-500">{totPct}% ใช้ไป</span>
      </div>
      <div className="mb-4 flex flex-wrap justify-center gap-6">
        {top.map((t) => <Ring key={t.teamCode} t={t} />)}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {bot.map((t) => <Ring key={t.teamCode} t={t} />)}
      </div>
    </div>
  )
}
