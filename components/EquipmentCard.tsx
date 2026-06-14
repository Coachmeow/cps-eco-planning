'use client'

import { useEffect, useRef, useState } from 'react'
import { calcDuration, fmtThaiDate } from '@/lib/employeeProfile'

interface EqEvent {
  id: number; type: 'REPAIR' | 'CALIBRATION'
  sentDate: string; expectedDate: string | null; returnedDate: string | null
  nextDueDate: string | null; vendor: string | null; cost: number | null; notes: string | null
}
interface EqDetail {
  id: number; internalNo: string | null; serialNo: string | null
  type: { code: string; name: string }
  status: string; brand: string | null; model: string | null; vendor: string | null
  purchaseDate: string | null; purchasePrice: number | null; lifespanYears: number | null
  calDueDate: string | null; isRental: boolean; rentalVendor: string | null
  hasPhoto?: boolean; usageDays: number; events: EqEvent[]
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700', CALIBRATING: 'bg-purple-100 text-purple-700',
  BROKEN: 'bg-red-100 text-red-700', RETIRED: 'bg-slate-200 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'พร้อมใช้', CALIBRATING: 'ส่ง Cal', BROKEN: 'ส่งซ่อม', RETIRED: 'ปลดระวาง',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-700">{value}</span>
    </div>
  )
}

export default function EquipmentCard({ equipmentId, onClose }: { equipmentId: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [eq, setEq] = useState<EqDetail | null>(null)

  useEffect(() => {
    fetch(`/api/equipment/${equipmentId}`).then(r => r.json()).then(setEq).catch(() => {})
  }, [equipmentId])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const baht = (n: number) => n.toLocaleString('th-TH')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {!eq ? (
          <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              {eq.hasPhoto
                ? <img src={`/api/equipment/${eq.id}/photo`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">🔧</span>}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold text-slate-800">{eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}</p>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[eq.status] ?? 'bg-slate-100'}`}>{STATUS_LABEL[eq.status] ?? eq.status}</span>
                  {eq.isRental && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600">เช่า</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{eq.type.code} · {eq.type.name}</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-3">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-sky-700">{eq.usageDays}</p>
                  <p className="text-[10px] text-slate-500">วันใช้งานสะสม</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-700">{calcDuration(eq.purchaseDate) ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">อายุการใช้งาน</p>
                </div>
              </div>

              <Row label="ยี่ห้อ / รุ่น" value={[eq.brand, eq.model].filter(Boolean).join(' ') || '—'} />
              <Row label="Serial Number" value={eq.serialNo ?? '—'} />
              <Row label="ผู้ขาย / Vendor" value={eq.vendor ?? eq.rentalVendor ?? '—'} />
              <Row label="วันที่ซื้อ/เริ่มใช้" value={fmtThaiDate(eq.purchaseDate)} />
              <Row label="ราคาซื้อ" value={eq.purchasePrice != null ? `${baht(eq.purchasePrice)} บาท` : '—'} />
              <Row label="อายุใช้งานประเมิน" value={eq.lifespanYears != null ? `${eq.lifespanYears} ปี` : '—'} />
              <Row label="กำหนด Cal ถัดไป" value={fmtThaiDate(eq.calDueDate)} />
            </div>

            {/* ประวัติซ่อม/Cal */}
            <div className="border-t border-slate-100 px-5 py-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติซ่อม / Calibrate</p>
              {eq.events.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-300">ยังไม่มีประวัติ</p>
              ) : (
                <div className="space-y-2">
                  {eq.events.map(ev => (
                    <div key={ev.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ev.type === 'REPAIR' ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
                          {ev.type === 'REPAIR' ? '🔧 ซ่อม' : '📐 Cal'}
                        </span>
                        <span className={ev.returnedDate ? 'text-emerald-600' : 'text-amber-600'}>
                          {ev.returnedDate ? '✓ รับกลับแล้ว' : '● ยังไม่กลับ'}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500">
                        ส่ง {fmtThaiDate(ev.sentDate)}{ev.returnedDate && ` → กลับ ${fmtThaiDate(ev.returnedDate)}`}
                      </div>
                      {(ev.vendor || ev.cost != null) && (
                        <div className="text-slate-400">
                          {ev.vendor}{ev.vendor && ev.cost != null && ' · '}{ev.cost != null && `${baht(ev.cost)} บาท`}
                        </div>
                      )}
                      {ev.notes && <div className="text-slate-400">📝 {ev.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
