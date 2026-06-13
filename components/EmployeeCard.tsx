'use client'

import { useEffect, useRef } from 'react'
import Avatar from './Avatar'
import { calcAge, calcDuration, fmtThaiDate } from '@/lib/employeeProfile'

// type หลวม — ใช้ร่วมได้ทั้งหน้าจัดการและปฏิทิน
export interface CardEmployee {
  id: number
  fullName: string
  nickname: string | null
  primaryTeam: { code: string; name: string }
  isActive?: boolean
  hasPhoto?: boolean
  birthDate?: string | null
  startDate?: string | null
  eduField?: string | null
  eduInstitute?: string | null
}

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-slate-200 text-slate-700', AMB: 'bg-teal-100 text-teal-700',
  WP: 'bg-purple-100 text-purple-700', CEMS: 'bg-orange-100 text-orange-700',
  WT: 'bg-blue-100 text-blue-700', LOG: 'bg-gray-100 text-gray-600',
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-700">
        {value}{sub && <span className="ml-1.5 text-xs font-medium text-emerald-600">{sub}</span>}
      </span>
    </div>
  )
}

export default function EmployeeCard({ employee, onClose }: { employee: CardEmployee; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const teamCls = TEAM_COLOR[employee.primaryTeam.code] ?? 'bg-slate-100 text-slate-600'
  const edu = [employee.eduField, employee.eduInstitute].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-emerald-50 to-white px-6 pb-4 pt-6">
          <button onClick={onClose} className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          <Avatar employeeId={employee.id} name={employee.nickname ?? employee.fullName} hasPhoto={employee.hasPhoto} size="lg"
            className="ring-4 ring-white shadow-md" />
          <div className="text-center">
            <p className="text-base font-bold text-slate-800">{employee.fullName}</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              {employee.nickname && <span className="text-xs text-slate-400">({employee.nickname})</span>}
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${teamCls}`}>{employee.primaryTeam.code}</span>
              {employee.isActive === false && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">ปิดใช้งาน</span>}
            </div>
          </div>
        </div>

        {/* details */}
        <div className="px-6 pb-5">
          <Row label="วันเกิด"     value={fmtThaiDate(employee.birthDate)}  sub={calcAge(employee.birthDate)} />
          <Row label="วันเริ่มงาน" value={fmtThaiDate(employee.startDate)}  sub={calcDuration(employee.startDate)} />
          <Row label="การศึกษา (ป.ตรี)" value={edu || '—'} />
          <Row label="ทีม"         value={`${employee.primaryTeam.code} — ${employee.primaryTeam.name}`} />
        </div>
      </div>
    </div>
  )
}
