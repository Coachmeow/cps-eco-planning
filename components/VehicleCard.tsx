'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { fmtThaiDate } from '@/lib/employeeProfile'
import { PURPOSE_META } from '@/lib/vehiclePurpose'

interface VLog {
  id: number; type: 'USE' | 'REFUEL'; mileage: number; loggedAt: string
  driver: { nickname: string | null; fullName: string } | null; driverName: string | null
  site: { code: string } | null; purpose: string | null; destination: string | null
  fuelLiters: number | null; fuelCost: number | null
  mismatch: boolean; expectedMileage: number | null
}

interface VBooking {
  id: number; assignedDate: string; estimatedDays: number; purpose: 'FIELD'|'SAMPLE'|'DELIVERY'|'SHUTTLE'|'OTHER'
  site: { code: string } | null; destination: string | null
  driver: { nickname: string | null; fullName: string } | null; driverName: string | null; notes: string | null
}
interface VDetail {
  id: number; licensePlate: string; name: string | null; vehicleType: string | null
  brand: string | null; model: string | null; seats: number | null; status: string
  hasPhoto?: boolean; usageDays: number; bookings: VBooking[]
  lastMileage: number | null; logs: VLog[]; mismatches: VLog[]
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
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => { fetch(`/api/vehicles/${vehicleId}`).then(r => r.json()).then(setV).catch(() => {}) }, [vehicleId])

  async function showQR() {
    const r = await fetch(`/api/vehicles/${vehicleId}/qr`)
    if (!r.ok) return
    const { token } = await r.json()
    const url = `${window.location.origin}/m/${token}`
    setQr(await QRCode.toDataURL(url, { width: 320, margin: 2 }))
  }

  // ดาวน์โหลด QR เป็นไฟล์รูป ตั้งชื่อตามทะเบียน
  function downloadQR() {
    if (!qr) return
    const plate = (v?.licensePlate ?? 'vehicle').replace(/[\\/:*?"<>|\s]+/g, '')
    const a = document.createElement('a')
    a.href = qr; a.download = `QR_${plate}.png`; a.click()
  }

  // พิมพ์เฉพาะ QR + ทะเบียน (เปิดหน้าต่างใหม่ เลี่ยงการพิมพ์ทั้งหน้าจอ)
  function printQR() {
    if (!qr) return
    const plate = v?.licensePlate ?? ''
    const w = window.open('', '_blank', 'width=420,height=620')
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองใหม่'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR ${plate}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,'Segoe UI',sans-serif}
        body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
        .tag{font-size:12px;letter-spacing:2px;color:#059669;font-weight:700}
        .plate{font-size:28px;font-weight:800;color:#1e293b;margin:6px 0 2px}
        .hint{font-size:13px;color:#64748b;margin-bottom:16px}
        img{width:300px;height:300px}
        .foot{font-size:12px;color:#94a3b8;margin-top:14px}
      </style></head>
      <body>
        <div class="tag">Eco Planning System · LOGBOOK</div>
        <div class="plate">🚗 ${plate}</div>
        <div class="hint">สแกนเพื่อบันทึกไมล์ (ไม่ต้องล็อกอิน)</div>
        <img src="${qr}" alt="QR" />
        <div class="foot">บันทึกทุกครั้งที่ออกรถ / จอดรถ และตอนเติมน้ำมัน</div>
        <script>
          const img = document.querySelector('img');
          function go(){ window.focus(); window.print(); }
          if (img.complete) go(); else img.onload = go;
          window.onafterprint = () => window.close();
        <\/script>
      </body></html>`)
    w.document.close()
  }
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
              <div className="flex flex-col items-end gap-1.5">
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                <button onClick={showQR} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50">QR</button>
              </div>
            </div>

            <div className="px-5 py-3">
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                  <p className="text-base font-bold text-emerald-700">{v.lastMileage != null ? v.lastMileage.toLocaleString() : '—'}</p>
                  <p className="text-[10px] text-slate-500">ไมล์ล่าสุด</p>
                </div>
                <div className="rounded-lg bg-sky-50 px-2 py-2 text-center">
                  <p className="text-base font-bold text-sky-700">{v.usageDays}</p>
                  <p className="text-[10px] text-slate-500">วันใช้สะสม</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                  <p className="text-base font-bold text-slate-700">{v.seats ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">ที่นั่ง</p>
                </div>
              </div>
              <Row label="ทะเบียน" value={v.licensePlate} />
              <Row label="ประเภท" value={v.vehicleType ?? '—'} />
              <Row label="ยี่ห้อ / รุ่น" value={[v.brand, v.model].filter(Boolean).join(' ') || '—'} />
            </div>

            {/* แจ้งเตือนไมล์ไม่ตรง */}
            {v.mismatches.length > 0 && (
              <div className="mx-5 mb-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold text-red-600">⚠ พบไมล์ไม่ตรง {v.mismatches.length} ครั้ง</p>
                {v.mismatches.slice(0, 3).map(m => (
                  <p key={m.id} className="text-[11px] text-red-500">
                    {fmtThaiDate(m.loggedAt)} · ระบบ {m.expectedMileage?.toLocaleString()} → จริง {m.mileage.toLocaleString()} (ต่าง {(m.mileage - (m.expectedMileage ?? 0)).toLocaleString()} กม.)
                  </p>
                ))}
              </div>
            )}

            {/* log ไมล์ล่าสุด */}
            <div className="border-t border-slate-100 px-5 py-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">บันทึกไมล์ล่าสุด</p>
              {v.logs.length === 0 ? <p className="py-2 text-center text-xs text-slate-300">ยังไม่มี</p> : (
                <div className="space-y-1.5">
                  {v.logs.slice(0, 8).map(l => {
                    const driver = l.driver?.nickname ?? l.driver?.fullName ?? l.driverName
                    return (
                      <div key={l.id} className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs ${l.mismatch ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}>
                        <span className="text-slate-600">
                          {l.type === 'REFUEL' ? '⛽' : '🚗'} {l.mileage.toLocaleString()} กม.
                          {l.type === 'REFUEL' && l.fuelCost != null && <span className="text-slate-400"> · {l.fuelCost.toLocaleString()}฿</span>}
                          {l.site?.code && <span className="text-slate-400"> · {l.site.code}</span>}
                        </span>
                        <span className="text-slate-400">{driver ?? ''} {fmtThaiDate(l.loggedAt)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
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

      {/* QR modal */}
      {qr && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setQr(null)}>
          <div className="rounded-2xl bg-white p-5 text-center shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <p className="mb-1 text-sm font-bold text-slate-800">QR สำหรับติดรถ</p>
            <p className="mb-3 text-xs text-slate-400">{v?.licensePlate} — สแกนเพื่อบันทึกไมล์ (ไม่ต้องล็อกอิน)</p>
            <img src={qr} alt="QR" className="mx-auto h-64 w-64" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setQr(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-100">ปิด</button>
              <button onClick={downloadQR} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">↓ ดาวน์โหลด</button>
              <button onClick={printQR} className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800">ปริ้น</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
