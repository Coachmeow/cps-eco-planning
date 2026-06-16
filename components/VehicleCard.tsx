'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtThaiDate } from '@/lib/employeeProfile'
import { PURPOSE_META } from '@/lib/vehiclePurpose'

interface VBooking {
  id: number; assignedDate: string; estimatedDays: number; purpose: 'FIELD'|'SAMPLE'|'DELIVERY'|'SHUTTLE'|'OTHER'
  site: { code: string } | null; destination: string | null
  driver: { nickname: string | null; fullName: string } | null; driverName: string | null; notes: string | null
}
interface VDetail {
  id: number; licensePlate: string; name: string | null; vehicleType: string | null
  brand: string | null; model: string | null; seats: number | null; status: string
  hasPhoto?: boolean; usageDays: number; bookings: VBooking[]
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700', MAINTENANCE: 'bg-amber-100 text-amber-700', RETIRED: 'bg-slate-200 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'พร้อมใช้', MAINTENANCE: 'ซ่อมบำรุง', RETIRED: 'ปลดระวาง' }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-700">{value}</span>
    </div>
  )
}

export default function VehicleCard({ vehicleId, onClose }: { vehicleId: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState<VDetail | null>(null)

  useEffect(() => { fetch(`/api/vehicles/${vehicleId}`).then(r => r.json()).then(setV).catch(() => {}) }, [vehicleId])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {!v ? <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด...</div> : (
          <>
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              {v.hasPhoto
                ? <img src={`/api/vehicles/${v.id}/photo`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">🚗</span>}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold text-slate-800">{v.licensePlate}</p>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[v.status] ?? 'bg-slate-100'}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{[v.name, v.vehicleType, v.brand, v.model].filter(Boolean).join(' · ')}</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-3">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-sky-700">{v.usageDays}</p>
                  <p className="text-[10px] text-slate-500">วันใช้งานสะสม</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-700">{v.seats ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">จำนวนที่นั่ง</p>
                </div>
              </div>
              <Row label="ทะเบียน" value={v.licensePlate} />
              <Row label="ประเภท" value={v.vehicleType ?? '—'} />
              <Row label="ยี่ห้อ / รุ่น" value={[v.brand, v.model].filter(Boolean).join(' ') || '—'} />
            </div>

            <div className="border-t border-slate-100 px-5 py-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">ประวัติการใช้รถล่าสุด</p>
              {v.bookings.length === 0 ? <p className="py-2 text-center text-xs text-slate-300">ยังไม่มีประวัติ</p> : (
                <div className="space-y-2">
                  {v.bookings.map(b => {
                    const where = b.purpose === 'FIELD' ? (b.site?.code ?? b.destination ?? '') : (b.destination ?? '')
                    const driver = b.driver?.nickname ?? b.driver?.fullName ?? b.driverName
                    return (
                      <div key={b.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PURPOSE_META[b.purpose].chip}`}>{PURPOSE_META[b.purpose].icon} {PURPOSE_META[b.purpose].label}</span>
                          <span className="text-slate-400">{fmtThaiDate(b.assignedDate)}{b.estimatedDays > 1 && ` · ${b.estimatedDays} วัน`}</span>
                        </div>
                        {where && <div className="mt-0.5 text-slate-500">📍 {where}</div>}
                        {driver && <div className="text-slate-400">🧑 {driver}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
