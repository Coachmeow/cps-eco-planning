'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Equipment, EquipmentType, Site, EquipmentAssignment } from '@/lib/types'

interface Props {
  equipment:    Equipment
  date:         string
  assignments:  EquipmentAssignment[]
  sites:        Site[]
  allEquipment:         Equipment[]
  equipmentAssignments?: EquipmentAssignment[]   // ทั้งเดือนของเครื่องนี้ (ใช้หาวันลูกของงานหลายวัน)
  initialDays?:         number                   // จำนวนวันเริ่มต้น (จากการเลือกช่วงวันในปฏิทิน)
  canEdit?:             boolean
  onSave:               (payloads: Record<string, unknown>[]) => Promise<void>
  onDelete:             (id: number) => Promise<void>
  onMove?:              (p: { assignmentId: number; newStartDate: string }) => Promise<void>
  onClose:              () => void
}

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1))

const SITE_DOT: Record<string, string> = {
  emerald: 'bg-emerald-400', sky: 'bg-sky-400', violet: 'bg-violet-400',
  rose: 'bg-rose-400', amber: 'bg-amber-400', orange: 'bg-orange-400',
  cyan: 'bg-cyan-400', indigo: 'bg-indigo-400', pink: 'bg-pink-400',
  teal: 'bg-teal-400', lime: 'bg-lime-400', red: 'bg-red-400',
}

export default function EquipmentPopup({
  equipment, date, assignments, sites, allEquipment,
  equipmentAssignments = [],
  initialDays,
  canEdit = true,
  onSave, onDelete, onMove, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // เลื่อนงาน (reschedule) — เปิดช่องเลือกวันเริ่มใหม่ต่อรายการวันแม่
  const [moveFor,  setMoveFor]  = useState<number | null>(null)
  const [moveDate, setMoveDate] = useState('')
  const [moving,   setMoving]   = useState(false)
  function openMove(id: number, startDate: string) { setMoveFor(id); setMoveDate(startDate.slice(0, 10)) }
  async function doMove() {
    if (!onMove || moveFor == null || !moveDate) return
    setMoving(true)
    try { await onMove({ assignmentId: moveFor, newStartDate: moveDate }); setMoveFor(null) }
    catch (e) { alert(`เลื่อนไม่สำเร็จ: ${e instanceof Error ? e.message : e}`) }
    finally { setMoving(false) }
  }
  const movePanel = (
    <div className="mt-1.5 flex items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1.5">
      <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)}
        className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none" />
      <button onClick={doMove} disabled={moving}
        className="rounded bg-sky-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-50">
        {moving ? '...' : 'ยืนยันเลื่อน'}
      </button>
      <button onClick={() => setMoveFor(null)} className="text-[11px] text-slate-400 hover:text-slate-600">ยกเลิก</button>
    </div>
  )

  const [siteId,     setSiteId]     = useState('')
  const [days,       setDays]       = useState(String(Math.min(Math.max(initialDays ?? 1, 1), 31)))
  const [showAdd,    setShowAdd]    = useState(assignments.length === 0)   // มีจองแล้ว → ซ่อนฟอร์มจองใหม่
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

  // ── สถานะส่งซ่อม/Cal ตามช่วงวันที่เลือก (date + days) — จองได้ถ้าไม่ทับช่วงส่งซ่อม/Cal (จองหลังวันรับกลับได้) ──
  const [maintList, setMaintList] = useState<{ equipmentId: number; state: string; type?: string; expectedDate?: string | null }[]>([])
  useEffect(() => {
    const d = Math.min(Math.max(parseInt(days) || 1, 1), 31)
    let alive = true
    fetch(`/api/equipment-assignments/maintenance?start=${date}&days=${d}`)
      .then(r => (r.ok ? r.json() : []))
      .then(rows => { if (alive) setMaintList(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setMaintList([]) })
    return () => { alive = false }
  }, [date, days])
  const maintByEq = useMemo(() => new Map(maintList.map(m => [m.equipmentId, m])), [maintList])
  const maintLabel = (t?: string) => (t === 'CALIBRATION' ? 'ส่งแคล (Cal)' : 'ส่งซ่อม')

  const mainMaint = maintByEq.get(equipment.id)
  const isRetired = equipment.status === 'RETIRED'
  const bookable  = !isRetired && mainMaint?.state !== 'blocked'
  const tentative = bookable && mainMaint?.state === 'tentative'

  // Group all other equipment by type; own type first (เฉพาะเครื่องพร้อมใช้ ACTIVE)
  const groups = useMemo(() => {
    const map = new Map<number, { type: EquipmentType; items: Equipment[] }>()
    for (const eq of allEquipment) {
      if (eq.id === equipment.id) continue
      if (eq.status === 'RETIRED') continue                       // ปลดระวาง → ไม่ให้เลือก
      if (maintByEq.get(eq.id)?.state === 'blocked') continue     // ทับช่วงส่งซ่อม/Cal → ไม่ให้เลือก (นอกช่วงเลือกได้)
      if (!map.has(eq.typeId)) map.set(eq.typeId, { type: eq.type, items: [] })
      map.get(eq.typeId)!.items.push(eq)
    }
    const arr = Array.from(map.values())
    // own type first
    arr.sort((a, b) =>
      a.type.id === equipment.typeId ? -1 : b.type.id === equipment.typeId ? 1 : 0
    )
    return arr
  }, [allEquipment, equipment.id, equipment.typeId, maintByEq])

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
            <div className="border-b border-slate-100 px-4 py-2 space-y-2">
              <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
              {assignments.map((a) => {
                // งานหลายวัน → รวมตัวแม่ + ตัวลูก เรียงตามวัน
                const group = a.parentId == null
                  ? [a, ...equipmentAssignments.filter((x) => x.parentId === a.id)]
                      .sort((x, y) => x.assignedDate.localeCompare(y.assignedDate))
                  : [a]

                if (group.length <= 1) {
                  return (
                    <div key={a.id} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700">{a.site?.code ?? '—'}</span>
                        <div className="flex items-center gap-2">
                          {canEdit && !a.isLocked && a.parentId == null && onMove &&
                            <button onClick={() => openMove(a.id, a.assignedDate)} className="text-sky-500 hover:text-sky-700">เลื่อน</button>}
                          {canEdit && !a.isLocked
                            ? <button onClick={() => onDelete(a.id)} className="text-red-400 hover:text-red-600">ลบ</button>
                            : a.isLocked ? <span className="text-slate-300 text-[10px]">🔒 ล็อก</span> : null}
                        </div>
                      </div>
                      {a.notes && <p className="mt-0.5 text-[11px] text-amber-600">📝 {a.notes}</p>}
                      {moveFor === a.id && movePanel}
                    </div>
                  )
                }

                return (
                  <div key={a.id} className="rounded-lg border border-slate-100 p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-700">
                        {a.site?.code ?? '—'}
                        <span className="ml-1 font-normal text-slate-400">({group.length} วัน)</span>
                      </div>
                      {canEdit && !a.isLocked && onMove &&
                        <button onClick={() => openMove(a.id, a.assignedDate)} className="text-[11px] text-sky-500 hover:text-sky-700">เลื่อนทั้งงาน</button>}
                    </div>
                    {a.notes && <p className="mb-1 text-[11px] text-amber-600">📝 {a.notes}</p>}
                    {moveFor === a.id && movePanel}
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

          {!canEdit && (
            <div className="px-4 py-3 text-xs text-slate-400">👁 โหมดดูอย่างเดียว — ไม่มีสิทธิ์จองเครื่องมือ</div>
          )}

          {/* จองไม่ได้: ปลดระวาง หรือ ทับช่วงส่งซ่อม/Cal ในช่วงวันที่เลือก */}
          {canEdit && !bookable && (
            <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-700">
              {isRetired ? (
                <>🔧 เครื่องนี้<b>ปลดระวาง</b>แล้ว — จองไม่ได้</>
              ) : (
                <>🔧 ช่วงวันที่เลือกเครื่องนี้อยู่ระหว่าง<b>{maintLabel(mainMaint?.type)}</b> — จองไม่ได้
                  <p className="mt-1 text-[11px] text-amber-600">
                    {mainMaint?.expectedDate
                      ? <>กำหนดรับกลับ {fmtDay(mainMaint.expectedDate)} — เลือกวันเริ่ม/จำนวนวันให้เลยวันรับกลับ จะจองได้</>
                      : 'ยังไม่มีกำหนดรับกลับ'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* จองได้ แต่อยู่หลังวันกำหนดรับกลับ ยังไม่ยืนยันรับเครื่องจริง → เตือนเผื่อเลื่อน */}
          {canEdit && tentative && (
            <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              ⚠ จองหลังกำหนดรับกลับจาก<b>{maintLabel(mainMaint?.type)}</b>{mainMaint?.expectedDate ? ` (${fmtDay(mainMaint.expectedDate)})` : ''} — ยังไม่ยืนยันรับเครื่องจริง เผื่อเลื่อน
            </div>
          )}

          {/* ปุ่ม Expand: มีจองอยู่แล้วแต่ยังไม่กางฟอร์ม → กดเพื่อจองเพิ่ม (ซ้อนวัน) */}
          {canEdit && bookable && !showAdd && (
            <div className="px-4 py-3">
              <button onClick={() => setShowAdd(true)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
                + จองเพิ่ม (ซ้อนวัน) ▾
              </button>
            </div>
          )}

          {/* ── Form (เฉพาะผู้มีสิทธิ์จัดแผน + เครื่องพร้อมใช้ + กางฟอร์มแล้ว) ── */}
          {canEdit && bookable && showAdd && (
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
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none" />
              </div>
            </div>
          </div>
          )}

          {/* ── Companion section ── */}
          {canEdit && bookable && showAdd && (
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
        {canEdit && bookable && showAdd && (
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
