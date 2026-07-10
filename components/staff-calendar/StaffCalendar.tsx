'use client'

import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useStaffCalendar } from '@/hooks/useStaffCalendar'
import { useMe } from '@/hooks/useMe'
import { useHolidays } from '@/hooks/useHolidays'
import { canPlan } from '@/lib/roles'
import { toDateKey } from '@/lib/dateKey'
import CalendarCell from './CalendarCell'
import AssignmentPopup from './AssignmentPopup'
import Avatar from '@/components/Avatar'
import EmployeeCard from '@/components/EmployeeCard'
import type { Employee, TeamCode, StaffAssignment } from '@/lib/types'

const TEAM_CODES: TeamCode[] = ['ST', 'AMB', 'WP', 'WT', 'CEMS', 'LOG']
const TEAM_FILTER_COLOR: Record<string, string> = {
  ST: 'bg-blue-100 text-blue-700', AMB: 'bg-teal-100 text-teal-700',
  WP: 'bg-purple-100 text-purple-700', CEMS: 'bg-orange-100 text-orange-700',
  WT: 'bg-cyan-100 text-cyan-700', LOG: 'bg-gray-100 text-gray-600',
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) days.push(new Date(year, month - 1, d))
  return days
}

function rowSummary(employeeId: number, calendarData: ReturnType<typeof useStaffCalendar>['calendarData']) {
  const dayMap = calendarData.get(employeeId)
  if (!dayMap) return { fieldDays: 0, crossTeamDays: 0 }
  let fieldDays = 0, crossTeamDays = 0
  for (const assignments of dayMap.values()) {
    for (const a of assignments) {
      if (a.status === 'FIELD' && !a.parentId) {
        fieldDays += Number(a.estimatedDays)
        if (a.isCrossTeam) crossTeamDays += Number(a.estimatedDays)
      }
    }
  }
  return { fieldDays, crossTeamDays }
}

const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const thaiDays   = ['อา','จ','อ','พ','พฤ','ศ','ส']

export default function StaffCalendar() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [teamFilter, setTeamFilter] = useState<TeamCode | 'ALL'>('ALL')
  const [popup, setPopup] = useState<{ employee: Employee; dateKey: string; initialDays?: number } | null>(null)
  const [viewing, setViewing] = useState<Employee | null>(null)
  const [exporting, setExporting] = useState(false)
  // เลือกช่วงวันแบบ 2 คลิก: คลิกวันเริ่ม → คลิกวันสิ้นสุด (แถวเดียวกัน) → เปิด popup พร้อมจำนวนวัน
  const [rangeStart, setRangeStart] = useState<{ empId: number; idx: number; dateKey: string } | null>(null)
  const [rangeHover, setRangeHover] = useState<number | null>(null)

  const { employees, calendarData, conflicts, sites, teams, loading, error, addAssignments, removeAssignment, moveAssignment } =
    useStaffCalendar(year, month)
  const { role } = useMe()
  const canEdit = canPlan(role)
  const { holidaySet, holidayMap } = useHolidays()

  const days = useMemo(() => getDaysInMonth(year, month), [year, month])
  const filteredEmployees = teamFilter === 'ALL' ? employees : employees.filter((e) => e.primaryTeam.code === teamFilter)

  function prevMonth() { if (month === 1) { setYear(y => y-1); setMonth(12) } else setMonth(m => m-1) }
  function nextMonth() { if (month === 12) { setYear(y => y+1); setMonth(1) } else setMonth(m => m+1) }

  const totalConflicts = conflicts.staffConflicts.size

  // Export PDF สีเหมือนปฏิทิน — โหลด lib/ฟอนต์เฉพาะตอนกด (lazy) ไม่ถ่วง bundle หน้าแรก
  async function handleExportPdf() {
    setExporting(true)
    try {
      const { exportStaffPdf } = await import('@/lib/pdf/staffPdf')
      exportStaffPdf({ year, month, employees: filteredEmployees, calendarData, days, holidayMap, conflicts })
    } catch (e) {
      alert('สร้าง PDF ไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setExporting(false)
    }
  }

  // จัดการคลิกช่อง: ช่องที่มีงานแล้ว → เปิด popup ทันที ; ช่องว่าง → คลิก 1 = วันเริ่ม, คลิก 2 (แถวเดียวกัน) = วันสิ้นสุด
  function handleCellClick(emp: Employee, idx: number, dateKey: string, hasAssign: boolean) {
    if (!canEdit || hasAssign) { setRangeStart(null); setRangeHover(null); setPopup({ employee: emp, dateKey }); return }
    if (!rangeStart || rangeStart.empId !== emp.id) {
      setRangeStart({ empId: emp.id, idx, dateKey }); setRangeHover(idx)   // คลิกแรก / เปลี่ยนแถว → ตั้งวันเริ่มใหม่
      return
    }
    // คลิกที่สอง (แถวเดียวกัน) → เปิด popup ช่วง [lo, hi]
    const lo = Math.min(rangeStart.idx, idx)
    const hi = Math.max(rangeStart.idx, idx)
    setPopup({ employee: emp, dateKey: toDateKey(days[lo]), initialDays: hi - lo + 1 })
    setRangeStart(null); setRangeHover(null)
  }

  // Esc = ยกเลิกการเลือกช่วง ; เปลี่ยนเดือน = ล้างการเลือก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRangeStart(null); setRangeHover(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setRangeStart(null); setRangeHover(null) }, [year, month, teamFilter])

  // สร้างช่องของแต่ละแถว — งานหลายวัน (ตัวแม่ FIELD, estimatedDays>=2) merge เป็นช่องเดียวด้วย colSpan
  function renderRowCells(emp: Employee): ReactNode[] {
    const dayMap = calendarData.get(emp.id)
    const cells: ReactNode[] = []
    let i = 0
    while (i < days.length) {
      const day       = days[i]
      const dateKey   = toDateKey(day)
      const dayAssign: StaffAssignment[] = dayMap?.get(dateKey) ?? []

      const parent = dayAssign.find(a => a.parentId == null && a.status === 'FIELD' && Number(a.estimatedDays) >= 2)
      // span = นับวันต่อเนื่องจริงที่ยังมี record ของงานเดียวกัน (รองรับกรณีเล็มวันกลางออก)
      let span = 1
      if (parent) {
        while (i + span < days.length) {
          const next = dayMap?.get(toDateKey(days[i + span])) ?? []
          if (!next.some(a => a.parentId === parent.id)) break
          span++
        }
      }

      // conflict = วันใดวันหนึ่งในช่วงที่ merge มี conflict
      let isConflict = false
      for (let k = 0; k < span; k++) {
        if (conflicts.staffConflicts.has(`${emp.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
      }

      const idx = i
      const rowActive = rangeStart?.empId === emp.id
      const isStart   = rowActive && rangeStart!.idx === idx
      const inRange   = rowActive && rangeHover != null && dayAssign.length === 0 &&
                        idx >= Math.min(rangeStart!.idx, rangeHover) && idx <= Math.max(rangeStart!.idx, rangeHover)
      cells.push(
        <CalendarCell
          key={dateKey} assignments={dayAssign} isConflict={isConflict}
          dayOfWeek={day.getDay()} isHoliday={holidaySet.has(dateKey)} colSpan={span} employee={emp}
          isRangeStart={isStart} inRange={inRange && !isStart}
          onMouseEnter={rowActive ? () => setRangeHover(idx) : undefined}
          onClick={() => handleCellClick(emp, idx, dateKey, dayAssign.length > 0)}
        />
      )
      i += span
    }
    return cells
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">👤 แผนงานพนักงาน</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year+543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        {totalConflicts > 0 && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">⚠ {totalConflicts} conflict</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setTeamFilter('ALL')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${teamFilter === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            ทุกทีม
          </button>
          {TEAM_CODES.map((code) => (
            <button key={code} onClick={() => setTeamFilter(code === teamFilter ? 'ALL' : code)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${teamFilter === code ? 'ring-2 ring-offset-1 ring-slate-400 ' + TEAM_FILTER_COLOR[code] : TEAM_FILTER_COLOR[code] + ' opacity-60 hover:opacity-100'}`}>
              {code}
            </button>
          ))}
          <button onClick={handleExportPdf} disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 transition-colors">
            {exporting ? '⏳ กำลังสร้าง...' : '📄 Export PDF'}
          </button>
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
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-xl w-full">
            <p className="text-sm font-semibold text-red-700 mb-1">⚠ โหลดข้อมูลไม่สำเร็จ</p>
            <p className="text-xs text-red-600 font-mono break-all">{error}</p>
          </div>
          <p className="text-xs text-slate-400">ตรวจสอบ Railway logs หรือรัน seed data แล้วลอง refresh</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 min-w-[120px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">พนักงาน</th>
                <th className="sticky left-[120px] z-20 min-w-[48px] border-b border-r border-slate-200 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-600">ทีม</th>
                {days.map((day) => {
                  const dow = day.getDay()
                  const key = toDateKey(day)
                  const isToday   = key === toDateKey(today)
                  const holName   = holidayMap.get(key)
                  const dayCls = holName ? 'bg-violet-50 text-violet-500'
                               : dow === 0 ? 'bg-red-50 text-red-400' : 'text-slate-600'   // เสาร์ = วันทำงาน
                  return (
                    <th key={key} title={holName ?? undefined} className={`min-w-[52px] border-b border-r border-slate-300 px-1 py-1 text-center font-medium ${dayCls} ${isToday ? '!bg-sky-50 !text-sky-600' : ''}`}>
                      <div>{day.getDate()}</div>
                      <div className="text-[10px] font-normal opacity-70">{holName ? '⛱' : thaiDays[dow]}</div>
                    </th>
                  )
                })}
                <th className="min-w-[56px] border-b border-r border-slate-200 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-600">Field</th>
                <th className="min-w-[48px] border-b border-slate-200 bg-white px-2 py-2 text-center text-xs font-semibold text-sky-500">Cross</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const { fieldDays, crossTeamDays } = rowSummary(emp.id, calendarData)
                return (
                    <tr key={emp.id} className="hover:bg-slate-50/50">
                      <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5">
                        <button onClick={() => setViewing(emp)} className="flex items-center gap-2 text-left hover:opacity-80">
                          <Avatar employeeId={emp.id} name={emp.nickname ?? emp.fullName} hasPhoto={emp.hasPhoto} size="sm" />
                          <div>
                            <div className="font-medium text-slate-700">
                              {emp.nickname ?? emp.fullName.split(' ')[0]}
                              {emp.isSubLeader && <span className="ml-1 text-[10px] text-amber-500" title="หัวหน้าทีมย่อย">★</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[88px]">{emp.fullName}</div>
                          </div>
                        </button>
                      </td>
                      <td className="sticky left-[120px] z-10 border-b border-r border-slate-200 bg-white px-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TEAM_FILTER_COLOR[emp.primaryTeam.code]}`}>{emp.primaryTeam.code}</span>
                        {emp.subTeam && <div className="mt-0.5 text-[9px] text-slate-400">{emp.subTeam.name}</div>}
                      </td>
                      {renderRowCells(emp)}
                      <td className="border-b border-r border-slate-200 px-2 text-center font-medium text-emerald-700">{fieldDays > 0 ? fieldDays : '—'}</td>
                      <td className="border-b border-slate-200 px-2 text-center font-medium text-sky-500">{crossTeamDays > 0 ? crossTeamDays : '—'}</td>
                    </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {popup && (
        <AssignmentPopup
          employee={popup.employee} date={popup.dateKey}
          initialDays={popup.initialDays}
          assignments={calendarData.get(popup.employee.id)?.get(popup.dateKey) ?? []}
          employeeAssignments={Array.from(calendarData.get(popup.employee.id)?.values() ?? []).flat()}
          sites={sites} teams={teams}
          allEmployees={employees}
          canEdit={canEdit}
          onSave={addAssignments} onDelete={removeAssignment} onMove={moveAssignment} onClose={() => setPopup(null)}
        />
      )}

      {viewing && <EmployeeCard employee={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
