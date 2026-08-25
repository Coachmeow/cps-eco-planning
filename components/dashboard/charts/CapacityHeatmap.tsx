'use client'

import { useState } from 'react'
import { SEQ_GREEN } from '@/lib/chartTheme'

type HeatTeam = { teamId: number; code: string; roster: { id: number; name: string }[] }
type HeatDay  = { date: string; isOff: boolean; bookedIds: number[]; conflict: boolean }
interface Props {
  heat?: { headcountTotal: number; teams: HeatTeam[]; days: HeatDay[] }
}

const thDW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const thM  = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// เฉดสีตาม heatmap แผนที่: วันปกติ = เขียวอ่อน→เข้ม (SEQ_GREEN) ; วันหยุด = แดงพาสเทลอ่อน→เข้ม
const ZERO = '#f1f5f9'
const ZERO_HOL = '#fceaea'
const SEQ_RED = ['#f9d5d5', '#f3b0b0', '#ec8a8a', '#e26565', '#d44545', '#bf2f2f']
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const STOPS = SEQ_GREEN.map(hexToRgb)
const STOPS_RED = SEQ_RED.map(hexToRgb)
function ramp(stops: [number, number, number][], zero: string, t: number): string {
  if (t <= 0) return zero
  const tt = Math.min(1, t)
  const p = tt * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(p))
  const f = p - i
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
const heat    = (t: number) => ramp(STOPS, ZERO, t)
const heatHol = (t: number) => ramp(STOPS_RED, ZERO_HOL, t)

export default function CapacityHeatmap({ heat: data }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; day: HeatDay } | null>(null)

  if (!data || data.days.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  }
  const { headcountTotal, teams, days } = data
  const todayKey = new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD ตาม local
  const firstDow = new Date(days[0].date + 'T00:00:00').getDay()
  // ปรับเฉดตามค่าสูงสุดของเดือน (relative) เหมือน heatmap แผนที่ → ใช้ช่วงสีเต็ม (รวมวันหยุดที่มีงานด้วย)
  const maxBooked = Math.max(1, ...days.map(d => d.bookedIds.length))

  return (
    <div>
      <div className="mx-auto grid w-[88%] grid-cols-7 gap-1.5">
        {thDW.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-semibold ${i === 0 ? 'text-red-400' : 'text-slate-400'}`}>{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad${i}`} className="aspect-[3/2]" />)}
        {days.map(day => {
          const booked = day.bookedIds.length
          const t = booked / maxBooked   // เฉดตามงานจริง (วันหยุด = โทนแดง, วันปกติ = โทนเขียว)
          const dnum = Number(day.date.slice(8, 10))
          const isToday = day.date === todayKey
          const ring = isToday ? 'ring-2 ring-inset ring-sky-500' : ''
          const dark = t >= 0.5
          return (
            <div
              key={day.date}
              onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, day })}
              onMouseMove={e => setTip(cur => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur))}
              onMouseLeave={() => setTip(null)}
              className={`relative flex aspect-[3/2] cursor-pointer items-start justify-end rounded-md p-1 transition-transform hover:scale-110 hover:outline hover:outline-2 hover:-outline-offset-1 hover:outline-slate-600 ${ring}`}
              style={{ background: day.isOff ? heatHol(t) : heat(t) }}
            >
              <span className={`text-[10px] font-semibold leading-none ${dark ? 'text-white/90' : 'text-slate-500/70'}`}>{dnum}</span>
            </div>
          )
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        <span>ว่าง</span>
        <span className="h-2.5 w-16 rounded" style={{ background: `linear-gradient(90deg, ${ZERO}, ${SEQ_GREEN[1]}, ${SEQ_GREEN[3]}, ${SEQ_GREEN[5]})` }} />
        <span>เต็ม</span>
        <span className="ml-1.5 inline-block h-2.5 w-2.5 rounded" style={{ background: SEQ_RED[2] }} />
        <span>วันหยุด</span>
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
  const left = Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 285)
  const top  = Math.min(y + 14, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240)

  return (
    <div
      className="pointer-events-none fixed z-50 min-w-[220px] max-w-[270px] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
      style={{ left, top }}
    >
      <div className="font-bold text-slate-900">{dt.getDate()} {thM[dt.getMonth() + 1]} {dt.getFullYear() + 543} ({thDW[dt.getDay()]}){day.isOff && <span className="ml-1 text-[10.5px] font-semibold text-red-500">· วันหยุด</span>}</div>
      {(
        <>
          <div className="mb-1.5 text-[11px] font-medium text-blue-600">ภาพรวม จอง {booked}/{headcountTotal} คน ({pct}%)</div>
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
