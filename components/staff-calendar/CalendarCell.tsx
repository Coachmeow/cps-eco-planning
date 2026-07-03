'use client'

import type { StaffAssignment, Employee } from '@/lib/types'
import { teamCellClass } from '@/lib/teamColors'

// Cross-team badge ring color to complement the site color (subtle ring inside cell)
const TEAM_RING: Record<string, string> = {
  ST:   'border-rose-400 text-rose-700',
  AMB:  'border-teal-400  text-teal-700',
  WP:   'border-purple-400 text-purple-700',
  CEMS: 'border-orange-400 text-orange-700',
  WT:   'border-blue-400  text-blue-700',
  LOG:  'border-gray-400  text-gray-600',
}

function cellStyle(
  assignments: StaffAssignment[], isConflict: boolean, employee: Employee,
  tierOf: (team: string, siteId: number | null) => number,
): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (assignments.length === 0) return 'bg-white hover:bg-slate-50'
  const first = assignments[0]
  switch (first.status) {
    case 'FIELD': {
      const fieldAssign = assignments.find(a => a.status === 'FIELD')
      // hue = ทีมของงาน (serviceType) fallback ทีมสังกัด ; เฉด = กลุ่มไซต์
      const team = fieldAssign?.serviceType?.code ?? employee.primaryTeam.code
      return teamCellClass(team, tierOf(team, fieldAssign?.siteId ?? null))
    }
    case 'OFFICE':   return 'bg-slate-50 text-slate-500'
    case 'LEAVE':    return 'bg-slate-100 text-slate-400'
    case 'HOLIDAY':  return 'bg-white text-slate-300'
    case 'CAL':      return 'bg-amber-50 text-amber-600'
    default:         return 'bg-white text-slate-600'
  }
}

const STATUS_LABEL: Record<string, string> = {
  OFFICE: 'S', LEAVE: 'B', HOLIDAY: 'V', CAL: 'Cal', TRAINING: 'TR',
}

interface Props {
  assignments: StaffAssignment[]
  isConflict:  boolean
  dayOfWeek:   number
  isHoliday?:  boolean
  employee:    Employee
  colSpan?:    number   // >1 = งานหลายวัน merge เป็นช่องเดียว
  tierOf?:     (team: string, siteId: number | null) => number
  onClick:     () => void
}

export default function CalendarCell({ assignments, isConflict, dayOfWeek, isHoliday, colSpan = 1, employee, tierOf = () => 0, onClick }: Props) {
  const base  = cellStyle(assignments, isConflict, employee, tierOf)
  const isSun = dayOfWeek === 0
  const extra = assignments.length === 0
    ? isHoliday ? 'bg-violet-50' : isSun ? 'bg-red-50' : ''   // เสาร์ = วันทำงานปกติ
    : isSun ? 'opacity-90' : ''

  const primary   = assignments.find(a => !a.isCrossTeam)
  const crossTeam = assignments.filter(a => a.isCrossTeam)
  const displayAssign = primary ?? crossTeam[0]
  const merged = colSpan > 1

  // หมายเหตุ → tooltip เมื่อ hover
  const noteText = assignments
    .filter(a => a.notes)
    .map(a => `${a.status !== 'FIELD' ? (STATUS_LABEL[a.status] ?? a.status) : (a.site?.code ?? '')}: ${a.notes}`)
    .join('\n')

  return (
    <td
      onClick={onClick}
      colSpan={colSpan}
      title={noteText || undefined}
      className={`relative h-10 ${merged ? '' : 'min-w-[52px] max-w-[80px]'} cursor-pointer border-r border-b
        border-slate-300 px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra}`}
    >
      {assignments.length > 0 && (
        <div className="flex flex-col items-center gap-px leading-tight">

          {/* Main label: site code or status */}
          {displayAssign && (
            <span className="font-semibold">
              {displayAssign.status !== 'FIELD'
                ? (STATUS_LABEL[displayAssign.status] ?? displayAssign.status)
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

          {assignments.some(a => a.isLocked) && (
            <span className="absolute top-0.5 right-0.5 text-[9px] text-slate-400">🔒</span>
          )}
          {isConflict && (
            <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
          {noteText && (
            <span className="absolute bottom-0 right-0.5 text-[8px] leading-none">📝</span>
          )}
        </div>
      )}
    </td>
  )
}
