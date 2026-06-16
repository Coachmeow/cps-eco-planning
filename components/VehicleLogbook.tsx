'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PURPOSE_META } from '@/lib/vehiclePurpose'
import type { VehiclePurpose } from '@/lib/types'
import ExportButton from '@/components/ExportButton'

interface TripRow {
  id: number; plate: string; forDate: string; startedAt: string; endedAt: string | null
  origin: string | null; destination: string | null
  mileageOut: number; mileageIn: number | null; distance: number | null
  purpose: VehiclePurpose | null; siteCode: string | null; siteName: string | null
  driver: string | null; nonField: boolean; reason: string | null
  mismatch: boolean; expectedMileage: number | null; notes: string | null; open: boolean
}
interface RefuelRow {
  id: number; type: 'USE' | 'REFUEL'; mileage: number; forDate: string
  fuelLiters: number | null; fuelCost: number | null
  vehicle?: { licensePlate: string } | null
}

function monthStartKey() { const d = new Date(); d.setDate(1); return d.toLocaleDateString('en-CA') }
function todayKey() { return new Date().toLocaleDateString('en-CA') }
const dmy = (s: string) => new Date(s).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })
const hm  = (s: string | null) => s ? new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'

export default function VehicleLogbook({ vehicleId, plate, onClose }: { vehicleId?: number; plate?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [from, setFrom] = useState(monthStartKey())
  const [to, setTo]     = useState(todayKey())
  const [trips, setTrips]   = useState<TripRow[]>([])
  const [refuels, setRefuels] = useState<RefuelRow[]>([])
  const [loading, setLoading] = useState(false)
  const allVehicles = vehicleId == null
  const vq = vehicleId != null ? `vehicleId=${vehicleId}&` : ''

  const load = useCallback(async () => {
    setLoading(true)
    const [tr, lr] = await Promise.all([
      fetch(`/api/vehicle-trips?${vq}from=${from}&to=${to}`),
      fetch(`/api/vehicle-logs?${vq}from=${from}&to=${to}`),
    ])
    if (tr.ok) setTrips(await tr.json())
    if (lr.ok) { const logs: RefuelRow[] = await lr.json(); setRefuels(logs.filter(l => l.type === 'REFUEL')) }
    setLoading(false)
  }, [vehicleId, from, to])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const totalKm = trips.reduce((s, t) => s + (t.distance ?? 0), 0)
  const totalLiters = refuels.reduce((s, r) => s + (r.fuelLiters ?? 0), 0)
  const totalCost = refuels.reduce((s, r) => s + (r.fuelCost ?? 0), 0)
  const mismatchCount = trips.filter(t => t.mismatch).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-bold text-slate-800">📊 {allVehicles ? 'สรุปไมล์รถทุกคัน' : `สมุดไมล์รถ · ${plate}`}</p>
            <p className="text-xs text-slate-400">บันทึกการใช้รถรายทริป + เติมน้ำมัน{allVehicles ? ' (สำหรับทำจ่ายตาม Milage)' : ''}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>

        {/* filters + export */}
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">ตั้งแต่</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:outline-none" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-slate-600">ถึง</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:outline-none" /></div>
          <div className="ml-auto">
            <ExportButton href={`/api/export/mileage?${vq}from=${from}&to=${to}`} label="Export Excel" />
          </div>
        </div>

        {/* summary chips */}
        <div className="grid grid-cols-4 gap-2 border-b border-slate-100 px-5 py-3">
          <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center"><p className="text-base font-bold text-emerald-700">{totalKm.toLocaleString()}</p><p className="text-[10px] text-slate-500">รวมระยะวิ่ง (กม.)</p></div>
          <div className="rounded-lg bg-sky-50 px-2 py-2 text-center"><p className="text-base font-bold text-sky-700">{trips.length}</p><p className="text-[10px] text-slate-500">จำนวนทริป</p></div>
          <div className="rounded-lg bg-amber-50 px-2 py-2 text-center"><p className="text-base font-bold text-amber-700">{totalCost ? totalCost.toLocaleString() : '—'}</p><p className="text-[10px] text-slate-500">ค่าน้ำมัน (บาท)</p></div>
          <div className={`rounded-lg px-2 py-2 text-center ${mismatchCount ? 'bg-red-50' : 'bg-slate-50'}`}><p className={`text-base font-bold ${mismatchCount ? 'text-red-600' : 'text-slate-400'}`}>{mismatchCount || '—'}</p><p className="text-[10px] text-slate-500">ไมล์ไม่ตรง</p></div>
        </div>

        {/* trips table */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? <p className="py-8 text-center text-sm text-slate-300">กำลังโหลด...</p> : (
            <>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-[11px] text-slate-500"><tr className="border-b border-slate-200">
                  {allVehicles && <th className="px-2 py-1.5 text-left font-medium">ทะเบียน</th>}
                  <th className="px-2 py-1.5 text-left font-medium">วันที่</th>
                  <th className="px-2 py-1.5 text-left font-medium">เวลา</th>
                  <th className="px-2 py-1.5 text-left font-medium">ต้นทาง</th>
                  <th className="px-2 py-1.5 text-left font-medium">ปลายทาง</th>
                  <th className="px-2 py-1.5 text-right font-medium">ไมล์ออก</th>
                  <th className="px-2 py-1.5 text-right font-medium">ไมล์จอด</th>
                  <th className="px-2 py-1.5 text-right font-medium">ระยะ (กม.)</th>
                  <th className="px-2 py-1.5 text-left font-medium">ไซต์งาน</th>
                  <th className="px-2 py-1.5 text-left font-medium">ประเภท</th>
                  <th className="px-2 py-1.5 text-left font-medium">คนขับ</th>
                  <th className="px-2 py-1.5 text-left font-medium">หมายเหตุ</th>
                </tr></thead>
                <tbody>
                  {trips.length === 0 && <tr><td colSpan={allVehicles ? 12 : 11} className="px-2 py-6 text-center text-slate-300">ไม่มีทริปในช่วงนี้</td></tr>}
                  {trips.map(t => (
                    <tr key={t.id} className={`border-b border-slate-50 ${t.mismatch ? 'bg-red-50' : t.open ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                      {allVehicles && <td className="px-2 py-1.5 font-medium text-slate-700">{t.plate}</td>}
                      <td className="px-2 py-1.5 text-slate-600">{dmy(t.forDate)}</td>
                      <td className="px-2 py-1.5 text-slate-500">{hm(t.startedAt)}{t.endedAt ? `–${hm(t.endedAt)}` : ''}</td>
                      <td className="px-2 py-1.5 text-slate-600">{t.origin || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{t.open ? <span className="text-amber-600">ยังไม่ปิด</span> : (t.destination || '—')}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{t.mileageOut.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{t.mileageIn != null ? t.mileageIn.toLocaleString() : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{t.distance != null ? t.distance.toLocaleString() : '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{t.siteCode ? `${t.siteCode}${t.siteName ? ` · ${t.siteName}` : ''}` : (t.nonField ? `นอกงาน${t.reason ? ` (${t.reason})` : ''}` : '—')}</td>
                      <td className="px-2 py-1.5">{t.purpose ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PURPOSE_META[t.purpose].chip}`}>{PURPOSE_META[t.purpose].icon} {PURPOSE_META[t.purpose].label}</span> : '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{t.driver || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{t.notes || (t.mismatch ? `⚠ ไมล์ไม่ตรง (ระบบ ${t.expectedMileage?.toLocaleString() ?? '—'})` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
                {trips.length > 0 && (
                  <tfoot><tr className="border-t-2 border-slate-200 font-semibold text-slate-700">
                    <td className="px-2 py-1.5" colSpan={allVehicles ? 7 : 6}>รวม</td>
                    <td className="px-2 py-1.5 text-right">{totalKm.toLocaleString()}</td>
                    <td className="px-2 py-1.5" colSpan={4} />
                  </tr></tfoot>
                )}
              </table>

              {/* refuels */}
              <p className="mb-2 mt-5 text-xs font-semibold text-slate-500">⛽ การเติมน้ำมัน ({refuels.length}) — รวม {totalLiters ? totalLiters.toLocaleString() : 0} ลิตร · {totalCost ? totalCost.toLocaleString() : 0} บาท</p>
              {refuels.length === 0 ? <p className="py-2 text-center text-xs text-slate-300">ไม่มีการเติมน้ำมันในช่วงนี้</p> : (
                <div className="space-y-1.5">
                  {refuels.map(r => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs">
                      <span className="text-slate-600">{allVehicles && r.vehicle ? `${r.vehicle.licensePlate} · ` : ''}{dmy(r.forDate)} · ไมล์ {r.mileage.toLocaleString()} กม.</span>
                      <span className="text-slate-400">{r.fuelLiters ? `${r.fuelLiters} ล.` : ''} {r.fuelCost ? `· ${r.fuelCost.toLocaleString()} ฿` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
