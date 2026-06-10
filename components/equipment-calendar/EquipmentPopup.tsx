'use client'

import { useEffect, useRef, useState } from 'react'
import type { Equipment, Site, EquipmentAssignment } from '@/lib/types'

interface Props {
  equipment:    Equipment
  date:         string
  assignments:  EquipmentAssignment[]
  sites:        Site[]
  allEquipment: Equipment[]
  onSave:       (payloads: Record<string, unknown>[]) => Promise<void>
  onDelete:     (id: number) => Promise<void>
  onClose:      () => void
}

const DAY_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                     '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

// Site color preview for site selector label
const SITE_DOT: Record<string, string> = {
  emerald: 'bg-emerald-400', sky: 'bg-sky-400', violet: 'bg-violet-400',
  rose: 'bg-rose-400', amber: 'bg-amber-400', orange: 'bg-orange-400',
  cyan: 'bg-cyan-400', indigo: 'bg-indigo-400', pink: 'bg-pink-400',
  teal: 'bg-teal-400', lime: 'bg-lime-400', red: 'bg-red-400',
}

export default function EquipmentPopup({
  equipment, date, assignments, sites, allEquipment,
  onSave, onDelete, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const [siteId,      setSiteId]      = useState('')
  const [days,        setDays]        = useState('1')
  const [notes,       setNotes]       = useState('')
  const [companions,  setCompanions]  = useState<number[]>([])
  const [saving,      setSaving]      = useState(false)

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

  // Same-type equipment (companions)
  const sameType = allEquipment.filter(e => e.typeId === equipment.typeId && e.id !== equipment.id)
  const allSameTypeSelected = sameType.length > 0 && sameType.every(e => companions.includes(e.id))

  function toggleCompanion(id: number) {
    setCompanions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function toggleAllType() {
    const ids = sameType.map(e => e.id)
    if (allSameTypeSelected) {
      setCompanions(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setCompanions(prev => [...new Set([...prev, ...ids])])
    }
  }

  async function handleSave() {
    if (!siteId) return
    setSaving(true)
    const base = {
      assignedDate:  date,
      siteId:        parseInt(siteId),
      estimatedDays: parseInt(days),
      notes:         notes || undefined,
    }
    const payloads = [
      { ...base, equipmentId: equipment.id },
      ...companions.map(eqId => ({ ...base, equipmentId: eqId })),
    ]
    try {
      await onSave(payloads)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const totalEquip = 1 + companions.length
  const totalDays  = parseInt(days)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-96 rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-800">
                {equipment.internalNo ?? equipment.serialNo ?? `#${equipment.id}`}
              </p>
              {equipment.isRental && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">เช่า</span>
              )}
            </div>
            <p className="text-xs text-slate-400">{equipment.type.code} · {equipment.type.name} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* ── Existing assignments ── */}
        {assignments.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-1">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{a.site?.code ?? '—'}</span>
                {!a.isLocked
                  ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                  : <span className="text-slate-300 text-[10px]">🔒 ล็อก</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Form ── */}
        <div className="px-4 py-3 space-y-3">
          {/* Site selector */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">ไซต์งาน <span className="text-red-400">*</span></label>
            <div className="flex flex-col gap-1">
              {sites.map(s => {
                const dotCls = SITE_DOT[s.color ?? 'emerald'] ?? 'bg-slate-400'
                const sel    = siteId === String(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSiteId(String(s.id))}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                      sel
                        ? 'border-slate-600 bg-slate-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sel ? 'bg-white' : dotCls}`} />
                    <span className="font-medium">{s.code}</span>
                    <span className={`text-xs ${sel ? 'text-white/70' : 'text-slate-400'}`}>{s.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
            <select value={days} onChange={e => setDays(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
              {DAY_OPTIONS.map(v => <option key={v} value={v}>{v} วัน</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="หมายเหตุ..."
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
          </div>
        </div>

        {/* ── Companion equipment section ── */}
        {sameType.length > 0 && (
          <div className="border-t border-slate-100 px-4 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">🔧 เครื่องมือร่วม ({equipment.type.code})</p>
              <div className="flex items-center gap-2">
                {companions.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {companions.length} เครื่อง
                  </span>
                )}
                <button
                  onClick={toggleAllType}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    allSameTypeSelected
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {allSameTypeSelected ? '✓ ทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {sameType.map(eq => {
                const sel = companions.includes(eq.id)
                return (
                  <button
                    key={eq.id}
                    onClick={() => toggleCompanion(eq.id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      sel
                        ? 'border-slate-600 bg-slate-700 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {sel && <span className="text-[10px] leading-none">✓</span>}
                    <span>{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</span>
                    {eq.isRental && (
                      <span className={`rounded px-1 text-[9px] ${sel ? 'bg-white/20' : 'bg-amber-100 text-amber-600'}`}>เช่า</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Save button ── */}
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <button
            onClick={handleSave}
            disabled={saving || !siteId}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            {saving
              ? 'กำลังบันทึก...'
              : totalEquip > 1
                ? `บันทึก (${totalEquip} เครื่อง × ${totalDays} วัน)`
                : totalDays > 1
                  ? `บันทึก (${totalDays} วัน)`
                  : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
