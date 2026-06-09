'use client'

import type { StaffAssignment, Employee } from '@/lib/types'

const TEAM_BADGE_COLOR: Record<string, string> = {
  ST:   'bg-slate-200 text-slate-700',
  AMB:  'bg-teal-100  text-teal-700',
  WP:   'bg-purple-100 text-purple-700',
  CEMS: 'bg-orange-100 text-orange-700',
  WT:   'bg-blue-100  text-blue-700',
  LOG:  'bg-gray-100  text-gray-600',
}

function cellStyle(assignments: StaffAssignment[], isConflict: boolean): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (assignments.length === 0) return 'bg-white hover:bg-slate-50'
  const first = assignments[0]
  switch (first.status) {
    case 'FIELD':
      return first.isCrossTeam
        ? 'bg-sky-50 border border-sky-200 text-sky-800'
        : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
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
  isWeekend:   boolean
  employee:    Employee
  onClick:     () => void
}

export default function CalendarCell({ assignments, isConflict, isWeekend, onClick }: Props) {
  const base  = cellStyle(assignments, isConflict)
  const extra = isWeekend && assignments.length === 0 ? 'bg-slate-50' : ''
  const primary   = assignments.find((a) => !a.isCrossTeam)
  const crossTeam = assignments.filter((a) => a.isCrossTeam)

  return (
    <td
      onClick={onClick}
      className={`relative h-10 min-w-[52px] max-w-[80px] cursor-pointer border-r border-b
        border-slate-200 px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra}`}
    >
      {assignments.length > 0 && (
        <div className="flex flex-col items-center gap-px leading-tight">
          {primary && (
            <span className="truncate font-medium max-w-[72px]">
              {primary.status !== 'FIELD' ? (STATUS_LABEL[primary.status] ?? primary.status) : (primary.site?.code ?? '—')}
            </span>
          )}
          {crossTeam.map((a) => (
            <span key={a.id} className={`rounded px-0.5 text-[10px] font-semibold leading-tight ${TEAM_BADGE_COLOR[a.serviceType?.code ?? ''] ?? 'bg-gray-100'}`}>
              [{a.serviceType?.code}]
            </span>
          ))}
          {assignments.some((a) => a.isLocked) && <span className="absolute top-0.5 right-0.5 text-[9px] text-slate-400">🔒</span>}
          {isConflict && <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
        </div>
      )}
    </td>
  )
}
