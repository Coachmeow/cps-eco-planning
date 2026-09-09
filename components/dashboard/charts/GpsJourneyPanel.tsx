'use client'

// กล่อง "การขับขี่และจุดพัก" — กราฟความเร็ว (ย่อ) + ไทม์ไลน์ช่วงขับ/พัก + การ์ดจุดจอด + สรุปสถิติ
//  segment ขับ/พัก คำนวณฝั่ง client จาก visits + firstMoveAt/lastStopAt · ระยะทางต่อช่วง = integrate ความเร็ว
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Car, Pause, MapPin, Route, Clock, Flag, ListFilter } from 'lucide-react'

const GpsSpeedChart = dynamic(() => import('./GpsSpeedChart'), { ssr: false })

type SpeedPoint = [number, number, number, string]
export interface JourneyVisit {
  siteId: number | null; siteCode: string | null; siteName: string | null
  rawPlace: string | null; arriveAt: string; departAt: string | null; dwellMin: number
}

const DRIVE = '#2563eb', BREAK = '#f59e0b', END = '#16a34a'

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

interface Block { type: 'drive' | 'break'; s0: number; s1: number; km: number | null; stop?: Node }
interface Node { kind: 'start' | 'stop' | 'end'; timeSec: number; endSec?: number; label: string; place: string; isSite: boolean; dwellMin: number }

export default function GpsJourneyPanel({ series, maxSpeed, overspeedPct, visits, firstMoveAt, lastStopAt, distanceKm }: {
  series: SpeedPoint[] | null
  maxSpeed: number
  overspeedPct: number
  visits: JourneyVisit[]
  firstMoveAt: string | null
  lastStopAt: string | null
  distanceKm: number
}) {
  const [mode, setMode] = useState<'all' | 'stops'>('all')

  const { blocks, nodes, total, startSec, endSec, driveMin, breakMin, maxContMin } = useMemo(() => {
    // carry-forward place จาก series สำหรับหาสถานที่ต้นทาง/ปลายทาง
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

    const nodes: Node[] = []
    nodes.push({ kind: 'start', timeSec: startSec, label: 'เริ่มต้น', place: placeAt(startSec), isSite: false, dwellMin: 0 })

    const rawBlocks: Block[] = []
    let cur = startSec
    for (const s of stops) {
      const isSite = s.v.siteId != null
      const label = isSite ? (s.v.siteName || s.v.siteCode || 'ไซต์') : placeTag(s.v.rawPlace)
      const node: Node = { kind: 'stop', timeSec: s.arr, endSec: s.dep, label, place: placeTag(s.v.rawPlace), isSite, dwellMin: s.v.dwellMin }
      if (s.arr > cur) rawBlocks.push({ type: 'drive', s0: cur, s1: s.arr, km: null })
      rawBlocks.push({ type: 'break', s0: s.arr, s1: s.dep, km: null, stop: node })
      nodes.push(node)
      cur = s.dep
    }
    if (endSec > cur) rawBlocks.push({ type: 'drive', s0: cur, s1: endSec, km: null })
    if (rawBlocks.length === 0 && endSec > startSec) rawBlocks.push({ type: 'drive', s0: startSec, s1: endSec, km: null })
    nodes.push({ kind: 'end', timeSec: endSec, label: 'สิ้นสุด', place: placeAt(endSec), isSite: false, dwellMin: 0 })

    // ระยะทางต่อช่วงขับ → integrate แล้ว scale ให้รวม = distanceKm (ตรงกับสรุป)
    const drives = rawBlocks.filter((b) => b.type === 'drive')
    const raw = drives.map((b) => integrateKm(series, b.s0, b.s1))
    const rawSum = raw.reduce((s, x) => s + x, 0)
    const scale = rawSum > 0 ? distanceKm / rawSum : 0
    drives.forEach((b, i) => { b.km = scale ? raw[i] * scale : null })

    const driveMin = drives.reduce((s, b) => s + (b.s1 - b.s0) / 60, 0)
    const breakMin = stops.reduce((s, x) => s + x.v.dwellMin, 0)
    const maxContMin = drives.reduce((m, b) => Math.max(m, (b.s1 - b.s0) / 60), 0)
    const total = Math.max(1, endSec - startSec)

    return { blocks: rawBlocks, nodes, total, startSec, endSec, driveMin, breakMin, maxContMin }
  }, [series, visits, firstMoveAt, lastStopAt, distanceKm])

  const stats = [
    { icon: Car, label: 'ขับรถรวม', value: hm(driveMin), color: DRIVE },
    { icon: Pause, label: 'พักรวม', value: hm(breakMin), color: BREAK },
    { icon: Route, label: 'ระยะทางรวม', value: `${km1(distanceKm)} กม.`, color: '#0f766e' },
    { icon: Clock, label: 'ขับต่อเนื่องสูงสุด', value: hm(maxContMin), color: '#7c3aed' },
  ]

  const hasJourney = endSec > startSec

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      {/* header */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h4 className="text-sm font-semibold text-slate-700">การขับขี่และจุดพัก</h4>
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          <button onClick={() => setMode('all')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${mode === 'all' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            ทั้งหมด
          </button>
          <button onClick={() => setMode('stops')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${mode === 'stops' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            <ListFilter className="h-3 w-3" /> เฉพาะจุดพัก
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: DRIVE }} /> ขับรถ</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: BREAK }} /> พัก</span>
        </div>
      </div>

      {/* กราฟความเร็ว (ย่อ) — โหมด "ทั้งหมด" เท่านั้น */}
      {mode === 'all' && (
        <div className="mb-4">
          <GpsSpeedChart series={series} maxSpeed={maxSpeed} overspeedPct={overspeedPct} height={230} showStops={false} />
        </div>
      )}

      {/* ไทม์ไลน์การเดินทางและจุดพัก */}
      {hasJourney ? (
        <>
          <p className="mb-1 text-xs font-medium text-slate-500">ไทม์ไลน์การเดินทางและจุดพัก</p>

          {/* ป้ายบน (ช่วงขับ) */}
          <div className="flex">
            {blocks.map((b, i) => {
              const pct = ((b.s1 - b.s0) / total) * 100
              const wide = pct > 12
              return (
                <div key={i} style={{ width: `${pct}%` }} className="min-w-0 px-0.5 text-center">
                  {b.type === 'drive' && wide && (
                    <div className="truncate text-[10px] leading-tight text-sky-700">
                      ขับต่อเนื่อง {hm((b.s1 - b.s0) / 60)}{b.km != null && <span className="text-slate-400"> · {km1(b.km)} กม.</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* แท่งไทม์ไลน์ (วงกลมเริ่ม/สิ้นสุดอยู่นอกกรอบ overflow เพื่อไม่ให้ถูกตัด) */}
          <div className="relative">
            <div className="flex h-7 items-stretch overflow-hidden rounded-md">
              {blocks.map((b, i) => {
                const pct = ((b.s1 - b.s0) / total) * 100
                const Icon = b.type === 'drive' ? Car : Pause
                return (
                  <div key={i} style={{ width: `${pct}%`, background: b.type === 'drive' ? DRIVE : BREAK }}
                    title={b.type === 'drive'
                      ? `ขับ ${hhmm(b.s0)}–${hhmm(b.s1)} · ${hm((b.s1 - b.s0) / 60)}${b.km != null ? ` · ${km1(b.km)} กม.` : ''}`
                      : `พัก ${hhmm(b.s0)}–${hhmm(b.s1)} · ${hm((b.s1 - b.s0) / 60)}`}
                    className="flex min-w-[6px] items-center justify-center">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-white/90" />
                  </div>
                )
              })}
            </div>
            <span className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm" style={{ background: END }} />
            <span className="absolute right-0 top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm" style={{ background: END }} />
          </div>

          {/* ป้ายล่าง (ช่วงพัก) */}
          <div className="flex">
            {blocks.map((b, i) => {
              const pct = ((b.s1 - b.s0) / total) * 100
              const wide = pct > 8
              return (
                <div key={i} style={{ width: `${pct}%` }} className="min-w-0 px-0.5 text-center">
                  {b.type === 'break' && wide && (
                    <span className="mt-1 inline-block rounded bg-amber-50 px-1 text-[10px] font-medium leading-tight text-amber-700">พัก {hm((b.s1 - b.s0) / 60)}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* การ์ดจุด (เริ่มต้น · จุดพัก · สิ้นสุด) */}
          <div className="scroll-soft mt-3 flex gap-2 overflow-x-auto pb-1">
            {nodes.map((n, i) => {
              const stopNo = nodes.slice(0, i + 1).filter((x) => x.kind === 'stop').length
              const dot = n.kind === 'stop' ? BREAK : END
              const title = n.kind === 'start' ? 'เริ่มต้น' : n.kind === 'end' ? 'สิ้นสุด' : `จุดพัก ${stopNo}`
              const timeTxt = n.kind === 'stop' ? `${hhmm(n.timeSec)}–${n.endSec != null ? hhmm(n.endSec) : '—'}` : hhmm(n.timeSec)
              const place = n.kind === 'stop' ? n.label : (n.place || (n.kind === 'start' ? 'ต้นทาง' : 'ปลายทาง'))
              return (
                <div key={i} className="min-w-[150px] max-w-[190px] shrink-0 rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
                    <span className="text-xs font-semibold text-slate-700">{title}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{timeTxt}</div>
                  <div className="mt-0.5 flex items-start gap-1 text-[11px] text-slate-500">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    <span className={`line-clamp-2 ${n.kind === 'stop' && n.isSite ? 'font-medium text-emerald-700' : ''}`}>{place}</span>
                  </div>
                  {n.kind === 'stop' && (
                    <div className="mt-1.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">พัก {hm(n.dwellMin)}</div>
                  )}
                </div>
              )
            })}
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
  )
}
