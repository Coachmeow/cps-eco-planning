'use client'

import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useEquipmentCalendar } from '@/hooks/useEquipmentCalendar'
import { useMe } from '@/hooks/useMe'
import { useHolidays } from '@/hooks/useHolidays'
import { canPlan } from '@/lib/roles'
import { countWorkdays, calcUtil } from '@/lib/workdays'
import { toDateKey } from '@/lib/dateKey'
import EquipmentCell from './EquipmentCell'
import EquipmentPopup from './EquipmentPopup'
import ExportButton from '@/components/ExportButton'
import type { Equipment, EquipmentType, EquipmentAssignment } from '@/lib/types'

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) days.push(new Date(year, month - 1, d))
  return days
}
function utilColor(pct: number): string {
  if (pct >= 80) return 'text-red-600 font-semibold'
  if (pct >= 50) return 'text-amber-600 font-semibold'
  if (pct > 0)   return 'text-emerald-700 font-medium'
  return 'text-slate-300'
}

const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const thaiDays   = ['อา','จ','อ','พ','พฤ','ศ','ส']

export default function EquipmentCalendar() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [showRental, setShowRental] = useState(true)
  const [popup, setPopup] = useState<{ equipment: Equipment; dateKey: string; initialDays?: number } | null>(null)
  // เลือกช่วงวันแบบ 2 คลิก (คลิกวันเริ่ม → วันสิ้นสุด แถวเดียวกัน)
  const [rangeStart, setRangeStart] = useState<{ rowId: number; idx: number; dateKey: string } | null>(null)
  const [rangeHover, setRangeHover] = useState<number | null>(null)

  const { equipment, eqTypes, calendarData, conflicts, sites, loading, addAssignments, removeAssignment } =
    useEquipmentCalendar(year, month, selectedTypeId)
  const { role } = useMe()
  const canEdit = canPlan(role)

  const { holidaySet, holidayMap } = useHolidays()
  const days     = useMemo(() => getDaysInMonth(year, month), [year, month])
  const workdays = countWorkdays(year, month, holidaySet)

  const grouped = useMemo(() => {
    const map = new Map<number, { type: EquipmentType; items: Equipment[] }>()
    for (const eq of equipment) {
      if (!showRental && eq.isRental) continue
      if (!map.has(eq.typeId)) map.set(eq.typeId, { type: eq.type, items: [] })
      map.get(eq.typeId)!.items.push(eq)
    }
    return Array.from(map.values())
  }, [equipment, showRental])

  // ── ช่วงส่งซ่อม/Cal ที่ครอบวันในเดือนนี้ → แถบ "ส่งซ่อม/ส่งแคล" ในตาราง ──
  const [maintEvents, setMaintEvents] = useState<{ equipmentId: number; type: 'REPAIR' | 'CALIBRATION'; sentDate: string; expectedDate: string | null; returnedDate: string | null }[]>([])
  useEffect(() => {
    fetch('/api/equipment-events?status=all')
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setMaintEvents(Array.isArray(rows) ? rows.map((e: { equipmentId: number; type: 'REPAIR' | 'CALIBRATION'; sentDate: string; expectedDate: string | null; returnedDate: string | null }) => ({ equipmentId: e.equipmentId, type: e.type, sentDate: e.sentDate, expectedDate: e.expectedDate, returnedDate: e.returnedDate })) : []))
      .catch(() => setMaintEvents([]))
  }, [year, month])

  const maintDayMap = useMemo(() => {
    const map = new Map<number, Map<string, 'REPAIR' | 'CALIBRATION'>>()
    if (days.length === 0) return map
    const mStart = toDateKey(days[0]), mEnd = toDateKey(days[days.length - 1])
    for (const ev of maintEvents) {
      const s0 = ev.sentDate.slice(0, 10)
      const e0 = (ev.returnedDate ?? ev.expectedDate ?? mEnd).slice(0, 10)
      const s = s0 < mStart ? mStart : s0
      const e = e0 > mEnd ? mEnd : e0
      if (s > e) continue
      if (!map.has(ev.equipmentId)) map.set(ev.equipmentId, new Map())
      const m = map.get(ev.equipmentId)!
      for (const d of days) {
        const k = toDateKey(d)
        if (k >= s && k <= e && !m.has(k)) m.set(k, ev.type)
      }
    }
    return map
  }, [maintEvents, days])

  function prevMonth() { if (month === 1) { setYear(y => y-1); setMonth(12) } else setMonth(m => m-1) }
  function nextMonth() { if (month === 12) { setYear(y => y+1); setMonth(1) } else setMonth(m => m+1) }

  // คลิกช่อง: มีจองแล้ว → เปิด popup ทันที ; ช่องว่าง → คลิก 1 = วันเริ่ม, คลิก 2 (แถวเดิม) = วันสิ้นสุด
  function handleCellClick(eq: Equipment, idx: number, dateKey: string, hasBooking: boolean) {
    if (!canEdit || hasBooking) { setRangeStart(null); setRangeHover(null); setPopup({ equipment: eq, dateKey }); return }
    if (!rangeStart || rangeStart.rowId !== eq.id) { setRangeStart({ rowId: eq.id, idx, dateKey }); setRangeHover(idx); return }
    const lo = Math.min(rangeStart.idx, idx), hi = Math.max(rangeStart.idx, idx)
    setPopup({ equipment: eq, dateKey: toDateKey(days[lo]), initialDays: hi - lo + 1 })
    setRangeStart(null); setRangeHover(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRangeStart(null); setRangeHover(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setRangeStart(null); setRangeHover(null) }, [year, month, selectedTypeId, showRental])

  // สร้างช่องของแต่ละแถว — งานหลายวัน (ตัวแม่ estimatedDays>=2) merge เป็นช่องเดียวด้วย colSpan
  function renderRowCells(eq: Equipment): ReactNode[] {
    const dayMap = calendarData.get(eq.id)
    const cells: ReactNode[] = []
    let i = 0
    while (i < days.length) {
      const day       = days[i]
      const dateKey   = toDateKey(day)
      const dayAssign: EquipmentAssignment[] = dayMap?.get(dateKey) ?? []

      // ช่องว่างที่อยู่ในช่วงส่งซ่อม/Cal → แถบ maint (merge วันติดกันชนิดเดียวกัน)
      if (dayAssign.length === 0) {
        const mk = maintDayMap.get(eq.id)?.get(dateKey)
        if (mk) {
          let mspan = 1
          while (i + mspan < days.length) {
            const nk = toDateKey(days[i + mspan])
            if ((dayMap?.get(nk)?.length ?? 0) > 0) break
            if (maintDayMap.get(eq.id)?.get(nk) !== mk) break
            mspan++
          }
          cells.push(
            <EquipmentCell key={dateKey} assignments={[]} isConflict={false}
              dayOfWeek={day.getDay()} isHoliday={holidaySet.has(dateKey)} colSpan={mspan}
              team={eq.type.primaryTeam?.code ?? 'ST'} maint={mk}
              onClick={() => { setRangeStart(null); setRangeHover(null); setPopup({ equipment: eq, dateKey }) }}
            />
          )
          i += mspan
          continue
        }
      }

      const parent = dayAssign.find(a => a.parentId == null && Number(a.estimatedDays) >= 2)
      let span = 1
      if (parent) {
        while (i + span < days.length) {
          const next = dayMap?.get(toDateKey(days[i + span])) ?? []
          if (!next.some(a => a.parentId === parent.id)) break
          span++
        }
      }

      let isConflict = false
      for (let k = 0; k < span; k++) {
        if (conflicts.equipmentConflicts.has(`${eq.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
      }

      const idx = i
      const rowActive = rangeStart?.rowId === eq.id
      const isStart   = rowActive && rangeStart!.idx === idx
      const inRange   = rowActive && rangeHover != null && dayAssign.length === 0 &&
                        idx >= Math.min(rangeStart!.idx, rangeHover) && idx <= Math.max(rangeStart!.idx, rangeHover)
      cells.push(
        <EquipmentCell
          key={dateKey} assignments={dayAssign} isConflict={isConflict}
          dayOfWeek={day.getDay()} isHoliday={holidaySet.has(dateKey)} colSpan={span}
          team={eq.type.primaryTeam?.code ?? 'ST'}
          isRangeStart={isStart} inRange={inRange && !isStart}
          onMouseEnter={rowActive ? () => setRangeHover(idx) : undefined}
          onClick={() => handleCellClick(eq, idx, dateKey, dayAssign.length > 0)}
        />
      )
      i += span
    }
    return cells
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">🔧 แผนเครื่องมือ</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year+543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">{workdays} วันทำงาน</span>
        {conflicts.equipmentConflicts.size > 0 && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">⚠ {conflicts.equipmentConflicts.size} conflict</span>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showRental} onChange={(e) => setShowRental(e.target.checked)} className="rounded" />
            แสดงเครื่องเช่า
          </label>
          <select value={selectedTypeId ?? ''} onChange={(e) => setSelectedTypeId(e.target.value ? parseInt(e.target.value) : null)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:outline-none">
            <option value="">ทุกประเภท</option>
            {eqTypes.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </select>
          <ExportButton href={`/api/export/equipment?year=${year}&month=${month}`} label="Export Excel" />
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
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">เครื่องมือ</th>
                {days.map((day) => {
                  const dow = day.getDay()
                  const key = toDateKey(day)
                  const isToday = key === toDateKey(today)
                  const holName = holidayMap.get(key)
                  const dayCls = holName ? 'bg-violet-50 text-violet-500'
                               : dow === 0 ? 'bg-red-50 text-red-400' : 'text-slate-600'
                  return (
                    <th key={key} title={holName ?? undefined} className={`min-w-[56px] border-b border-r border-slate-300 px-1 py-1 text-center font-medium ${dayCls} ${isToday ? '!bg-sky-50 !text-sky-600' : ''}`}>
                      <div>{day.getDate()}</div>
                      <div className="text-[10px] font-normal opacity-70">{holName ? '⛱' : thaiDays[dow]}</div>
                    </th>
                  )
                })}
                <th className="min-w-[60px] border-b border-slate-200 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-600">Util %</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ type, items }) => (
                <>
                  {!selectedTypeId && (
                    <tr key={`group-${type.id}`}>
                      <td colSpan={days.length + 2} className="border-b border-t border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {type.code} — {type.name}
                        <span className="ml-2 font-normal text-slate-400">({items.filter((e) => !e.isRental).length} เครื่อง{items.some((e) => e.isRental) && ` + ${items.filter((e) => e.isRental).length} เช่า`})</span>
                      </td>
                    </tr>
                  )}
                  {items.map((eq) => {
                    const dayMap = calendarData.get(eq.id) ?? new Map()
                    const assignedDays = Array.from(dayMap.values()).filter((l) => l.length > 0).length
                    const util = calcUtil(assignedDays, workdays)
                    return (
                      <tr key={eq.id} className="hover:bg-slate-50/50">
                        <td className="sticky left-0 z-10 border-b border-b-slate-400 border-r border-r-slate-200 bg-white px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-700">{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</span>
                            {eq.isRental && <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-600">เช่า</span>}
                            {eq.status === 'CALIBRATING' && <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] text-purple-500">Cal</span>}
                            {eq.status === 'BROKEN' && <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-600">เสีย</span>}
                          </div>
                          {eq.serialNo && eq.internalNo && <div className="text-[10px] text-slate-400">{eq.serialNo}</div>}
                        </td>
                        {renderRowCells(eq)}
                        <td className={`border-b border-b-slate-400 px-2 text-center ${utilColor(util)}`}>{assignedDays > 0 ? `${util}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {popup && (
        <EquipmentPopup
          key={`${popup.equipment.id}-${popup.dateKey}`}
          equipment={popup.equipment} date={popup.dateKey} initialDays={popup.initialDays}
          assignments={calendarData.get(popup.equipment.id)?.get(popup.dateKey) ?? []}
          equipmentAssignments={Array.from(calendarData.get(popup.equipment.id)?.values() ?? []).flat()}
          sites={sites}
          allEquipment={equipment}
          canEdit={canEdit}
          onSave={addAssignments} onDelete={removeAssignment} onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}
