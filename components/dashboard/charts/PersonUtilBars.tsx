'use client'

// Utilization รายคน — กราฟแท่งแนวตั้งเต็มความกว้าง (SVG scale พอดีจอเสมอ ไม่ scroll)
// ใต้แท่ง: รูปพนักงานจริง (fallback วงกลม+อักษรแรกถ้าโหลดรูปไม่ได้) + ชื่อเล่น
import type { PersonUtilRow } from '@/lib/types'
import { utilHex, INK, MUTED } from '@/lib/chartTheme'

export default function PersonUtilBars({ people }: { people: PersonUtilRow[] }) {
  if (!people || people.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  const rows = people   // API เรียงมาก→น้อย + คัดเฉพาะทีมภาคสนามมาแล้ว
  const colW = 44, plotH = 200, top = 22, nameH = 66, avR = 13
  const W = rows.length * colW + 30
  const H = top + plotH + nameH
  const maxPct = Math.max(120, ...rows.map(r => r.utilPct))
  const yOf = (pct: number) => top + plotH - (pct / maxPct) * plotH
  const barW = 22

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Utilization รายคน">
        <defs>
          {rows.map(r => <clipPath key={r.employeeId} id={`av${r.employeeId}`}><circle cx={0} cy={0} r={avR} /></clipPath>)}
        </defs>
        {[80, 100].map(rl => {
          const yy = yOf(rl)
          return (
            <g key={rl}>
              <line x1={16} y1={yy} x2={W - 16} y2={yy} stroke="#cbd5e1" strokeDasharray="4 3" />
              <text x={W - 13} y={yy - 2} fontSize={9} fill={MUTED}>{rl}%</text>
            </g>
          )
        })}
        {rows.map((r, i) => {
          const cx = 24 + i * colW + colW / 2
          const bh = (r.utilPct / maxPct) * plotH
          const by = top + plotH - bh
          const ay = top + plotH + 18
          const name = r.nickname || r.fullName.split(' ')[1] || r.fullName
          const short = name.length > 7 ? name.slice(0, 7) : name
          return (
            <g key={r.employeeId}>
              <text x={cx} y={by - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={utilHex(r.utilPct)}>{r.utilPct}</text>
              <rect x={cx - barW / 2} y={by} width={barW} height={bh} rx={3} fill={utilHex(r.utilPct)}>
                <title>{r.fullName} · {r.primaryTeam} · Util {r.utilPct}% · {r.fieldDays} วัน</title>
              </rect>
              <g transform={`translate(${cx},${ay})`}>
                <circle r={avR} fill="#e2e8f0" stroke="#cbd5e1" />
                <text y={3.5} textAnchor="middle" fontSize={11} fill="#94a3b8">{name.charAt(0)}</text>
                <image href={`/api/employees/${r.employeeId}/photo`} x={-avR} y={-avR} width={avR * 2} height={avR * 2}
                  clipPath={`url(#av${r.employeeId})`} preserveAspectRatio="xMidYMid slice" />
              </g>
              <text x={cx} y={ay + avR + 13} textAnchor="middle" fontSize={9} fill={INK}>{short}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
