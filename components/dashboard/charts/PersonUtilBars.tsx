'use client'

// Utilization รายคน — กราฟแท่งแนวตั้ง (ขนาดจริง + เลื่อนซ้าย-ขวา)
// บนหัวแท่ง: รูปพนักงานจริง (fallback วงกลม+อักษรแรก) + ชื่อเล่น — เกาะหัวแท่ง ไล่ระดับตามความสูง
// ล่างแท่ง: ตัวเลข Utilization (%)
import type { PersonUtilRow } from '@/lib/types'
import { utilHex, INK, MUTED } from '@/lib/chartTheme'

export default function PersonUtilBars({ people }: { people: PersonUtilRow[] }) {
  if (!people || people.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  const rows = people   // API เรียงมาก→น้อย + คัดเฉพาะทีมภาคสนามมาแล้ว
  const colW = 56, plotH = 230, avR = 17, barW = 30
  const plotTop = 60                         // เผื่อที่เหนือแท่งสูงสุดให้รูป+ชื่อ
  const baseline = plotTop + plotH           // ฐานแท่ง
  const numY = baseline + 18                 // ตัวเลข % ใต้ฐาน
  const W = rows.length * colW + 36
  const H = numY + 8
  const maxPct = Math.max(120, ...rows.map(r => r.utilPct))
  const yOf = (pct: number) => baseline - (pct / maxPct) * plotH

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Utilization รายคน">
        <defs>
          {rows.map(r => <clipPath key={r.employeeId} id={`av${r.employeeId}`}><circle cx={0} cy={0} r={avR} /></clipPath>)}
        </defs>
        {[80, 100].map(rl => {
          const yy = yOf(rl)
          return (
            <g key={rl}>
              <line x1={16} y1={yy} x2={W - 16} y2={yy} stroke="#cbd5e1" strokeDasharray="4 3" />
              <text x={W - 13} y={yy - 2} fontSize={10} fill={MUTED}>{rl}%</text>
            </g>
          )
        })}
        {rows.map((r, i) => {
          const cx = 24 + i * colW + colW / 2
          const bh = (r.utilPct / maxPct) * plotH
          const by = baseline - bh
          const nameBaseline = by - 6              // ชื่อเกาะหัวแท่ง
          const avCy = by - 6 - 14 - avR           // รูปเหนือชื่อ
          const name = r.nickname || r.fullName.split(' ')[1] || r.fullName
          const short = name.length > 7 ? name.slice(0, 7) : name
          return (
            <g key={r.employeeId}>
              {/* รูป + ชื่อ เกาะหัวแท่ง */}
              <g transform={`translate(${cx},${avCy})`}>
                <circle r={avR} fill="#e2e8f0" stroke="#cbd5e1" />
                <text y={4} textAnchor="middle" fontSize={13} fill="#94a3b8">{name.charAt(0)}</text>
                <image href={`/api/employees/${r.employeeId}/photo`} x={-avR} y={-avR} width={avR * 2} height={avR * 2}
                  clipPath={`url(#av${r.employeeId})`} preserveAspectRatio="xMidYMid slice" />
              </g>
              <text x={cx} y={nameBaseline} textAnchor="middle" fontSize={11} fill={INK}>{short}</text>
              {/* แท่ง */}
              <rect x={cx - barW / 2} y={by} width={barW} height={bh} rx={3} fill={utilHex(r.utilPct)}>
                <title>{r.fullName} · {r.primaryTeam} · Util {r.utilPct}% · {r.fieldDays} วัน</title>
              </rect>
              {/* ตัวเลข % ด้านล่าง */}
              <text x={cx} y={numY} textAnchor="middle" fontSize={12} fontWeight={700} fill={utilHex(r.utilPct)}>{r.utilPct}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
