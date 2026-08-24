'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Car, CircleParking, Check, AlertTriangle } from 'lucide-react'
import { useParams } from 'next/navigation'
import { PURPOSE_META, PURPOSE_ORDER } from '@/lib/vehiclePurpose'
import type { VehiclePurpose } from '@/lib/types'

interface OpenTrip {
  id: number
  origin: string | null
  mileageOut: number
  startedAt: string
  purpose: VehiclePurpose | null
  siteCode: string | null
  driver: string | null
}
interface PageData {
  vehicle: { id: number; licensePlate: string; name: string | null; vehicleType: string | null; brand: string | null; model: string | null }
  lastMileage: number | null
  lastDriver: string | null
  openTrip: OpenTrip | null
  todayBooking: { purpose: VehiclePurpose; siteId: number | null; siteCode: string | null; destination: string | null; driverId: number | null } | null
  employees: { id: number; nickname: string | null; fullName: string }[]
  sites: { id: number; code: string; name: string }[]
}

export default function MileagePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'USE' | 'REFUEL'>('USE')
  const [done, setDone] = useState<{ kind: 'start' | 'close' | 'refuel'; mileage: number; distance?: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // form
  const [mileage, setMileage] = useState('')          // ไมล์ออก (start) / ไมล์จอด (close) / ไมล์ (refuel)
  const [driverId, setDriverId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [purpose, setPurpose] = useState<VehiclePurpose>('FIELD')
  const [siteId, setSiteId] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [nonField, setNonField] = useState(false)
  const [reason, setReason] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelPrice, setFuelPrice] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [notes, setNotes] = useState('')

  function applyData(d: PageData) {
    setData(d)
    // ปิดทริป: เว้นว่างให้กรอกเลขไมล์ตอนจอดจริง ; เริ่มทริปใหม่: prefill ไมล์ล่าสุด
    setMileage(d.openTrip ? '' : (d.lastMileage != null ? String(d.lastMileage) : ''))
    if (!d.openTrip && d.todayBooking) {
      setPurpose(d.todayBooking.purpose)
      if (d.todayBooking.siteId) setSiteId(String(d.todayBooking.siteId))
      if (d.todayBooking.driverId) setDriverId(String(d.todayBooking.driverId))
    }
  }

  function reload() {
    fetch(`/api/public/vehicle/${token}`).then(async r => {
      if (!r.ok) { setErr('ไม่พบรถ หรือ QR ไม่ถูกต้อง'); return }
      applyData(await r.json())
    }).catch(() => setErr('เชื่อมต่อไม่ได้'))
  }

  useEffect(reload, [token])

  // auto fuel cost
  useEffect(() => {
    const l = parseFloat(fuelLiters), p = parseFloat(fuelPrice)
    if (!isNaN(l) && !isNaN(p)) setFuelCost((l * p).toFixed(2))
  }, [fuelLiters, fuelPrice])

  const open = data?.openTrip ?? null
  const missing = mismatch && data?.lastMileage != null && mileage !== ''
    ? parseInt(mileage) - data.lastMileage : null
  const closeDistance = open && mileage !== '' ? parseInt(mileage) - open.mileageOut : null

  async function submit() {
    if (!mileage) { setErr('กรอกเลขไมล์'); return }
    setSubmitting(true); setErr('')

    if (mode === 'REFUEL') {
      const body: Record<string, unknown> = {
        token, type: 'REFUEL', mileage: parseInt(mileage),
        driverId: driverId || undefined, driverName: driverName || undefined, notes: notes || undefined,
        fuelLiters: fuelLiters || undefined, fuelPricePerLiter: fuelPrice || undefined, fuelCost: fuelCost || undefined,
      }
      const r = await fetch('/api/public/mileage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSubmitting(false)
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'บันทึกไม่สำเร็จ'); return }
      setDone({ kind: 'refuel', mileage: parseInt(mileage) })
      return
    }

    // USE → ปิดทริปถ้ามีเปิดอยู่ ไม่งั้นเริ่มทริป
    if (open) {
      const body = { token, action: 'close', mileageIn: parseInt(mileage), destination: destination || undefined, notes: notes || undefined }
      const r = await fetch('/api/public/trip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSubmitting(false)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'ปิดทริปไม่สำเร็จ'); return }
      setDone({ kind: 'close', mileage: parseInt(mileage), distance: d.distance })
    } else {
      const body: Record<string, unknown> = {
        token, action: 'start', mileageOut: parseInt(mileage),
        driverId: driverId || undefined, driverName: driverName || undefined,
        purpose, siteId: purpose === 'FIELD' && siteId ? siteId : undefined,
        origin: origin || undefined, nonField, reason: nonField ? reason : undefined,
        mismatch, expectedMileage: mismatch ? data?.lastMileage ?? undefined : undefined,
        notes: notes || undefined,
      }
      const r = await fetch('/api/public/trip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSubmitting(false)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'เริ่มทริปไม่สำเร็จ'); return }
      setDone({ kind: 'start', mileage: parseInt(mileage) })
    }
  }

  function resetForm() {
    setDone(null); setMismatch(false); setNotes(''); setOrigin(''); setDestination('')
    setNonField(false); setReason(''); setFuelLiters(''); setFuelPrice(''); setFuelCost('')
    reload()
  }

  if (err && !data) return <Center><p className="text-red-600">{err}</p></Center>
  if (!data) return <Center><p className="text-slate-400">กำลังโหลด...</p></Center>

  if (done) return (
    <Center>
      <div className="text-center">
        <div className="mb-3 flex justify-center"><CheckCircle2 className="h-14 w-14 text-emerald-500" /></div>
        <p className="text-lg font-bold text-slate-800">
          {done.kind === 'start' ? 'เริ่มทริปแล้ว — ขับรถปลอดภัย' : done.kind === 'close' ? 'ปิดทริปแล้ว' : 'บันทึกเติมน้ำมันแล้ว'}
        </p>
        <p className="mt-1 text-sm text-slate-500">{data.vehicle.licensePlate} · ไมล์ {done.mileage.toLocaleString()}</p>
        {done.kind === 'close' && done.distance != null && (
          <p className="mt-1 text-sm font-semibold text-emerald-600">ระยะทางทริปนี้ {done.distance.toLocaleString()} กม.</p>
        )}
        {done.kind === 'start' && <p className="mt-1 text-xs text-slate-400">อย่าลืมสแกนปิดทริปตอนจอดรถ</p>}
        <button onClick={resetForm} className="mt-5 rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white">เสร็จสิ้น</button>
      </div>
    </Center>
  )

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-800 focus:border-slate-500 focus:outline-none'
  const lbl = 'mb-1 block text-sm font-medium text-slate-600'

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div className="mx-auto max-w-md pb-10">
        {/* header */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold tracking-widest text-emerald-600">Eco Planning System · LOGBOOK</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xl font-bold text-slate-800"><Car className="h-5 w-5 text-slate-500" /> {data.vehicle.licensePlate}</p>
          <p className="text-sm text-slate-400">{[data.vehicle.name, data.vehicle.vehicleType, data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            ไมล์ล่าสุดในระบบ: <span className="font-bold text-slate-700">{data.lastMileage != null ? data.lastMileage.toLocaleString() : 'ยังไม่มี'}</span>
            {data.lastDriver && <span className="text-slate-400"> · ล่าสุดโดย {data.lastDriver}</span>}
          </div>
        </div>

        {/* mode toggle */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button onClick={() => setMode('USE')} className={`rounded-xl py-3 text-sm font-semibold ${mode === 'USE' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>🚗 ใช้งานรถ</button>
          <button onClick={() => setMode('REFUEL')} className={`rounded-xl py-3 text-sm font-semibold ${mode === 'REFUEL' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>⛽ เติมน้ำมัน</button>
        </div>

        {/* แจ้งสถานะทริปเปิดอยู่ */}
        {mode === 'USE' && open && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-bold text-amber-700"><CircleParking className="h-4 w-4" /> กำลังปิดทริป</p>
            <p className="mt-1 text-amber-800">
              ออกจาก <b>{open.origin || '—'}</b> · ไมล์ออก <b>{open.mileageOut.toLocaleString()}</b>
              {open.driver && <> · โดย {open.driver}</>}
            </p>
            <p className="mt-0.5 text-xs text-amber-600">เริ่มเมื่อ {new Date(open.startedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        )}

        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          {/* mileage */}
          <div>
            <label className={lbl}>
              {mode === 'REFUEL' ? 'เลขไมล์ปัจจุบัน (กม.) *' : open ? 'เลขไมล์ตอนจอดรถ (กม.) *' : 'เลขไมล์ตอนออกรถ (กม.) *'}
            </label>
            <input type="number" inputMode="numeric" value={mileage} onChange={e => setMileage(e.target.value)} className={inp} />
            {mode === 'USE' && !open && (
              <button onClick={() => setMismatch(m => !m)} className={`mt-1.5 text-xs ${mismatch ? 'text-red-500 font-medium' : 'text-amber-600'}`}>
                {mismatch ? <><Check className="inline h-3.5 w-3.5 align-[-2px]" /> กำลังแจ้งไมล์ไม่ตรง</> : <><AlertTriangle className="inline h-3.5 w-3.5 align-[-2px]" /> ไมล์ในระบบไม่ตรงกับบนรถ?</>}
              </button>
            )}
            {mismatch && missing != null && (
              <p className="mt-1 text-xs text-red-500">ส่วนต่างจากระบบ {missing.toLocaleString()} กม.{data.lastDriver && ` — สอบถามผู้ใช้ก่อนหน้า (${data.lastDriver})`}</p>
            )}
            {mode === 'USE' && open && closeDistance != null && (
              <p className={`mt-1 text-xs ${closeDistance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {closeDistance < 0 ? 'เลขไมล์น้อยกว่าตอนออกรถ — ตรวจสอบอีกครั้ง' : `ระยะทางทริปนี้ ${closeDistance.toLocaleString()} กม.`}
              </p>
            )}
          </div>

          {mode === 'REFUEL' ? (
            <>
              <div>
                <label className={lbl}>คนขับ / ผู้เติม</label>
                <select value={driverId} onChange={e => { setDriverId(e.target.value); if (e.target.value) setDriverName('') }} className={inp}>
                  <option value="">— เลือกพนักงาน —</option>
                  {data.employees.map(e => <option key={e.id} value={e.id}>{e.nickname ?? e.fullName}</option>)}
                </select>
                <input value={driverName} onChange={e => { setDriverName(e.target.value); if (e.target.value) setDriverId('') }} placeholder="หรือพิมพ์ชื่อนอกระบบ" className={`${inp} mt-1.5`} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>จำนวนลิตร</label><input type="number" inputMode="decimal" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>ราคา/ลิตร</label><input type="number" inputMode="decimal" value={fuelPrice} onChange={e => setFuelPrice(e.target.value)} className={inp} /></div>
              </div>
              <div><label className={lbl}>มูลค่ารวม (บาท)</label><input type="number" inputMode="decimal" value={fuelCost} onChange={e => setFuelCost(e.target.value)} className={inp} /></div>
            </>
          ) : open ? (
            <>
              {/* ปิดทริป: ปลายทาง */}
              <div><label className={lbl}>ปลายทาง (จอดที่ไหน)</label><input value={destination} onChange={e => setDestination(e.target.value)} className={inp} placeholder="เช่น ออฟฟิศ / ไซต์งาน" /></div>
            </>
          ) : (
            <>
              {/* เริ่มทริป: คนขับ + ประเภท + ไซต์ + ต้นทาง */}
              <div>
                <label className={lbl}>คนขับ</label>
                <select value={driverId} onChange={e => { setDriverId(e.target.value); if (e.target.value) setDriverName('') }} className={inp}>
                  <option value="">— เลือกพนักงาน —</option>
                  {data.employees.map(e => <option key={e.id} value={e.id}>{e.nickname ?? e.fullName}</option>)}
                </select>
                <input value={driverName} onChange={e => { setDriverName(e.target.value); if (e.target.value) setDriverId('') }} placeholder="หรือพิมพ์ชื่อคนขับนอกระบบ" className={`${inp} mt-1.5`} />
              </div>
              <div>
                <label className={lbl}>ประเภทการใช้</label>
                <select value={purpose} onChange={e => setPurpose(e.target.value as VehiclePurpose)} className={inp}>
                  {PURPOSE_ORDER.map(p => <option key={p} value={p}>{PURPOSE_META[p].icon} {PURPOSE_META[p].label}</option>)}
                </select>
                {data.todayBooking && <p className="mt-1 text-xs text-emerald-600">มีการจองวันนี้: {PURPOSE_META[data.todayBooking.purpose].label}{data.todayBooking.siteCode ? ` · ${data.todayBooking.siteCode}` : ''}</p>}
              </div>
              {purpose === 'FIELD' && (
                <div>
                  <label className={lbl}>ไซต์งาน</label>
                  <select value={siteId} onChange={e => setSiteId(e.target.value)} className={inp}>
                    <option value="">— เลือกไซต์ —</option>
                    {data.sites.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className={lbl}>ต้นทาง (ออกจากไหน)</label><input value={origin} onChange={e => setOrigin(e.target.value)} className={inp} placeholder="เช่น ออฟฟิศ" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={nonField} onChange={e => setNonField(e.target.checked)} className="h-4 w-4" />
                ใช้นอกเหนืองาน Field
              </label>
              {nonField && <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ระบุเหตุผล" className={inp} />}
            </>
          )}

          <div><label className={lbl}>หมายเหตุ</label><input value={notes} onChange={e => setNotes(e.target.value)} className={inp} placeholder="..." /></div>

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
          <button onClick={submit} disabled={submitting} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'กำลังบันทึก...' : mode === 'REFUEL' ? 'บันทึกเติมน้ำมัน' : open ? <><CircleParking className="inline h-4 w-4 align-[-3px]" /> ปิดทริป (จอดรถ)</> : <><Car className="inline h-4 w-4 align-[-3px]" /> เริ่มทริป (ออกรถ)</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4">{children}</div>
}
