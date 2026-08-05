'use client'

import type { VehicleBooking } from '@/lib/types'
import { PURPOSE_META } from '@/lib/vehiclePurpose'
import { teamCellClass } from '@/lib/teamColors'

// ทีมที่ใช้รถ: งานจากแผนพนักงาน = ทีมของงาน (รองรับ cross-team) ; จองตรง = ทีมของคนขับ
function bookingTeam(b: VehicleBooking): string | undefined {
  return b.staffAssignment?.serviceType?.code ?? b.driver?.primaryTeam?.code
}

function cellStyle(bookings: VehicleBooking[], isConflict: boolean): string {
  if (isConflict) return 'bg-red-50 border border-red-300 text-red-700'
  if (bookings.length === 0) return 'bg-white hover:bg-slate-50'
  const team = bookingTeam(bookings[0])
  if (team) return teamCellClass(team, 2)                        // สีทีมเดียวกับแผนพนักงาน (เฉด -200)
  return PURPOSE_META[bookings[0].purpose]?.cell ?? 'bg-slate-50' // ไม่รู้ทีม → สีตามประเภทเดิม
}

interface Props {
  bookings:   VehicleBooking[]
  isConflict: boolean
  dayOfWeek:  number
  isHoliday?: boolean
  colSpan?:   number
  isRangeStart?: boolean
  inRange?:      boolean
  onClick:    () => void
  onMouseEnter?: () => void
}

function label(b: VehicleBooking): string {
  if (b.purpose === 'FIELD') return b.site?.code ?? b.destination ?? '—'
  return b.destination ?? PURPOSE_META[b.purpose]?.label ?? '—'
}

export default function VehicleCell({ bookings, isConflict, dayOfWeek, isHoliday, colSpan = 1, isRangeStart, inRange, onClick, onMouseEnter }: Props) {
  const base = cellStyle(bookings, isConflict)
  const isSun = dayOfWeek === 0
  const extra = bookings.length === 0
    ? isHoliday ? 'bg-violet-50' : isSun ? 'bg-red-50' : '' : ''
  const merged = colSpan > 1
  const first = bookings[0]
  const rangeCls = isRangeStart ? 'ring-2 ring-inset ring-sky-500 !bg-sky-100'
                 : inRange      ? 'ring-1 ring-inset ring-sky-300 bg-sky-50' : ''

  const noteText = bookings.filter(b => b.notes).map(b => `${label(b)}: ${b.notes}`).join('\n')

  // งานจองรอยืนยัน — เส้นประ + ⏳ ; เหตุผลขึ้น tooltip บรรทัดแรก (ไอคอน 📝 ยังผูกกับ noteText เหมือนเดิม)
  const isTentative = bookings.some(b => b.isTentative)
  const tentativeText = bookings
    .filter(b => b.isTentative)
    .map(b => `⏳ รอยืนยัน${b.tentativeReason ? `: ${b.tentativeReason}` : ''}`)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const tipText = [...tentativeText, noteText].filter(Boolean).join('\n')

  return (
    <td
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      colSpan={colSpan}
      title={tipText || undefined}
      className={`relative h-10 ${merged ? '' : 'min-w-[56px] max-w-[90px]'} cursor-pointer border-r border-r-slate-300 border-b border-b-slate-400
        px-1 py-0.5 text-center text-xs align-middle transition-colors ${base} ${extra} ${rangeCls}`}
    >
      {bookings.length > 0 && first && (
        <div className="flex flex-col items-center gap-px leading-tight">
          <span className="truncate max-w-[84px] font-medium">
            {PURPOSE_META[first.purpose]?.icon} {label(first)}
            {merged && first.parentId == null && Number(first.estimatedDays) > 1 && (
              <span className="ml-1 text-[9px] font-normal opacity-60">({Number(first.estimatedDays)} วัน)</span>
            )}
          </span>
          {first.driver?.nickname || first.driverName ? (
            <span className="text-[9px] text-slate-500">🧑 {first.driver?.nickname ?? first.driverName}</span>
          ) : null}
          {isConflict && <span className="absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
          {isTentative && (
            <>
              <span className="pointer-events-none absolute inset-[2px] rounded-sm border-2 border-dashed border-red-500" />
              <span className="absolute top-0.5 right-0.5 text-[9px] leading-none">⏳</span>
            </>
          )}
          {noteText && <span className="absolute bottom-0 right-0.5 text-[8px] leading-none">📝</span>}
        </div>
      )}
    </td>
  )
}
