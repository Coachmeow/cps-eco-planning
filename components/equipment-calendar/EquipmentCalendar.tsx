'use client'

import { useState, useMemo } from 'react'
import { useEquipmentCalendar } from '@/hooks/useEquipmentCalendar'
import { useMe } from '@/hooks/useMe'
import { canPlan } from '@/lib/roles'
import { countWorkdays, calcUtil } from '@/lib/workdays'
import { toDateKey } from '@/lib/dateKey'
import EquipmentCell from './EquipmentCell'
import EquipmentPopup from './EquipmentPopup'
import ExportButton from '@/components/ExportButton'
import type { Equipment, EquipmentType } from '@/lib/types'

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
  const [popup, setPopup] = useState<{ equipment: Equipment; dateKey: string } | null>(null)

  const { equipment, eqTypes, calendarData, conflicts, sites, loading, addAssignments, removeAssignment } =
    useEquipmentCalendar(year, month, selectedTypeId)
  const { role } = useMe()
  const canEdit = canPlan(role)

  const days     = useMemo(() => getDaysInMonth(year, month), [year, month])
  const workdays = useMemo(() => countWorkdays(year, month), [year, month])

  const grouped = useMemo(() => {
    const map = new Map<number, { type: EquipmentType; items: Equipment[] }>()
    for (const eq of equipment) {
      if (!showRental && eq.isRental) continue
      if (!map.has(eq.typeId)) map.set(eq.typeId, { type: eq.type, items: [] })
      map.get(eq.typeId)!.items.push(eq)
    }
    return Array.from(map.values())
  }, [equipment, showRental])

  function prevMonth() { if (month === 1) { setYear(y => y-1); setMonth(12) } else setMonth(m => m-1) }
  function nextMonth() { if (month === 12) { setYear(y => y+1); setMonth(1) } else setMonth(m => m+1) }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-2 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-800">ตารางเครื่องมือ</h1>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
          <span className="min-w-[80px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year+543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
        </div>
        <span className="text-xs text-slate-400">{workdays} วันทำงาน</span>
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

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">เครื่องมือ</th>
                {days.map((day) => {
                  const dow = day.getDay(); const isToday = toDateKey(day) === toDateKey(today)
                  const weekendCls = dow === 0 ? 'bg-red-50 text-red-400' : dow === 6 ? 'bg-orange-50 text-orange-400' : 'text-slate-600'
                  return (
                    <th key={toDateKey(day)} className={`min-w-[56px] border-b border-r border-slate-300 px-1 py-1 text-center font-medium ${weekendCls} ${isToday ? '!bg-sky-50 !text-sky-600' : ''}`}>
                      <div>{day.getDate()}</div>
                      <div className="text-[10px] font-normal opacity-70">{thaiDays[dow]}</div>
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
                        <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-700">{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</span>
                            {eq.isRental && <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-600">เช่า</span>}
                            {eq.status === 'CALIBRATING' && <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] text-purple-500">Cal</span>}
                            {eq.status === 'BROKEN' && <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-600">เสีย</span>}
                          </div>
                          {eq.serialNo && eq.internalNo && <div className="text-[10px] text-slate-400">{eq.serialNo}</div>}
                        </td>
                        {days.map((day) => {
                          const dateKey = toDateKey(day)
                          const dayAssign = dayMap.get(dateKey) ?? []
                          const isConflict = conflicts.equipmentConflicts.has(`${eq.id}-${dateKey}`)
                          return <EquipmentCell key={dateKey} assignments={dayAssign} isConflict={isConflict} dayOfWeek={day.getDay()} onClick={() => setPopup({ equipment: eq, dateKey })} />
                        })}
                        <td className={`border-b border-slate-200 px-2 text-center ${utilColor(util)}`}>{assignedDays > 0 ? `${util}%` : '—'}</td>
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
          equipment={popup.equipment} date={popup.dateKey}
          assignments={calendarData.get(popup.equipment.id)?.get(popup.dateKey) ?? []}
          sites={sites}
          allEquipment={equipment}
          canEdit={canEdit}
          onSave={addAssignments} onDelete={removeAssignment} onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}
