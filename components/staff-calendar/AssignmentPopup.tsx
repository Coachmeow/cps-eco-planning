'use client'

import { useEffect, useRef, useState } from 'react'
import type { Employee, Site, ServiceTeam, StaffAssignment, AssignmentStatus } from '@/lib/types'

interface Props {
  employee:    Employee
  date:        string
  assignments: StaffAssignment[]
  sites:       Site[]
  teams:       ServiceTeam[]
  onSave:      (payload: Record<string, unknown>) => Promise<void>
  onDelete:    (id: number) => Promise<void>
  onClose:     () => void
}

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'FIELD',    label: 'ภาคสนาม (Field)' },
  { value: 'OFFICE',   label: 'สำนักงาน (S)' },
  { value: 'LEAVE',    label: 'ลา (B)' },
  { value: 'HOLIDAY',  label: 'วันหยุด (V)' },
  { value: 'CAL',      label: 'ส่ง Calibrate' },
  { value: 'TRAINING', label: 'อบรม' },
]

export default function AssignmentPopup({ employee, date, assignments, sites, teams, onSave, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [status,        setStatus]        = useState<AssignmentStatus>('FIELD')
  const [siteId,        setSiteId]        = useState('')
  const [serviceTypeId, setServiceTypeId] = useState(String(employee.primaryTeamId))
  const [estimatedDays, setEstimatedDays] = useState('1')
  const [notes,         setNotes]         = useState('')
  const [saving,        setSaving]        = useState(false)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        employeeId: employee.id, assignedDate: date,
        siteId:        siteId        ? parseInt(siteId)        : undefined,
        serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : undefined,
        estimatedDays: parseFloat(estimatedDays), status, notes: notes || undefined,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{employee.nickname ?? employee.fullName}</p>
            <p className="text-xs text-slate-400">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {assignments.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-1">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">
                  {a.site?.code ?? a.status}
                  {a.isCrossTeam && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-600">{a.serviceType?.code}</span>}
                  {Number(a.estimatedDays) > 1 && <span className="ml-1 text-slate-400">({a.estimatedDays} วัน)</span>}
                </span>
                {!a.isLocked
                  ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                  : <span className="text-slate-300 text-[10px]">🔒 ล็อก</span>}
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">เพิ่มรายการใหม่</p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {status === 'FIELD' && (
            <>
              <div>
                <label className="block text-xs text-slate-500 mb-1">ไซต์งาน</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  <option value="">— เลือกไซต์ —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">ประเภทงาน</label>
                <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}{t.id === employee.primaryTeamId ? ' (ทีมหลัก)' : ''}</option>)}
                </select>
                {serviceTypeId && parseInt(serviceTypeId) !== employee.primaryTeamId && (
                  <p className="mt-1 text-xs text-sky-500">Cross-team assignment</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
                <select value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                  {['0.5','1','2','3','4','5'].map((v) => <option key={v} value={v}>{v} วัน</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ห้ามเปลี่ยน, Audit"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
