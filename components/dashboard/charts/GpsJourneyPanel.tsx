'use client'

// กล่อง "การขับขี่และจุดพัก" — คำนวณ segment ขับ/พัก + หมุดจุด (ฝั่ง client) แล้วส่งให้ GpsSpeedChart
//  วาดรวมในกล่องกราฟเดียว (แกนเวลาเดียวกัน) · จุดจอดใน geofence = "ไซต์งาน" → ชื่อไซต์ + เวลาที่อยู่ในไซต์
import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Car, Pause, Route, Clock, Flag } from 'lucide-react'
import type { JourneyData } from './GpsSpeedChart'

const GpsSpeedChart = dynamic(() => import('./GpsSpeedChart'), { ssr: false })

type SpeedPoint = [number, number, number, string]
export interface JourneyVisit {
  siteId: number | null; siteCode: string | null; siteName: string | null
  rawPlace: string | null; arriveAt: string; departAt: string | null; dwellMin: number
}

const DRIVE = '#2563eb', BREAK = '#f59e0b'

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

export default function GpsJourneyPanel({ series, maxSpeed, overspeedPct, visits, firstMoveAt, lastStopAt, distanceKm }: {
  series: SpeedPoint[] | null
  maxSpeed: number
  overspeedPct: number
  visits: JourneyVisit[]
  firstMoveAt: string | null
  lastStopAt: string | null
  distanceKm: number
}) {
  const { journey, driveMin, breakMin, maxContMin } = useMemo(() => {
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

    const blocks: JourneyData['blocks'] = []
    let cur = startSec
    for (const s of stops) {
      if (s.arr > cur) blocks.push({ type: 'drive', s0: cur, s1: s.arr, km: null })
      blocks.push({ type: 'break', s0: s.arr, s1: s.dep, km: null })
      cur = s.dep
    }
    if (endSec > cur) blocks.push({ type: 'drive', s0: cur, s1: endSec, km: null })
    if (blocks.length === 0 && endSec > startSec) blocks.push({ type: 'drive', s0: startSec, s1: endSec, km: null })

    // ระยะทางต่อช่วงขับ → integrate แล้ว scale ให้รวม = distanceKm
    const drives = blocks.filter((b) => b.type === 'drive')
    const raw = drives.map((b) => integrateKm(series, b.s0, b.s1))
    const rawSum = raw.reduce((s, x) => s + x, 0)
    const scale = rawSum > 0 ? distanceKm / rawSum : 0
    drives.forEach((b, i) => { b.km = scale ? raw[i] * scale : null })

    const driveMin = drives.reduce((s, b) => s + (b.s1 - b.s0) / 60, 0)
    const breakMin = stops.reduce((s, x) => s + x.v.dwellMin, 0)
    const maxContMin = drives.reduce((m, b) => Math.max(m, (b.s1 - b.s0) / 60), 0)

    // หมุด: เริ่ม (เขียว) · จุดพัก/ไซต์ (ส้ม, กลางช่วงพัก) · สิ้นสุด (เขียว)
    const pins: JourneyData['pins'] = []
    pins.push({ sec: startSec, kind: 'start', isSite: false, title: 'เริ่มต้น', timeTxt: hhmm(startSec), place: placeAt(startSec) || 'ต้นทาง', durTxt: '' })
    for (const s of stops) {
      const isSite = s.v.siteId != null
      const title = isSite ? (s.v.siteName || s.v.siteCode || 'ไซต์งาน') : placeTag(s.v.rawPlace)
      pins.push({
        sec: (s.arr + s.dep) / 2, kind: 'stop', isSite, title,
        timeTxt: `${hhmm(s.arr)}–${hhmm(s.dep)}`,
        place: isSite ? [s.v.siteCode, placeTag(s.v.rawPlace)].filter(Boolean).join(' · ') : '',
        durTxt: isSite ? `อยู่ในไซต์ ${hm(s.v.dwellMin)}` : `พัก ${hm(s.v.dwellMin)}`,
      })
    }
    pins.push({ sec: endSec, kind: 'end', isSite: false, title: 'สิ้นสุด', timeTxt: hhmm(endSec), place: placeAt(endSec) || 'ปลายทาง', durTxt: '' })

    return { journey: { blocks, pins } as JourneyData, driveMin, breakMin, maxContMin }
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
        {/* กราฟความเร็ว + เลนไทม์ไลน์ (แกนเวลาเดียวกัน) */}
        <GpsSpeedChart series={series} maxSpeed={maxSpeed} overspeedPct={overspeedPct} journey={journey} height={260} />

        {/* สรุปสถิติ */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
