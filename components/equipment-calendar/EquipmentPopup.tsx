'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Equipment, EquipmentType, Site, EquipmentAssignment } from '@/lib/types'

interface Props {
  equipment:    Equipment
  date:         string
  assignments:  EquipmentAssignment[]
  sites:        Site[]
  allEquipment: Equipment[]
  canEdit?:     boolean
  onSave:       (payloads: Record<string, unknown>[]) => Promise<void>
  onDelete:     (id: number) => Promise<void>
  onClose:      () => void
}

const DAY_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                     '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

const SITE_DOT: Record<string, string> = {
  emerald: 'bg-emerald-400', sky: 'bg-sky-400', violet: 'bg-violet-400',
  rose: 'bg-rose-400', amber: 'bg-amber-400', orange: 'bg-orange-400',
  cyan: 'bg-cyan-400', indigo: 'bg-indigo-400', pink: 'bg-pink-400',
  teal: 'bg-teal-400', lime: 'bg-lime-400', red: 'bg-red-400',
}

export default function EquipmentPopup({
  equipment, date, assignments, sites, allEquipment,
  canEdit = true,
  onSave, onDelete, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const [siteId,     setSiteId]     = useState('')
  const [days,       setDays]       = useState('1')
  const [notes,      setNotes]      = useState('')
  const [companions, setCompanions] = useState<number[]>([])
  const [search,     setSearch]     = useState('')
  const [expanded,   setExpanded]   = useState<Set<number>>(
    new Set([equipment.typeId])   // expand own type by default
  )
  const [saving, setSaving] = useState(false)

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

  // Group all other equipment by type; own type first
  const groups = useMemo(() => {
    const map = new Map<number, { type: EquipmentType; items: Equipment[] }>()
    for (const eq of allEquipment) {
      if (eq.id === equipment.id) continue
      if (!map.has(eq.typeId)) map.set(eq.typeId, { type: eq.type, items: [] })
      map.get(eq.typeId)!.items.push(eq)
    }
    const arr = Array.from(map.values())
    // own type first
    arr.sort((a, b) =>
      a.type.id === equipment.typeId ? -1 : b.type.id === equipment.typeId ? 1 : 0
    )
    return arr
  }, [allEquipment, equipment.id, equipment.typeId])

  const q = search.trim().toLowerCase()

  function matches(eq: Equipment): boolean {
    if (!q) return true
    return (eq.internalNo ?? '').toLowerCase().includes(q)
        || (eq.serialNo  ?? '').toLowerCase().includes(q)
        || eq.type.code.toLowerCase().includes(q)
        || eq.type.name.toLowerCase().includes(q)
  }

  function toggleExpand(typeId: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(typeId) ? next.delete(typeId) : next.add(typeId)
      return next
    })
  }

  function toggleCompanion(id: number) {
    setCompanions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function toggleAllInGroup(items: Equipment[]) {
    const ids = items.map(e => e.id)
    const allSel = ids.every(id => companions.includes(id))
    setCompanions(prev =>
      allSel ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    )
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
    try { await onSave(payloads); onClose() }
    finally { setSaving(false) }
  }

  const totalEquip = 1 + companions.length
  const totalDays  = parseInt(days)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-[420px] rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
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

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Existing assignments */}
          {assignments.length > 0 && (
            <div className="border-b border-slate-100 px-4 py-2 space-y-1">
              <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">{a.site?.code ?? '—'}</span>
                  {canEdit && !a.isLocked
                    ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                    : a.isLocked ? <span className="text-slate-300 text-[10px]">🔒 ล็อก</span> : null}
                </div>
              ))}
            </div>
          )}

          {!canEdit && (
            <div className="px-4 py-3 text-xs text-slate-400">👁 โหมดดูอย่างเดียว — ไม่มีสิทธิ์จองเครื่องมือ</div>
          )}

          {/* ── Form (เฉพาะผู้มีสิทธิ์จัดแผน) ── */}
          {canEdit && (
          <div className="px-4 py-3 space-y-3 border-b border-slate-100">
            {/* Site dropdown */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">ไซต์งาน <span className="text-red-400">*</span></label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
                <option value="">— เลือกไซต์ —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
              {/* selected site color preview */}
              {siteId && (() => {
                const s = sites.find(x => String(x.id) === siteId)
                if (!s) return null
                const dotCls = SITE_DOT[s.color ?? 'emerald'] ?? 'bg-slate-400'
                return (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`h-2.5 w-2.5 rounded-full ${dotCls}`} />
                    <span className="font-medium text-slate-700">{s.code}</span>
                    {s.province && <span className="text-slate-400">· {s.province}</span>}
                  </div>
                )
              })()}
            </div>

            {/* Days + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
                <select value={days} onChange={e => setDays(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none">
                  {DAY_OPTIONS.map(v => <option key={v} value={v}>{v} วัน</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="หมายเหตุ..."
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm placeholder-slate-300 focus:outline-none" />
              </div>
            </div>
          </div>
          )}

          {/* ── Companion section ── */}
          {canEdit && (
          <div className="px-4 py-3">
            {/* Section header */}
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">🔧 เครื่องมือร่วม</p>
              <div className="flex items-center gap-2">
                {companions.length > 0 && (
                  <>
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {companions.length} เครื่อง
                    </span>
                    <button onClick={() => setCompanions([])}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                      ล้าง
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Search */}
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  ค้นหาเครื่องมือ..."
              className="mb-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs placeholder-slate-400 focus:bg-white focus:outline-none focus:border-slate-300" />

            {/* Accordion groups */}
            <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {groups.map(({ type, items }) => {
                const filtered   = q ? items.filter(matches) : items
                if (q && filtered.length === 0) return null  // hide empty groups when searching

                const isExpanded = expanded.has(type.id) || (!!q && filtered.length > 0)
                const selCount   = items.filter(e => companions.includes(e.id)).length
                const allSel     = items.length > 0 && items.every(e => companions.includes(e.id))

                return (
                  <div key={type.id} className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                    {/* Type row */}
                    <button type="button" onClick={() => toggleExpand(type.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] text-slate-400 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="text-xs font-semibold text-slate-700">{type.code}</span>
                        <span className="text-[10px] text-slate-400 hidden sm:inline">{type.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selCount > 0 && (
                          <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-white">{selCount}</span>
                        )}
                        <span className="text-[10px] text-slate-300">{items.length}</span>
                      </div>
                    </button>

                    {/* Equipment chips */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-3 pb-2.5 pt-2">
                        <div className="mb-1.5">
                          <button onClick={() => toggleAllInGroup(items)}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              allSel ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}>
                            {allSel ? '✓ ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {filtered.map(eq => {
                            const sel = companions.includes(eq.id)
                            return (
                              <button key={eq.id} onClick={() => toggleCompanion(eq.id)}
                                className={`flex items-center gap-0.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-all ${
                                  sel
                                    ? 'border-slate-600 bg-slate-700 text-white shadow-sm'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                                }`}>
                                {sel && <span className="text-[9px] leading-none">✓</span>}
                                <span>{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</span>
                                {eq.isRental && (
                                  <span className={`rounded px-0.5 text-[8px] leading-none ${sel ? 'bg-white/20' : 'bg-amber-100 text-amber-600'}`}>เช่า</span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}
        </div>

        {/* ── Save button (fixed at bottom) ── */}
        {canEdit && (
        <div className="shrink-0 border-t border-slate-100 px-4 pb-4 pt-3">
          <button onClick={handleSave} disabled={saving || !siteId}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors">
            {saving
              ? 'กำลังบันทึก...'
              : totalEquip > 1
                ? `บันทึก (${totalEquip} เครื่อง × ${totalDays} วัน)`
                : totalDays > 1
                  ? `บันทึก (${totalDays} วัน)`
                  : 'บันทึก'}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
