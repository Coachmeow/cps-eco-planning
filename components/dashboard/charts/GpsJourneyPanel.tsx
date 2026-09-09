'use client'

// กล่อง "การขับขี่และจุดพัก" — กราฟความเร็ว (ย่อ) + ไทม์ไลน์ช่วงขับ/พัก (บาร์บาง) + หมุดปักจุด (hover) + สรุปสถิติ
//  segment ขับ/พัก คำนวณฝั่ง client จาก visits + firstMoveAt/lastStopAt · ระยะทางต่อช่วง = integrate ความเร็ว
//  จุดจอดที่อยู่ใน geofence (siteId != null) = "ไซต์งาน" → โชว์ชื่อไซต์ + เวลาที่อยู่ในไซต์
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Car, Pause, MapPin, Route, Clock, Flag } from 'lucide-react'

const GpsSpeedChart = dynamic(() => import('./GpsSpeedChart'), { ssr: false })

type SpeedPoint = [number, number, number, string]
export interface JourneyVisit {
  siteId: number | null; siteCode: string | null; siteName: string | null
  rawPlace: string | null; arriveAt: string; departAt: string | null; dwellMin: number
}

const DRIVE = '#2563eb', BREAK = '#f59e0b', START = '#16a34a', SITE = '#059669'

const secOf = (iso: string) => { const d = new Date(iso); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() }
const hhmm = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
const hm = (min: number) => { const m = Math.round(min); return m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}` : `${m} นาที` }
const km1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString()
function placeTag(raw: string | null): string {
  const parts = (raw || '').split(',').map((s) => s.trim()).filter((s) => s && !/^\d+$/.test(s))
  return parts.slice(0, 2).join(', ') || 'จุดจอด'
}
// ระยะทางช่วง [s0,s1] จาก series ความเร็ว (integrate speed·dt) — ข้ามช่วงข้อมูลขาด (>300s)
function integrateKm(series: SpeedPoint[] | null, s0: number, s1: number): number {
  if (!series) return 0
  let d = 0
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i], b = series[i + 1]
    if (b[0] <= s0 || a[0] >= s1 || b[0] - a[0] > 300) continue
    const dt = Math.min(b[0], s1) - Math.max(a[0], s0)
    if (dt > 0) d += (a[1] * dt) / 3600
  }
  return d
}

interface Block { type: 'drive' | 'break'; s0: number; s1: number; km: number | null }
interface Pin {
  pct: number; kind: 'start' | 'stop' | 'end'; isSite: boolean
  title: string; timeTxt: string; place: string; durTxt: string
}

export default function GpsJourneyPanel({ series, maxSpeed, overspeedPct, visits, firstMoveAt, lastStopAt, distanceKm }: {
  series: SpeedPoint[] | null
  maxSpeed: number
  overspeedPct: number
  visits: JourneyVisit[]
  firstMoveAt: string | null
  lastStopAt: string | null
  distanceKm: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const { blocks, pins, total, driveMin, breakMin, maxContMin, hasJourney } = useMemo(() => {
    const placeAt = (sec: number): string => {
      if (!series) return ''
      let last = ''
      for (const p of series) { if (p[0] > sec) break; if (p[3]) last = p[3] }
      return placeTag(last)
    }

    const stops = visits
      .map((v) => ({ v, arr: secOf(v.arriveAt), dep: v.departAt ? secOf(v.departAt) : secOf(v.arriveAt) }))
      .sort((a, b) => a.arr - b.arr)

    const startSec = firstMoveAt ? secOf(firstMoveAt) : (series?.[0]?.[0] ?? stops[0]?.arr ?? 0)
    const endSec = lastStopAt ? secOf(lastStopAt) : (series ? series[series.length - 1][0] : (stops[stops.length - 1]?.dep ?? startSec))
    const total = Math.max(1, endSec - startSec)

    const rawBlocks: Block[] = []
    let cur = startSec
    for (const s of stops) {
      if (s.arr > cur) rawBlocks.push({ type: 'drive', s0: cur, s1: s.arr, km: null })
      rawBlocks.push({ type: 'break', s0: s.arr, s1: s.dep, km: null })
      cur = s.dep
    }
    if (endSec > cur) rawBlocks.push({ type: 'drive', s0: cur, s1: endSec, km: null })
    if (rawBlocks.length === 0 && endSec > startSec) rawBlocks.push({ type: 'drive', s0: startSec, s1: endSec, km: null })

    // ระยะทางต่อช่วงขับ → integrate แล้ว scale ให้รวม = distanceKm
    const drives = rawBlocks.filter((b) => b.type === 'drive')
    const raw = drives.map((b) => integrateKm(series, b.s0, b.s1))
    const rawSum = raw.reduce((s, x) => s + x, 0)
    const scale = rawSum > 0 ? distanceKm / rawSum : 0
    drives.forEach((b, i) => { b.km = scale ? raw[i] * scale : null })

    const driveMin = drives.reduce((s, b) => s + (b.s1 - b.s0) / 60, 0)
    const breakMin = stops.reduce((s, x) => s + x.v.dwellMin, 0)
    const maxContMin = drives.reduce((m, b) => Math.max(m, (b.s1 - b.s0) / 60), 0)
    const pctOf = (sec: number) => ((sec - startSec) / total) * 100

    // หมุดปัก: เริ่ม (เขียว) · จุดพัก/ไซต์ (ส้ม, กลางช่วงพัก) · สิ้นสุด (เขียว)
    const pins: Pin[] = []
    pins.push({ pct: 0, kind: 'start', isSite: false, title: 'เริ่มต้น', timeTxt: hhmm(startSec), place: placeAt(startSec) || 'ต้นทาง', durTxt: '' })
    for (const s of stops) {
      const isSite = s.v.siteId != null
      const title = isSite ? (s.v.siteName || s.v.siteCode || 'ไซต์งาน') : placeTag(s.v.rawPlace)
      pins.push({
        pct: pctOf((s.arr + s.dep) / 2), kind: 'stop', isSite, title,
        timeTxt: `${hhmm(s.arr)}–${hhmm(s.dep)}`,
        place: isSite ? [s.v.siteCode, placeTag(s.v.rawPlace)].filter(Boolean).join(' · ') : '',
        durTxt: isSite ? `อยู่ในไซต์ ${hm(s.v.dwellMin)}` : `พัก ${hm(s.v.dwellMin)}`,
      })
    }
    pins.push({ pct: 100, kind: 'end', isSite: false, title: 'สิ้นสุด', timeTxt: hhmm(endSec), place: placeAt(endSec) || 'ปลายทาง', durTxt: '' })

    return { blocks: rawBlocks, pins, total, startSec, driveMin, breakMin, maxContMin, hasJourney: endSec > startSec }
  }, [series, visits, firstMoveAt, lastStopAt, distanceKm])

  const stats = [
    { icon: Car, label: 'ขับรถรวม', value: hm(driveMin), color: DRIVE },
    { icon: Pause, label: 'พักรวม', value: hm(breakMin), color: BREAK },
    { icon: Route, label: 'ระยะทางรวม', value: `${km1(distanceKm)} กม.`, color: '#0f766e' },
    { icon: Clock, label: 'ขับต่อเนื่องสูงสุด', value: hm(maxContMin), color: '#7c3aed' },
  ]

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">การขับขี่และจุดพัก</h4>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: DRIVE }} /> ขับรถ</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: BREAK }} /> พัก</span>
        </div>
      </div>

      <div className="scroll-soft flex-1 overflow-y-auto p-3">
        {/* กราฟความเร็ว (ย่อ) */}
        <div className="mb-4">
          <GpsSpeedChart series={series} maxSpeed={maxSpeed} overspeedPct={overspeedPct} height={210} showStops={false} />
        </div>

        {/* ไทม์ไลน์การเดินทางและจุดพัก */}
        {hasJourney ? (
          <>
            <p className="mb-1 text-xs font-medium text-slate-500">ไทม์ไลน์การเดินทางและจุดพัก</p>

            {/* ป้ายบน (ช่วงขับ) */}
            <div className="flex">
              {blocks.map((b, i) => {
                const pct = ((b.s1 - b.s0) / total) * 100
                return (
                  <div key={i} style={{ width: `${pct}%` }} className="min-w-0 px-0.5 text-center">
                    {b.type === 'drive' && pct > 12 && (
                      <div className="truncate text-[10px] leading-tight text-sky-700">
                        {hm((b.s1 - b.s0) / 60)}{b.km != null && <span className="text-slate-400"> · {km1(b.km)} กม.</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* แท่งบาง + หมุดปัก (จัดกลางบาร์ตามเวลา) */}
            <div className="relative py-3">
              <div className="flex h-2.5 items-stretch overflow-hidden rounded-full">
                {blocks.map((b, i) => {
                  const pct = ((b.s1 - b.s0) / total) * 100
                  return <div key={i} style={{ width: `${pct}%`, background: b.type === 'drive' ? DRIVE : BREAK }} className="min-w-[2px]" />
                })}
              </div>
              {/* หมุดปัก */}
              {pins.map((p, i) => {
                const color = p.kind === 'stop' ? BREAK : START
                return (
                  <button key={i} type="button"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                    onClick={() => setHover((h) => (h === i ? null : i))}
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full p-0.5 leading-none"
                    style={{ left: `${p.pct}%` }} aria-label={p.title}>
                    <MapPin className="h-4 w-4 drop-shadow" style={{ color }} fill={color} fillOpacity={0.25} strokeWidth={2.2} />
                  </button>
                )
              })}
              {/* กล่อง hover */}
              {hover != null && pins[hover] && (
                <div className="pointer-events-none absolute bottom-full z-20 mb-1 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
                  style={{ left: `${Math.min(Math.max(pins[hover].pct, 12), 88)}%` }}>
                  <div className="flex items-center gap-1 font-semibold text-slate-700">
                    <MapPin className="h-3 w-3" style={{ color: pins[hover].kind === 'stop' ? (pins[hover].isSite ? SITE : BREAK) : START }} />
                    <span className={pins[hover].isSite ? 'text-emerald-700' : ''}>{pins[hover].title}</span>
                    {pins[hover].isSite && <span className="rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-700">ไซต์งาน</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-slate-500">{pins[hover].timeTxt}</div>
                  {pins[hover].place && <div className="mt-0.5 text-slate-500">{pins[hover].place}</div>}
                  {pins[hover].durTxt && (
                    <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: pins[hover].isSite ? '#d1fae5' : '#fef3c7', color: pins[hover].isSite ? '#047857' : '#92400e' }}>
                      {pins[hover].durTxt}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลการเดินทางของวันนี้</div>
        )}

        {/* สรุปสถิติ */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} /> {s.label}
              </div>
              <div className="mt-0.5 font-mono text-base font-semibold text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-[10px] text-slate-400"><Flag className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />ระยะทางต่อช่วงประมาณจากความเร็วที่บันทึก</p>
      </div>
    </div>
  )
}
