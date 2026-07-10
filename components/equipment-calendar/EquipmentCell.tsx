'use client'

import type { EquipmentAssignment } from '@/lib/types'
import { teamCellClass } from '@/lib/teamColors'

function cellStyle(assignments: EquipmentAssignment[], isConflict: boolean, team: string): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (assignments.length === 0) return 'bg-white hover:bg-slate-50'
  // สีเดียวต่อทีม (เฉด -100) ; hue = ทีมของเครื่อง (type.primaryTeam)
  return teamCellClass(team, 1)
}

interface Props {
  assignments: EquipmentAssignment[]
  isConflict:  boolean
  dayOfWeek:   number
  isHoliday?:  boolean
  colSpan?:    number
  team:        string
  isRangeStart?: boolean
  inRange?:      boolean
  onClick:     () => void
  onMouseEnter?: () => void
}

export default function EquipmentCell({ assignments, isConflict, dayOfWeek, isHoliday, colSpan = 1, team, isRangeStart, inRange, onClick, onMouseEnter }: Props) {
  const base  = cellStyle(assignments, isConflict, team)
  const isSun = dayOfWeek === 0
  const extra = assignments.length === 0
    ? isHoliday ? 'bg-violet-50' : isSun ? 'bg-red-50' : '' : ''   // เสาร์ = วันทำงานปกติ
  const merged = colSpan > 1
  const rangeCls = isRangeStart ? 'ring-2 ring-inset ring-sky-500 !bg-sky-100'
                 : inRange      ? 'ring-1 ring-inset ring-sky-300 bg-sky-50' : ''

  // หมายเหตุ → tooltip เมื่อ hover
  const noteText = assignments
    .filter(a => a.notes)
    .map(a => `${a.site?.code ?? ''}: ${a.notes}`)
    .join('\n')

  return (
    <td
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      colSpan={colSpan}
      title={noteText || undefined}
      className={`relative h-10 ${merged ? '' : 'min-w-[56px] max-w-[80px]'} cursor-pointer border-r border-b
        border-slate-300 px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra} ${rangeCls}`}
    >
      {assignments.length > 0 && (
        <div className="flex flex-col items-center gap-px leading-tight">
          {assignments.map((a, i) => (
            <span
              key={a.id}
              className={`truncate max-w-[72px] font-semibold ${isConflict && i > 0 ? 'text-red-500' : ''}`}
            >
              {a.site?.code ?? '—'}
              {merged && a.parentId == null && Number(a.estimatedDays) > 1 && (
                <span className="ml-1 text-[9px] font-normal opacity-60">({Number(a.estimatedDays)} วัน)</span>
              )}
            </span>
          ))}
          {isConflict && <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
          {assignments.some(a => a.isLocked) && <span className="absolute top-0.5 right-0.5 text-[9px] text-slate-400">🔒</span>}
          {noteText && <span className="absolute bottom-0 right-0.5 text-[8px] leading-none">📝</span>}
        </div>
      )}
    </td>
  )
}
