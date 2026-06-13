'use client'

import { useEffect, useRef, useState } from 'react'
import type { Employee, Site, ServiceTeam, StaffAssignment, AssignmentStatus } from '@/lib/types'

interface Props {
  employee:     Employee
  date:         string
  assignments:  StaffAssignment[]
  sites:        Site[]
  teams:        ServiceTeam[]
  allEmployees:        Employee[]
  employeeAssignments?: StaffAssignment[]   // ทั้งเดือนของพนักงานคนนี้ (ใช้หาวันลูกของงานหลายวัน)
  canEdit?:            boolean
  onSave:              (payloads: Record<string, unknown>[]) => Promise<void>
  onDelete:            (id: number) => Promise<void>
  onClose:             () => void
}

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'FIELD',    label: 'ภาคสนาม (Field)' },
  { value: 'OFFICE',   label: 'สำนักงาน (S)' },
  { value: 'LEAVE',    label: 'ลา (B)' },
  { value: 'HOLIDAY',  label: 'วันหยุด (V)' },
  { value: 'CAL',      label: 'ส่ง Calibrate' },
  { value: 'TRAINING', label: 'อบรม' },
]

export default function AssignmentPopup({
  employee, date, assignments, sites, teams, allEmployees,
  employeeAssignments = [],
  canEdit = true,
  onSave, onDelete, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const [status,        setStatus]        = useState<AssignmentStatus>('FIELD')
  const [siteId,        setSiteId]        = useState('')
  const [serviceTypeId, setServiceTypeId] = useState(String(employee.primaryTeamId))
  const [estimatedDays, setEstimatedDays] = useState('1')
  const [notes,         setNotes]         = useState('')
  const [companions,    setCompanions]    = useState<number[]>([])
  const [showOthers,    setShowOthers]    = useState(false)
  const [saving,        setSaving]        = useState(false)

  // click-outside closes popup
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  // companion lists
  const sameTeam  = allEmployees.filter(e => e.primaryTeamId === employee.primaryTeamId && e.id !== employee.id)
  const otherTeam = allEmployees.filter(e => e.primaryTeamId !== employee.primaryTeamId)
  const displayed = showOthers ? [...sameTeam, ...otherTeam] : sameTeam
  const allTeamSelected = sameTeam.length > 0 && sameTeam.every(e => companions.includes(e.id))

  function toggleCompanion(id: number) {
    setCompanions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function toggleAllTeam() {
    const ids = sameTeam.map(e => e.id)
    if (allTeamSelected) {
      setCompanions(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setCompanions(prev => [...new Set([...prev, ...ids])])
    }
  }

  async function handleSave() {
    setSaving(true)
    const base = {
      assignedDate:  date,
      siteId:        siteId        ? parseInt(siteId)        : undefined,
      serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : undefined,
      estimatedDays: parseFloat(estimatedDays),
      status,
      notes: notes || undefined,
    }
    const payloads = [
      { ...base, employeeId: employee.id },
      ...companions.map(empId => ({ ...base, employeeId: empId })),
    ]
    try {
      await onSave(payloads)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const totalPeople = 1 + companions.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-96 rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{employee.nickname ?? employee.fullName}</p>
            <p className="text-xs text-slate-400">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* ── Existing assignments ── */}
        {assignments.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-2">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {assignments.map((a) => {
              // งานหลายวัน → รวมตัวแม่ + ตัวลูก เรียงตามวัน
              const group = a.parentId == null
                ? [a, ...employeeAssignments.filter((x) => x.parentId === a.id)]
                    .sort((x, y) => x.assignedDate.localeCompare(y.assignedDate))
                : [a]

              // งานวันเดียว
              if (group.length <= 1) {
                return (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">
                      {a.site?.code ?? a.status}
                      {a.isCrossTeam && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-600">{a.serviceType?.code}</span>}
                    </span>
                    {canEdit && !a.isLocked
                      ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                      : a.isLocked ? <span className="text-slate-300 text-[10px]">🔒 ล็อก</span> : null}
                  </div>
                )
              }

              // งานหลายวัน → แตกรายวัน
              return (
                <div key={a.id} className="rounded-lg border border-slate-100 p-2">
                  <div className="mb-1 text-xs font-semibold text-slate-700">
                    {a.site?.code ?? a.status}
                    {a.isCrossTeam && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-600">{a.serviceType?.code}</span>}
                    <span className="ml-1 font-normal text-slate-400">({group.length} วัน)</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.map((g) => {
                      const isParent = g.parentId == null
                      return (
                        <div key={g.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{isParent ? '●' : '○'} {fmtDay(g.assignedDate)}</span>
                          {canEdit && !g.isLocked
                            ? <button onClick={() => onDelete(g.id)}
                                className={isParent ? 'font-medium text-red-500 hover:text-red-700' : 'text-red-400 hover:text-red-600'}>
                                {isParent ? 'ลบทั้งงาน' : 'ลบวันนี้'}
                              </button>
                            : g.isLocked ? <span className="text-slate-300 text-[10px]">🔒</span> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* read-only note for viewers */}
        {!canEdit && (
          <div className="px-4 py-3 text-xs text-slate-400">👁 โหมดดูอย่างเดียว — ไม่มีสิทธิ์แก้ไขแผนงาน</div>
        )}

        {/* ── Form (เฉพาะผู้มีสิทธิ์จัดแผน) ── */}
        {canEdit && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">เพิ่มรายการใหม่</p>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {status === 'FIELD' && (
            <>
              {/* Site */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">ไซต์งาน</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  <option value="">— เลือกไซต์ —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>

              {/* Service type */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">ประเภทงาน</label>
                <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}{t.id === employee.primaryTeamId ? ' (ทีมหลัก)' : ''}
                    </option>
                  ))}
                </select>
                {serviceTypeId && parseInt(serviceTypeId) !== employee.primaryTeamId && (
                  <p className="mt-1 text-xs text-sky-500">Cross-team assignment</p>
                )}
              </div>

              {/* Days */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
                <select value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {['0.5', ...Array.from({ length: 20 }, (_, i) => String(i + 1))].map((v) => (
                    <option key={v} value={v}>{v} วัน</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ห้ามเปลี่ยน, Audit"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
          </div>
        </div>
        )}

        {/* ── Companion section ── */}
        {canEdit && displayed.length > 0 && (
          <div className="border-t border-slate-100 px-4 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">👥 คนร่วมงาน</p>
              <div className="flex items-center gap-2">
                {companions.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {companions.length} คนที่เลือก
                  </span>
                )}
                {sameTeam.length > 0 && (
                  <button onClick={toggleAllTeam}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      allTeamSelected
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {allTeamSelected ? '✓ ทั้งทีม' : `เลือกทั้งทีม ${employee.primaryTeam.code}`}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {displayed.map(emp => {
                const sel = companions.includes(emp.id)
                const isOtherTeam = emp.primaryTeamId !== employee.primaryTeamId
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleCompanion(emp.id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      sel
                        ? 'border-slate-600 bg-slate-700 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {sel && <span className="text-[10px] leading-none">✓</span>}
                    <span>{emp.nickname ?? emp.fullName.split(' ')[0]}</span>
                    {isOtherTeam && (
                      <span className={`rounded px-1 text-[9px] ${sel ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {emp.primaryTeam.code}
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Toggle show other teams */}
              {otherTeam.length > 0 && (
                <button
                  onClick={() => setShowOthers(o => !o)}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                >
                  {showOthers ? '▴ ซ่อนทีมอื่น' : `▾ +ทีมอื่น (${otherTeam.length} คน)`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Save button ── */}
        {canEdit && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving
              ? 'กำลังบันทึก...'
              : totalPeople > 1
                ? `บันทึก (${totalPeople} คน)`
                : 'บันทึก'}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
