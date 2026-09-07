'use client'

// ส่วน GPS รถ (Cartrack) บน Dashboard — รายวัน แยกจากตัวเลือกเดือน
//  ตาราง/กราฟรายคัน (km, ทริป, ไซต์, เทียบไมล์) + แผนที่เส้นทาง+จุดจอด + อัปโหลดไฟล์ (ADMIN/MANAGER)
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Upload, MapPin, Navigation, Clock, TriangleAlert } from 'lucide-react'
import { useMe } from '@/hooks/useMe'
import type { GpsVehiclePoint, GeofenceRow } from '@/components/dashboard/charts/GpsRouteMap'

const GpsRouteMap = dynamic(() => import('@/components/dashboard/charts/GpsRouteMap'), { ssr: false })

interface Visit {
  siteId: number | null; siteCode: string | null; siteName: string | null; siteColor: string | null
  rawPlace: string | null; lat: number; lng: number; arriveAt: string; departAt: string | null; dwellMin: number
}
interface VehicleRow {
  vehicleId: number; plate: string; name: string | null
  distanceKm: number; movingMin: number; idleMin: number; tripCount: number; maxSpeed: number
  firstMoveAt: string | null; lastStopAt: string | null; driverName: string | null
  path: [number, number][]; manualKm: number | null; mileageDelta: number | null; visits: Visit[]
}
interface GpsData { date: string; availableDates: string[]; vehicles: VehicleRow[]; geofences: GeofenceRow[] }

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
const hhmm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) : '—'
const hm = (min: number) => min >= 60 ? `${Math.floor(min / 60)}ชม.${min % 60 ? ` ${min % 60}น.` : ''}` : `${min}น.`

export default function GpsSection() {
  const { role } = useMe()
  const canUpload = role === 'ADMIN' || role === 'MANAGER'
  const [date, setDate] = useState<string | null>(null)
  const [data, setData] = useState<GpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/dashboard/gps${date ? `?date=${date}` : ''}`)
    const d: GpsData = await res.json()
    setData(d)
    setDate(d.date)
    setSelId((prev) => prev && d.vehicles.some(v => v.vehicleId === prev) ? prev : (d.vehicles[0]?.vehicleId ?? null))
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  function shiftDay(dir: -1 | 1) {
    if (!data) return
    const list = data.availableDates
    const i = list.indexOf(data.date)
    if (i < 0) return
    const ni = i - dir   // availableDates เรียงใหม่→เก่า: ‹ = เก่ากว่า (index +1)
    if (ni >= 0 && ni < list.length) setDate(list[ni])
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true); setReport(null)
    const lines: string[] = []
    let lastDay: string | null = null

    // อัปโหลดทีละไฟล์ (ไฟล์รายวัน ~5-6MB ผ่านชัวร์) — ไฟล์เดียวที่รวมหลายวันจะใหญ่เกินลิมิต
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress(`กำลังนำเข้า ${i + 1}/${files.length}: ${file.name}`)
      // เตือนไฟล์ใหญ่ (>18MB) — น่าจะเป็นไฟล์รวมหลายวัน แนะนำ export รายวัน
      if (file.size > 18 * 1024 * 1024) {
        lines.push(`✗ ${file.name} (${(file.size / 1024 / 1024).toFixed(0)}MB): ไฟล์ใหญ่เกินไป — โปรด export แยกเป็นรายวันแล้วอัปโหลดหลายไฟล์พร้อมกัน`)
        continue
      }
      try {
        const fd = new FormData(); fd.append('file', file)
        const r = await fetch('/api/gps/upload', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        const skipTxt = j.skipped?.length ? ` · ข้าม ${j.skipped.length} ทะเบียน` : ''
        lines.push(`✓ ${file.name}: ${j.savedDays} คัน · วันที่ ${j.days?.join(', ')}${skipTxt}`)
        if (j.days?.length) lastDay = j.days[j.days.length - 1]
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err)
        const hint = /FormData|Failed to fetch|Load failed|NetworkError|413/i.test(msg)
          ? ' — ไฟล์อาจใหญ่เกินไป โปรด export แยกเป็นรายวัน' : ''
        lines.push(`✗ ${file.name}: ${msg}${hint}`)
      }
    }

    setProgress(null)
    setReport(lines.join('\n'))
    if (lastDay) setDate(lastDay); else load()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const selected = data?.vehicles.find(v => v.vehicleId === selId) ?? null
  const mapVehicle: GpsVehiclePoint | null = selected
    ? { vehicleId: selected.vehicleId, plate: selected.plate, path: selected.path, visits: selected.visits }
    : null
  const totalKm = data?.vehicles.reduce((s, v) => s + v.distanceKm, 0) ?? 0

  return (
    <div className="col-span-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-700">
          <Navigation className="mr-1 inline h-4 w-4 align-[-3px] text-sky-500" />
          GPS รถ (รายวัน) <span className="font-normal text-slate-400">· ระยะทาง + ไซต์ที่ไป</span>
        </h2>
        {data && data.availableDates.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button onClick={() => shiftDay(-1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
            <span className="min-w-[130px] text-center text-sm font-medium text-slate-700">{data.date ? fmtDay(data.date) : '—'}</span>
            <button onClick={() => shiftDay(1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
          </div>
        )}
        {data && data.vehicles.length > 0 && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
            {data.vehicles.length} คัน · รวม {Math.round(totalKm).toLocaleString()} กม.
          </span>
        )}
        {canUpload && (
          <div className="ml-auto">
            <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={onUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              title="เลือกได้หลายไฟล์พร้อมกัน (ไฟล์รายวัน) เพื่อ backfill ย้อนหลัง">
              <Upload className="h-3.5 w-3.5" /> {uploading ? (progress ?? 'กำลังนำเข้า...') : 'อัปโหลดไฟล์ GPS'}
            </button>
          </div>
        )}
      </div>

      {report && (
        <div className="mb-3 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{report}</div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : !data || data.vehicles.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <MapPin className="h-6 w-6 text-slate-300" />
          ยังไม่มีข้อมูล GPS สำหรับวันนี้
          {canUpload && <span className="text-xs">กด “อัปโหลดไฟล์ GPS” เพื่อนำเข้าไฟล์รายวันจาก Cartrack</span>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ตารางรายคัน — สูงเท่ากล่องแผนที่ (420px) + scrollbar ซ่อนเมื่อไม่ใช้ */}
          <div className="scroll-soft overflow-auto rounded-lg border border-slate-200 lg:h-[420px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">คัน / คนขับ</th>
                  <th className="px-3 py-2 text-right font-medium">กม.</th>
                  <th className="px-3 py-2 text-center font-medium">ทริป</th>
                  <th className="px-3 py-2 text-left font-medium">ไซต์ที่ไป</th>
                  <th className="px-3 py-2 text-right font-medium">เทียบไมล์</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.map((v) => {
                  const sel = v.vehicleId === selId
                  const bigDelta = v.mileageDelta != null && Math.abs(v.mileageDelta) > Math.max(20, v.distanceKm * 0.15)
                  return (
                    <tr key={v.vehicleId} onClick={() => setSelId(v.vehicleId)}
                      className={`cursor-pointer border-t border-slate-100 ${sel ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-2">
                        <div className="font-mono font-semibold text-slate-700">{v.plate}</div>
                        <div className="text-[11px] text-slate-400">{v.driverName || v.name || '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{v.distanceKm.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{v.tripCount}</td>
                      <td className="px-3 py-2">
                        {v.visits.length === 0 ? <span className="text-slate-300">—</span> : (
                          <div className="flex flex-wrap gap-1">
                            {v.visits.map((vi, i) => {
                              const matched = vi.siteId != null
                              const label = matched ? (vi.siteName || vi.siteCode || 'ไซต์') : (vi.rawPlace || 'จุดจอด')
                              const head = matched ? [vi.siteCode, vi.siteName].filter(Boolean).join(' · ') : (vi.rawPlace || 'จุดจอด')
                              const full = `${head} · ${hhmm(vi.arriveAt)}–${hhmm(vi.departAt)} · จอด ${vi.dwellMin} นาที`
                              return (
                                <span key={i} title={full}
                                  className={`inline-block max-w-[130px] truncate rounded px-1.5 py-0.5 align-bottom text-[10px] font-medium ${matched ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {label}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.manualKm == null ? <span className="text-slate-300 text-xs">ไม่มี</span> : (
                          <div className={`font-mono text-xs ${bigDelta ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                            {bigDelta && <TriangleAlert className="mr-0.5 inline h-3 w-3 align-[-2px]" />}
                            {v.manualKm}km
                            <div className="text-[10px]">{v.mileageDelta != null && v.mileageDelta > 0 ? '+' : ''}{v.mileageDelta}</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* แผนที่ */}
          <div>
            {selected && (
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-700">{selected.plate}</span>
                <span><Navigation className="mr-0.5 inline h-3 w-3 align-[-2px]" />{selected.distanceKm} กม.</span>
                <span><Clock className="mr-0.5 inline h-3 w-3 align-[-2px]" />วิ่ง {hm(selected.movingMin)} · จอด {hm(selected.idleMin)}</span>
                <span>สูงสุด {selected.maxSpeed} กม./ชม.</span>
                <span>{hhmm(selected.firstMoveAt)}–{hhmm(selected.lastStopAt)}</span>
              </div>
            )}
            <GpsRouteMap vehicle={mapVehicle} geofences={data.geofences} />
          </div>
        </div>
      )}
    </div>
  )
}
