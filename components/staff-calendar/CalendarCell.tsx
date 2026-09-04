'use client'

import { Clock, Lock, StickyNote } from 'lucide-react'
import type { StaffAssignment, Employee } from '@/lib/types'
import { teamCellClass, CONFLICT_CROSS_TEAM } from '@/lib/teamColors'
import { LEAVE_ABBR, LEAVE_LABEL } from '@/lib/leaveTypes'

// Cross-team badge ring color to complement the site color (subtle ring inside cell)
const TEAM_RING: Record<string, string> = {
  ST:   'border-blue-400  text-blue-700',
  AMB:  'border-teal-400  text-teal-700',
  WP:   'border-purple-400 text-purple-700',
  CEMS: 'border-orange-400 text-orange-700',
  WT:   'border-cyan-400  text-cyan-700',
  LOG:  'border-gray-400  text-gray-600',
}

function cellStyle(
  assignments: StaffAssignment[], isConflict: boolean, employee: Employee,
): string {
  if (isConflict) {
    // conflict = คนเดียวลงงานสนามหลายไซต์วันเดียว → คงสีทีมถ้าเป็นทีมเดียว, สีส้มถ้าข้าม 2 หมวดงาน
    const teams = new Set(
      assignments.filter(a => a.status === 'FIELD')
        .map(a => a.serviceType?.code ?? employee.primaryTeam.code),
    )
    if (teams.size > 1) return CONFLICT_CROSS_TEAM
    return teamCellClass([...teams][0] ?? employee.primaryTeam.code, 2)
  }
  if (assignments.length === 0) return 'bg-white hover:bg-slate-50'
  const first = assignments[0]
  switch (first.status) {
    case 'FIELD': {
      const fieldAssign = assignments.find(a => a.status === 'FIELD')
      // สีเดียวต่อทีม (เฉด -200 ตัวหนังสือดำ — ทีมขอสีสดแต่ไม่เข้มเกิน) ; hue = ทีมของงาน (serviceType) → cross-team ได้สีทีมอื่น
      const team = fieldAssign?.serviceType?.code ?? employee.primaryTeam.code
      return teamCellClass(team, 2)
    }
    case 'OFFICE':   return 'bg-slate-50 text-slate-500'
    case 'LEAVE':    return 'bg-slate-100 text-slate-900'   // เทาสีเดียว ตัวหนังสือดำ
    case 'HOLIDAY':  return 'bg-white text-slate-300'
    case 'CAL':      return 'bg-amber-50 text-amber-600'
    default:         return 'bg-white text-slate-600'
  }
}

const STATUS_LABEL: Record<string, string> = {
  OFFICE: 'S', LEAVE: 'ลา', HOLIDAY: 'V', CAL: 'Cal', TRAINING: 'TR',
}

// ตัวย่อในช่อง: งานลา → ใช้ตัวย่อประเภทลา (ป/ป✓/ก/พร/ลจ) ; สถานะอื่นตาม STATUS_LABEL
function statusAbbr(a: StaffAssignment): string {
  if (a.status === 'LEAVE') return a.leaveType ? (LEAVE_ABBR[a.leaveType] ?? 'ลา') : 'ลา'
  return STATUS_LABEL[a.status] ?? a.status
}

interface Props {
  assignments: StaffAssignment[]
  isConflict:  boolean
  dayOfWeek:   number
  isHoliday?:  boolean
  employee:    Employee
  colSpan?:    number   // >1 = งานหลายวัน merge เป็นช่องเดียว
  isGroupMain?: boolean  // การ์ดแม่ของกลุ่ม (ถืออุปกรณ์) → ธงมุมบนซ้าย
  isRangeStart?: boolean  // ช่องที่เลือกเป็นวันเริ่มของช่วง (click แรก)
  inRange?:      boolean  // ช่องที่อยู่ในช่วงที่กำลังเลือก (preview ก่อน click ที่สอง)
  onClick:      () => void
  onMouseEnter?: () => void
}

export default function CalendarCell({ assignments, isConflict, dayOfWeek, isHoliday, colSpan = 1, employee, isGroupMain, isRangeStart, inRange, onClick, onMouseEnter }: Props) {
  const base  = cellStyle(assignments, isConflict, employee)
  const isSun = dayOfWeek === 0
  const extra = assignments.length === 0
    ? isHoliday ? 'bg-violet-50' : isSun ? 'bg-red-50' : ''   // เสาร์ = วันทำงานปกติ
    : isSun ? 'opacity-90' : ''

  const primary   = assignments.find(a => !a.isCrossTeam)
  const crossTeam = assignments.filter(a => a.isCrossTeam)
  const displayAssign = primary ?? crossTeam[0]
  const merged = colSpan > 1

  // tooltip: ชื่อเต็มประเภทลา (กันงงตัวย่อ) + หมายเหตุ
  const leaveText = assignments
    .filter(a => a.status === 'LEAVE' && a.leaveType)
    .map(a => LEAVE_LABEL[a.leaveType!] ?? 'ลา')
  // งานจองรอยืนยัน — เส้นประรอบช่อง + ⏳ ; เหตุผลที่ยังไม่ยืนยันขึ้นใน tooltip บรรทัดแรก
  const tentative = assignments.filter(a => a.isTentative)
  const isTentative = tentative.length > 0
  const tentativeText = tentative
    .map(a => `⏳ รอยืนยัน${a.tentativeReason ? `: ${a.tentativeReason}` : ''}`)
    .filter((v, i, arr) => arr.indexOf(v) === i)   // งานหลายวัน/หลายรายการที่เหตุผลเดียวกัน แสดงบรรทัดเดียว

  const noteText = [
    ...leaveText,
    ...assignments
      .filter(a => a.notes)
      .map(a => `${a.status !== 'FIELD' ? statusAbbr(a) : (a.site?.code ?? '')}: ${a.notes}`),
  ].join('\n')
  // tooltip = การ์ดแม่ + เหตุผลรอยืนยัน + หมายเหตุ ; ส่วนไอคอน 📝 ยังผูกกับ noteText อย่างเดียวเหมือนเดิม
  const ownerText = isGroupMain ? 'การ์ดแม่ — ถือเครื่องมือ/รถของงานนี้' : ''
  const tipText = [ownerText, ...tentativeText, noteText].filter(Boolean).join('\n')

  // ไฮไลต์ตอนเลือกช่วงวัน: วันเริ่ม = วงแหวนเข้ม ; ในช่วง preview = วงแหวนอ่อน+ฟ้าจาง
  const rangeCls = isRangeStart ? 'ring-2 ring-inset ring-sky-500 !bg-sky-100'
                 : inRange      ? 'ring-1 ring-inset ring-sky-300 bg-sky-50' : ''

  return (
    <td
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      colSpan={colSpan}
      title={tipText || undefined}
      className={`relative h-10 ${merged ? '' : 'min-w-[52px] max-w-[80px]'} cursor-pointer border-r border-r-slate-300 border-b border-b-slate-400
        px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra} ${isConflict ? 'ring-1 ring-inset ring-red-400' : ''} ${rangeCls}`}
    >
      {/* ธงมุมบนซ้าย = การ์ดแม่ (ถืออุปกรณ์ของกลุ่ม) */}
      {isGroupMain && (
        <svg className="pointer-events-none absolute left-0 top-0" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
          <path d="M0 0 H15 L0 15 Z" fill="#64748b" />
          <path d="M2.4 5 L4 6.6 L7 3.2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {assignments.length > 0 && (
        <div className="flex flex-col items-center gap-px leading-tight">

          {/* Main label: site code or status — น้ำหนัก/ขนาดเท่าชื่อเล่นพนักงาน (text-xs font-medium) */}
          {displayAssign && (
            <span className="font-medium">
              {displayAssign.status !== 'FIELD'
                ? statusAbbr(displayAssign)
                : (displayAssign.site?.code ?? '—')}
              {merged && <span className="ml-1 text-[9px] font-normal opacity-60">({Number(displayAssign.estimatedDays)} วัน)</span>}
            </span>
          )}

          {/* Cross-team badges */}
          {crossTeam.map(a => {
            const teamCode = a.serviceType?.code ?? '?'
            const ringCls  = TEAM_RING[teamCode] ?? 'border-slate-400 text-slate-500'
            const showSite = !!primary && a.site?.code !== primary.site?.code
            return (
              <span
                key={a.id}
                className={`inline-flex items-center gap-0.5 rounded border px-1 text-[9px] font-semibold leading-tight bg-white/60 ${ringCls}`}
              >
                <span className="opacity-60">×</span>
                {showSite && <span>{a.site?.code}</span>}
                <span>{teamCode}</span>
              </span>
            )
          })}

          {/* งานจองรอยืนยัน — กรอบเส้นประครอบช่อง (งานหลายวัน merge แล้วครอบทั้งช่วง) + ⏳ */}
          {isTentative && (
            <>
              <span className="pointer-events-none absolute inset-[2px] rounded-sm border-2 border-dashed border-red-500" />
              <Clock className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-red-500" />
            </>
          )}
          {assignments.some(a => a.isLocked) && (
            <Lock className={`absolute top-0.5 h-2.5 w-2.5 text-slate-400 ${isTentative ? 'right-3' : 'right-0.5'}`} />
          )}
          {isConflict && (
            <span className={`absolute top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 ${isGroupMain ? 'left-3.5' : 'left-0.5'}`} />
          )}
          {noteText && (
            <StickyNote className="absolute bottom-0 right-0.5 h-2.5 w-2.5 text-slate-400" />
          )}
        </div>
      )}
    </td>
  )
}
