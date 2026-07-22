'use client'

import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useVehicleCalendar } from '@/hooks/useVehicleCalendar'
import { useMe } from '@/hooks/useMe'
import { useHolidays } from '@/hooks/useHolidays'
import { canPlan } from '@/lib/roles'
import { toDateKey } from '@/lib/dateKey'
import type { Vehicle, VehicleBooking } from '@/lib/types'
import VehicleCell from './VehicleCell'
import VehiclePopup from './VehiclePopup'

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) days.push(new Date(year, month - 1, d))
  return days
}

const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thaiDays   = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// legend สีทีม (โทนเดียวกับปุ่มกรองทีมในแผนพนักงาน) — ดูอย่างเดียว
const TEAM_LEGEND: [string, string][] = [
  ['ST', 'bg-blue-100 text-blue-700'], ['AMB', 'bg-teal-100 text-teal-700'],
  ['WP', 'bg-purple-100 text-purple-700'], ['WT', 'bg-cyan-100 text-cyan-700'],
  ['CEMS', 'bg-orange-100 text-orange-700'], ['LOG', 'bg-gray-100 text-gray-600'],
]

export default function VehicleCalendar() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [popup, setPopup] = useState<{ vehicle: Vehicle; dateKey: string; initialDays?: number } | null>(null)
  const [rangeStart, setRangeStart] = useState<{ rowId: number; idx: number; dateKey: string } | null>(null)
  const [rangeHover, setRangeHover] = useState<number | null>(null)

  const { vehicles, calendarData, conflicts, sites, employees, loading, addBooking, removeBooking, moveBooking } =
    useVehicleCalendar(year, month)
  const { role } = useMe()
  const canEdit = canPlan(role)
  const { holidaySet, holidayMap } = useHolidays()

  const days = useMemo(() => getDaysInMonth(year, month), [year, month])

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  // คลิกช่อง: มีจองแล้ว → เปิด popup ทันที ; ช่องว่าง → คลิก 1 = วันเริ่ม, คลิก 2 (แถวเดิม) = วันสิ้นสุด
  function handleCellClick(v: Vehicle, idx: number, dateKey: string, hasBooking: boolean) {
    if (!canEdit || hasBooking) { setRangeStart(null); setRangeHover(null); setPopup({ vehicle: v, dateKey }); return }
    if (!rangeStart || rangeStart.rowId !== v.id) { setRangeStart({ rowId: v.id, idx, dateKey }); setRangeHover(idx); return }
    const lo = Math.min(rangeStart.idx, idx), hi = Math.max(rangeStart.idx, idx)
    setPopup({ vehicle: v, dateKey: toDateKey(days[lo]), initialDays: hi - lo + 1 })
    setRangeStart(null); setRangeHover(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRangeStart(null); setRangeHover(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setRangeStart(null); setRangeHover(null) }, [year, month])

  function renderRowCells(v: Vehicle): ReactNode[] {
    const dayMap = calendarData.get(v.id)
    const cells: ReactNode[] = []
    let i = 0
    while (i < days.length) {
      const day = days[i]
      const dateKey = toDateKey(day)
      const dayBookings: VehicleBooking[] = dayMap?.get(dateKey) ?? []
      const parent = dayBookings.find(b => b.parentId == null && Number(b.estimatedDays) >= 2)
      let span = 1
      if (parent) {
        while (i + span < days.length) {
          const next = dayMap?.get(toDateKey(days[i + span])) ?? []
          if (!next.some(b => b.parentId === parent.id)) break
          span++
        }
      }
      let isConflict = false
      for (let k = 0; k < span; k++) {
        if (conflicts.has(`${v.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
      }
      const idx = i
      const rowActive = rangeStart?.rowId === v.id
      const isStart   = rowActive && rangeStart!.idx === idx
      const inRange   = rowActive && rangeHover != null && dayBookings.length === 0 &&
                        idx >= Math.min(rangeStart!.idx, rangeHover) && idx <= Math.max(rangeStart!.idx, rangeHover)
      cells.push(
        <VehicleCell key={dateKey} bookings={dayBookings} isConflict={isConflict}
          dayOfWeek={day.getDay()} isHoliday={holidaySet.has(dateKey)} colSpan={span}
          isRangeStart={isStart} inRange={inRange && !isStart}
          onMouseEnter={rowActive ? () => setRangeHover(idx) : undefined}
          onClick={() => handleCellClick(v, idx, dateKey, dayBookings.length > 0)} />
      )
      i += span
    }
    return cells
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">🚗 แผนใช้รถ</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year + 543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        {conflicts.size > 0 && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">⚠ {conflicts.size} conflict</span>
        )}
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-slate-400">สีทีมที่ใช้รถ:</span>
          {TEAM_LEGEND.map(([code, cls]) => (
            <span key={code} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{code}</span>
          ))}
          <span className="ml-1 text-[10px] text-slate-400">· ไม่ระบุคนขับ = สีตามประเภท</span>
        </div>
      </div>

      {rangeStart && (
        <div className="flex items-center gap-2 border-b border-sky-200 bg-sky-50 px-6 py-1.5 text-xs text-sky-700">
          <span className="font-medium">📍 เลือกวันเริ่ม {new Date(rangeStart.dateKey + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} แล้ว</span>
          <span className="text-sky-500">— คลิกวันสิ้นสุดในแถวเดียวกัน (คลิกช่องเดิม = 1 วัน)</span>
          <button onClick={() => { setRangeStart(null); setRangeHover(null) }} className="ml-auto rounded px-2 py-0.5 text-sky-600 hover:bg-sky-100">ยกเลิก (Esc)</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">ยังไม่มีรถในระบบ — เพิ่มได้ที่ จัดการ → 🚗 รถ</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">รถ</th>
                {days.map(day => {
                  const dow = day.getDay()
                  const key = toDateKey(day)
                  const isToday = key === toDateKey(today)
                  const holName = holidayMap.get(key)
                  const dayCls = holName ? 'bg-violet-50 text-violet-500' : dow === 0 ? 'bg-red-50 text-red-400' : 'text-slate-600'
                  return (
                    <th key={key} title={holName ?? undefined} className={`min-w-[56px] border-b border-r border-slate-300 px-1 py-1 text-center font-medium ${dayCls} ${isToday ? '!bg-sky-50 !text-sky-600' : ''}`}>
                      <div>{day.getDate()}</div>
                      <div className="text-[10px] font-normal opacity-70">{holName ? '⛱' : thaiDays[dow]}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/50">
                  <td className="sticky left-0 z-10 border-b border-b-slate-400 border-r border-r-slate-200 bg-white px-3 py-1.5">
                    <div className="font-medium text-slate-700">{v.licensePlate}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{[v.name, v.vehicleType].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  {renderRowCells(v)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {popup && (
        <VehiclePopup
          key={`${popup.vehicle.id}-${popup.dateKey}`}
          vehicle={popup.vehicle} date={popup.dateKey} initialDays={popup.initialDays}
          bookings={calendarData.get(popup.vehicle.id)?.get(popup.dateKey) ?? []}
          vehicleBookings={Array.from(calendarData.get(popup.vehicle.id)?.values() ?? []).flat()}
          sites={sites} employees={employees} canEdit={canEdit}
          onSave={addBooking} onDelete={removeBooking} onMove={moveBooking} onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}
