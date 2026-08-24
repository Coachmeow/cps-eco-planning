'use client'

import { Clock, Lock, StickyNote } from 'lucide-react'
import type { EquipmentAssignment } from '@/lib/types'
import { teamCellClass } from '@/lib/teamColors'

export type MaintKind = 'REPAIR' | 'CALIBRATION'
const MAINT_META: Record<MaintKind, { label: string; cls: string }> = {
  REPAIR:      { label: '🔧 ส่งซ่อม', cls: 'bg-red-50 text-red-600' },
  CALIBRATION: { label: '📐 ส่งแคล', cls: 'bg-purple-50 text-purple-600' },
}

function cellStyle(assignments: EquipmentAssignment[], isConflict: boolean, team: string, maint?: MaintKind | null): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (assignments.length === 0) return maint ? MAINT_META[maint].cls : 'bg-white hover:bg-slate-50'
  // สีเดียวต่อทีม (เฉด -200 ตัวหนังสือดำ) ; hue = ทีมของเครื่อง (type.primaryTeam)
  return teamCellClass(team, 2)
}

interface Props {
  assignments: EquipmentAssignment[]
  isConflict:  boolean
  dayOfWeek:   number
  isHoliday?:  boolean
  colSpan?:    number
  team:        string
  maint?:      MaintKind | null   // ช่วงส่งซ่อม/Cal (ช่องว่างที่ครอบช่วงเครื่องไม่อยู่)
  isRangeStart?: boolean
  inRange?:      boolean
  onClick:     () => void
  onMouseEnter?: () => void
}

export default function EquipmentCell({ assignments, isConflict, dayOfWeek, isHoliday, colSpan = 1, team, maint, isRangeStart, inRange, onClick, onMouseEnter }: Props) {
  const base  = cellStyle(assignments, isConflict, team, maint)
  const isSun = dayOfWeek === 0
  const extra = assignments.length === 0 && !maint
    ? isHoliday ? 'bg-violet-50' : isSun ? 'bg-red-50' : '' : ''   // เสาร์ = วันทำงานปกติ
  const merged = colSpan > 1
  const rangeCls = isRangeStart ? 'ring-2 ring-inset ring-sky-500 !bg-sky-100'
                 : inRange      ? 'ring-1 ring-inset ring-sky-300 bg-sky-50' : ''

  // หมายเหตุ → tooltip เมื่อ hover
  const noteText = assignments
    .filter(a => a.notes)
    .map(a => `${a.site?.code ?? ''}: ${a.notes}`)
    .join('\n')

  // งานจองรอยืนยัน — เส้นประ + ⏳ ; เหตุผลขึ้น tooltip บรรทัดแรก (ไอคอน 📝 ยังผูกกับ noteText เหมือนเดิม)
  const isTentative = assignments.some(a => a.isTentative)
  const tentativeText = assignments
    .filter(a => a.isTentative)
    .map(a => `⏳ รอยืนยัน${a.tentativeReason ? `: ${a.tentativeReason}` : ''}`)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const tipText = [...tentativeText, noteText].filter(Boolean).join('\n')

  return (
    <td
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      colSpan={colSpan}
      title={tipText || undefined}
      className={`relative h-10 ${merged ? '' : 'min-w-[56px] max-w-[80px]'} cursor-pointer border-r border-r-slate-300 border-b border-b-slate-400
        px-1 py-0.5 text-center text-xs align-middle
        transition-colors ${base} ${extra} ${rangeCls}`}
    >
      {assignments.length > 0 ? (
        <div className="flex flex-col items-center gap-px leading-tight">
          {assignments.map((a, i) => (
            <span
              key={a.id}
              className={`truncate max-w-[72px] font-medium ${isConflict && i > 0 ? 'text-red-500' : ''}`}
            >
              {a.site?.code ?? '—'}
              {merged && a.parentId == null && Number(a.estimatedDays) > 1 && (
                <span className="ml-1 text-[9px] font-normal opacity-60">({Number(a.estimatedDays)} วัน)</span>
              )}
            </span>
          ))}
          {isConflict && <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
          {isTentative && (
            <>
              <span className="pointer-events-none absolute inset-[2px] rounded-sm border-2 border-dashed border-red-500" />
              <Clock className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-red-500" />
            </>
          )}
          {assignments.some(a => a.isLocked) && <Lock className={`absolute top-0.5 h-2.5 w-2.5 text-slate-400 ${isTentative ? 'right-3' : 'right-0.5'}`} />}
          {noteText && <StickyNote className="absolute bottom-0 right-0.5 h-2.5 w-2.5 text-slate-400" />}
        </div>
      ) : maint ? (
        <span className="truncate text-[10px] font-medium leading-tight">{MAINT_META[maint].label}</span>
      ) : null}
    </td>
  )
}
