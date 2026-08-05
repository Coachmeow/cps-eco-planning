'use client'

import { useEffect, useRef, useState } from 'react'
import type { Vehicle, VehicleBooking, Site, Employee, VehiclePurpose } from '@/lib/types'
import { PURPOSE_META, PURPOSE_ORDER } from '@/lib/vehiclePurpose'
import SearchableSelect from '@/components/SearchableSelect'

interface Props {
  vehicle:      Vehicle
  date:         string
  bookings:     VehicleBooking[]
  vehicleBookings: VehicleBooking[]   // ทั้งเดือนของรถคันนี้ (หาวันลูกของงานหลายวัน)
  sites:        Site[]
  employees:    Employee[]
  initialDays?: number
  canEdit?:     boolean
  onSave:       (payload: Record<string, unknown>) => Promise<void>
  onDelete:     (id: number) => Promise<void>
  onMove?:      (p: { assignmentId: number; newStartDate: string }) => Promise<void>
  onClose:      () => void
}

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1))
const fmtDay = (d: string) => new Date(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

export default function VehiclePopup({
  vehicle, date, bookings, vehicleBookings, sites, employees, initialDays, canEdit = true, onSave, onDelete, onMove, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // เลื่อนงาน (reschedule) — เลือกวันเริ่มใหม่ต่อรายการวันแม่
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
  const [purpose,     setPurpose]     = useState<VehiclePurpose>('FIELD')
  const [siteId,      setSiteId]      = useState('')
  const [destination, setDestination] = useState('')
  const [days,        setDays]        = useState(String(Math.min(Math.max(initialDays ?? 1, 1), 31)))
  const [showAdd,     setShowAdd]     = useState(bookings.length === 0)   // มีจองแล้ว → ซ่อนฟอร์มจองใหม่
  const [driverId,    setDriverId]    = useState('')
  const [driverName,  setDriverName]  = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })

  async function handleSave() {
    if (purpose === 'FIELD' && !siteId && !destination) return
    setSaving(true)
    try {
      await onSave({
        vehicleId: vehicle.id, assignedDate: date, purpose,
        siteId: purpose === 'FIELD' && siteId ? parseInt(siteId) : undefined,
        destination: destination || undefined,
        driverId: driverId ? parseInt(driverId) : undefined,
        driverName: driverName || undefined,
        notes: notes || undefined,
        estimatedDays: parseInt(days),
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="w-96 max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">🚗 {vehicle.licensePlate}{vehicle.name ? ` · ${vehicle.name}` : ''}</p>
            <p className="text-xs text-slate-400">{[vehicle.vehicleType, vehicle.brand, vehicle.model].filter(Boolean).join(' ')} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* Existing bookings */}
        {bookings.length > 0 && (
          <div className="border-b border-slate-100 px-4 py-2 space-y-2">
            <p className="text-xs text-slate-400 mb-1">รายการที่มีอยู่</p>
            {bookings.map(b => {
              const group = b.parentId == null
                ? [b, ...vehicleBookings.filter(x => x.parentId === b.id)].sort((x, y) => x.assignedDate.localeCompare(y.assignedDate))
                : [b]
              const where = b.purpose === 'FIELD' ? (b.site?.code ?? b.destination ?? '') : (b.destination ?? '')
              const driver = b.driver?.nickname ?? b.driver?.fullName ?? b.driverName
              if (group.length <= 1) {
                return (
                  <div key={b.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">{PURPOSE_META[b.purpose].icon} {PURPOSE_META[b.purpose].label}{where ? ` · ${where}` : ''}</span>
                      <div className="flex items-center gap-2">
                        {canEdit && b.parentId == null && onMove &&
                          <button onClick={() => openMove(b.id, b.assignedDate)} className="text-sky-500 hover:text-sky-700">เลื่อน</button>}
                        {canEdit ? <button onClick={() => onDelete(b.id)} className="text-red-400 hover:text-red-600">ลบ</button> : null}
                      </div>
                    </div>
                    {driver && <p className="text-[11px] text-slate-400">🧑 {driver}</p>}
                    {b.notes && <p className="text-[11px] text-amber-600">📝 {b.notes}</p>}
                    {moveFor === b.id && movePanel}
                  </div>
                )
              }
              return (
                <div key={b.id} className="rounded-lg border border-slate-100 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700">{PURPOSE_META[b.purpose].icon} {PURPOSE_META[b.purpose].label}{where ? ` · ${where}` : ''} <span className="font-normal text-slate-400">({group.length} วัน)</span></div>
                    {canEdit && onMove &&
                      <button onClick={() => openMove(b.id, b.assignedDate)} className="text-[11px] text-sky-500 hover:text-sky-700">เลื่อนทั้งงาน</button>}
                  </div>
                  {driver && <p className="mb-1 text-[11px] text-slate-400">🧑 {driver}</p>}
                  {moveFor === b.id && movePanel}
                  <div className="space-y-0.5">
                    {group.map(g => {
                      const isParent = g.parentId == null
                      return (
                        <div key={g.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{isParent ? '●' : '○'} {fmtDay(g.assignedDate)}</span>
                          {canEdit ? <button onClick={() => onDelete(g.id)} className={isParent ? 'font-medium text-red-500 hover:text-red-700' : 'text-red-400 hover:text-red-600'}>{isParent ? 'ลบทั้งงาน' : 'ลบวันนี้'}</button> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ปุ่ม Expand: มีจองอยู่แล้วแต่ยังไม่กางฟอร์ม → กดเพื่อจองเพิ่ม (ซ้อนวัน) */}
        {canEdit && !showAdd && (
          <div className="px-4 py-3">
            <button onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
              + จองเพิ่ม (ซ้อนวัน) ▾
            </button>
          </div>
        )}

        {/* Form */}
        {canEdit && showAdd && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">จองใหม่</p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมวดการใช้</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value as VehiclePurpose)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none">
              {PURPOSE_ORDER.map(p => <option key={p} value={p}>{PURPOSE_META[p].icon} {PURPOSE_META[p].label}</option>)}
            </select>
          </div>
          {purpose === 'FIELD' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">ไซต์งาน</label>
              <SearchableSelect value={siteId} onChange={setSiteId} placeholder="— เลือกไซต์ —"
                options={sites.map(s => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))} />
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">ปลายทาง / รายละเอียด{purpose !== 'FIELD' && ' *'}</label>
            <input value={destination} onChange={e => setDestination(e.target.value)}
              placeholder={purpose === 'FIELD' ? 'เพิ่มเติม (ถ้ามี)' : 'เช่น ห้องแล็บ SGS ลาดกระบัง'}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">จำนวนวัน</label>
            <select value={days} onChange={e => setDays(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none">
              {DAY_OPTIONS.map(v => <option key={v} value={v}>{v} วัน</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">คนขับ</label>
            <select value={driverId} onChange={e => { setDriverId(e.target.value); if (e.target.value) setDriverName('') }}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none">
              <option value="">— เลือกพนักงาน —</option>
              {employees.map(em => <option key={em.id} value={em.id}>{em.nickname ?? em.fullName}</option>)}
            </select>
            <input value={driverName} onChange={e => { setDriverName(e.target.value); if (e.target.value) setDriverId('') }}
              placeholder="หรือพิมพ์ชื่อคนขับนอกระบบ"
              className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="..."
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none" />
          </div>
          <button onClick={handleSave} disabled={saving || (purpose === 'FIELD' ? (!siteId && !destination) : !destination)}
            className="w-full rounded bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? 'กำลังบันทึก...' : `บันทึก${parseInt(days) > 1 ? ` (${days} วัน)` : ''}`}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
