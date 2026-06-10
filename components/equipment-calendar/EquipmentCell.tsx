'use client'

import type { EquipmentAssignment } from '@/lib/types'
import { siteColorClass } from '@/lib/siteColors'

function cellStyle(assignments: EquipmentAssignment[], isConflict: boolean): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (assignments.length === 0) return 'bg-white hover:bg-slate-50'
  return siteColorClass(assignments[0].site?.color)
}

interface Props {
  assignments: EquipmentAssignment[]
  isConflict:  boolean
  dayOfWeek:   number
  onClick:     () => void
}

export default function EquipmentCell({ assignments, isConflict, dayOfWeek, onClick }: Props) {
  const base  = cellStyle(assignments, isConflict)
  const isSun = dayOfWeek === 0
  const isSat = dayOfWeek === 6
  const extra = assignments.length === 0
    ? isSun ? 'bg-red-50' : isSat ? 'bg-orange-50' : '' : ''

  return (
    <td
      onClick={onClick}
      className={`relative h-10 min-w-[56px] max-w-[80px] cursor-pointer border-r border-b
        border-slate-300 px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra}`}
    >
      {assignments.length > 0 && (
        <div className="flex flex-col items-center gap-px leading-tight">
          {assignments.map((a, i) => (
            <span
              key={a.id}
              className={`truncate max-w-[72px] font-semibold ${isConflict && i > 0 ? 'text-red-500' : ''}`}
            >
              {a.site?.code ?? '—'}
            </span>
          ))}
          {isConflict && <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
          {assignments.some(a => a.isLocked) && <span className="absolute top-0.5 right-0.5 text-[9px] text-slate-400">🔒</span>}
        </div>
      )}
    </td>
  )
}
