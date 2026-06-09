'use client'

import { useEffect, useRef, useState } from 'react'
import type { Equipment, Site, EquipmentAssignment } from '@/lib/types'

interface Props {
  equipment:   Equipment
  date:        string
  assignments: EquipmentAssignment[]
  sites:       Site[]
  onSave:      (payload: Record<string, unknown>) => Promise<void>
  onDelete:    (id: number) => Promise<void>
  onClose:     () => void
}

export default function EquipmentPopup({ equipment, date, assignments, sites, onSave, onDelete, onClose }: Props) {
  const ref    = useRef<HTMLDivElement>(null)
  const [siteId, setSiteId] = useState('')
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

  async function handleSave() {
    if (!siteId) return
    setSaving(true)
    try {
      await onSave({ equipmentId: equipment.id, assignedDate: date, siteId: parseInt(siteId), notes: notes || undefined })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-72 rounded-lg border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {equipment.internalNo ?? equipment.serialNo}
              {equipment.isRental && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600">เช่า</span>}
            </p>
            <p className="text-xs text-slate-400">{equipment.type.code} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {assignments.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-1">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{a.site?.code ?? '—'}</span>
                {!a.isLocked ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                  : <span className="text-slate-300 text-[10px]">🔒 ล็อก</span>}
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">ไซต์งาน *</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
              <option value="">— เลือกไซต์ —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="หมายเหตุ..."
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
          </div>
          <button onClick={handleSave} disabled={saving || !siteId}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
