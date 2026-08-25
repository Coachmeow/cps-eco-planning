'use client'

import { useState } from 'react'

type HeatTeam = { teamId: number; code: string; roster: { id: number; name: string }[] }
type HeatDay  = { date: string; isOff: boolean; bookedIds: number[]; conflict: boolean }
interface Props {
  heat?: { headcountTotal: number; teams: HeatTeam[]; days: HeatDay[] }
}

const thDW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
// สีเข้ากับการ์ดอื่น: จาง(ว่าง) → เขียว → เหลือง → แดง(เต็ม) ; เกณฑ์เดียวกับแท่ง Capacity เดิม (70/90)
const CELL = [
  'bg-slate-50 border border-slate-100',   // 0 ว่างทั้งหมด
  'bg-emerald-200',                         // 1–39
  'bg-green-400',                           // 40–69
  'bg-amber-400',                           // 70–89
  'bg-red-400',                             // 90+
]
function lvl(p: number): number {
  if (p <= 0) return 0
  if (p < 40) return 1
  if (p < 70) return 2
  if (p < 90) return 3
  return 4
}
const HATCH = 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 3px,#e5eaf0 3px,#e5eaf0 6px)'
const thM = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export default function CapacityHeatmap({ heat }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; day: HeatDay } | null>(null)

  if (!heat || heat.days.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  }
  const { headcountTotal, teams, days } = heat
  const todayKey = new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD ตาม local
  const firstDow = new Date(days[0].date + 'T00:00:00').getDay()

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {thDW.map((d, i) => (
          <div key={d} className={`pb-0.5 text-center text-[10px] font-semibold ${i === 0 ? 'text-red-400' : 'text-slate-400'}`}>{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad${i}`} />)}
        {days.map(day => {
          const booked = day.bookedIds.length
          const pct = day.isOff || headcountTotal === 0 ? 0 : Math.round((booked / headcountTotal) * 100)
          const dnum = Number(day.date.slice(8, 10))
          const isToday = day.date === todayKey
          const ring = day.conflict ? 'ring-2 ring-inset ring-red-600'
                     : isToday      ? 'ring-2 ring-inset ring-sky-500' : ''
          return (
            <div
              key={day.date}
              onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, day })}
              onMouseMove={e => setTip(t => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
              onMouseLeave={() => setTip(null)}
              className={`relative flex aspect-square cursor-pointer items-start justify-end rounded-md p-0.5 transition-transform hover:scale-110 hover:outline hover:outline-2 hover:-outline-offset-1 hover:outline-slate-700 ${day.isOff ? '' : CELL[lvl(pct)]} ${ring}`}
              style={day.isOff ? { background: HATCH } : undefined}
            >
              <span className={`text-[9px] font-semibold ${lvl(pct) >= 2 && !day.isOff ? 'text-slate-800/70' : 'text-slate-500/60'}`}>{dnum}</span>
            </div>
          )
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        <span>ว่าง</span>
        {CELL.map((c, i) => (
          <span key={i} className={`inline-block h-3 w-3 rounded ${c}`} />
        ))}
        <span>เต็ม</span>
        <span className="ml-1.5 inline-block h-3 w-3 rounded" style={{ background: HATCH }} />
        <span>วันหยุด</span>
        <span className="ml-1.5 inline-block h-3 w-3 rounded bg-red-400 ring-2 ring-inset ring-red-600" />
        <span>จองซ้อน</span>
      </div>

      {tip && <Tooltip x={tip.x} y={tip.y} day={tip.day} teams={teams} headcountTotal={headcountTotal} />}
    </div>
  )
}

function Tooltip({ x, y, day, teams, headcountTotal }: { x: number; y: number; day: HeatDay; teams: HeatTeam[]; headcountTotal: number }) {
  const dt = new Date(day.date + 'T00:00:00')
  const bookedSet = new Set(day.bookedIds)
  const booked = day.bookedIds.length
  const pct = headcountTotal === 0 ? 0 : Math.round((booked / headcountTotal) * 100)
  // วางกล่องไม่ให้ล้นจอ
  const left = Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 285)
  const top  = Math.min(y + 14, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240)

  return (
    <div
      className="pointer-events-none fixed z-50 min-w-[220px] max-w-[270px] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
      style={{ left, top }}
    >
      <div className="font-bold text-slate-900">{dt.getDate()} {thM[dt.getMonth() + 1]} {dt.getFullYear() + 543} ({thDW[dt.getDay()]})</div>
      {day.isOff ? (
        <div className="text-[11px] text-slate-400">วันหยุด — ไม่มีงาน</div>
      ) : (
        <>
          <div className="mb-1.5 text-[11px] font-medium text-blue-600">ภาพรวม จอง {booked}/{headcountTotal} คน ({pct}%){day.conflict && ' · มีจองซ้อน'}</div>
          {teams.map(t => {
            const free = t.roster.filter(r => !bookedSet.has(r.id))
            return (
              <div key={t.teamId} className="flex items-baseline gap-1.5 border-t border-slate-100 py-0.5">
                <span className="w-9 flex-shrink-0 text-[10.5px] font-bold text-slate-500">{t.code}</span>
                {free.length === 0 ? (
                  <span className="text-[11px] text-red-500">เต็ม</span>
                ) : (
                  <span>
                    <span className="text-[11px] font-semibold text-green-600">ว่าง {free.length}</span>{' '}
                    <span className="text-[10.5px] text-slate-400">{free.slice(0, 4).map(f => f.name).join(', ')}{free.length > 4 ? ' …' : ''}</span>
                  </span>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
