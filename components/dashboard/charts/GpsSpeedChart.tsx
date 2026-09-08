'use client'

// กราฟความเร็ว-เวลา ของรถคันที่เลือก (SVG มือ) — เส้นความเร็วจริง vs เส้นจำกัดตามกฎหมาย (Road Speed)
//  hover: เวลา · ความเร็ว · จำกัด · สถานที่ + ป้าย "เกินกำหนด"
import { useLayoutEffect, useRef, useState, useMemo } from 'react'
import { MUTED } from '@/lib/chartTheme'

export type SpeedPoint = [number, number, number, string]  // [secOfDay, speed, roadSpeed, place]

const SPEED = '#2563eb', LIMIT = '#f59e0b', OVER = '#dc2626'
const hhmm = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`

// rolling mean (หน้าต่างกลาง) — ลด jitter เส้นความเร็ว
function rollMean(a: number[], win: number): number[] {
  const h = win >> 1, out = new Array<number>(a.length)
  for (let i = 0; i < a.length; i++) {
    let s = 0, c = 0
    for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < a.length) { s += a[j]; c++ }
    out[i] = c ? s / c : a[i]
  }
  return out
}
// rolling median — กรอง noise เส้นจำกัดถนน (ไม่ให้กระพริบ)
function rollMedian(a: number[], win: number): number[] {
  const h = win >> 1, out = new Array<number>(a.length)
  for (let i = 0; i < a.length; i++) {
    const g: number[] = []
    for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < a.length) g.push(a[j])
    g.sort((x, y) => x - y)
    out[i] = g[g.length >> 1]
  }
  return out
}
// เส้นโค้ง Catmull-Rom → cubic bezier
function smoothPath(P: [number, number][]): string {
  if (P.length < 2) return P.length ? `M ${P[0][0]} ${P[0][1]}` : ''
  let d = `M ${P[0][0]} ${P[0][1]}`
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

export default function GpsSpeedChart({ series, maxSpeed, overspeedPct }: {
  series: SpeedPoint[] | null
  maxSpeed: number
  overspeedPct: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    setW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [])

  // place แบบ carry-forward (ค่าว่าง = ใช้ค่าก่อนหน้า)
  const places = useMemo(() => {
    if (!series) return []
    const out: string[] = []; let last = ''
    for (const p of series) { if (p[3]) last = p[3]; out.push(last) }
    return out
  }, [series])

  if (!series || series.length < 2) {
    return (
      <div className="flex h-[420px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 text-sm text-slate-400">
        ไม่มีข้อมูลความเร็วสำหรับวันนี้
        <span className="text-xs text-slate-300">อัปโหลดไฟล์ของวันนี้ใหม่อีกครั้งเพื่อให้ระบบเก็บข้อมูลความเร็ว</span>
      </div>
    )
  }

  const pts: SpeedPoint[] = series   // narrowed non-null (ใช้ใน closure ที่ TS ไม่ narrow ให้)
  const H = 420, HEAD = 30, ML = 34, MR = 12, MT = HEAD + 8
  const XLBL = 14, STRIP_GAP = 8, STRIP_H = 12          // ล่าง: ป้ายเวลา + แถบ "ช่วงเกินความเร็ว"
  const MB = XLBL + STRIP_GAP + STRIP_H + 6
  const plotW = Math.max(10, w - ML - MR)
  const plotH = H - MT - MB
  const stripY = MT + plotH + XLBL + STRIP_GAP          // ขอบบนของแถบเกินความเร็ว
  const minX = series[0][0], maxX = series[series.length - 1][0]
  const spanX = Math.max(1, maxX - minX)
  const maxRoad = series.reduce((m, p) => Math.max(m, p[2]), 0)
  // ยืดหัวแกน Y ให้เส้นไม่ชนขอบ (ปัดขึ้นทีละ 20, ขั้นต่ำ 130)
  const maxY = Math.max(130, Math.ceil((Math.max(maxSpeed, maxRoad) + 10) / 20) * 20)

  const xOf = (sec: number) => ML + ((sec - minX) / spanX) * plotW
  const yOf = (v: number) => MT + plotH - (v / maxY) * plotH

  const N = series.length
  const spd = series.map((p) => p[1])
  const road = series.map((p) => p[2])
  // สมูทความเร็ว (rolling mean) ลด jitter · กรอง noise เส้นจำกัดถนน (median)
  const sm = rollMean(spd, 7)
  const roadMed = rollMedian(road, 9)

  // เส้นความเร็วจริง — โค้ง smooth (Catmull-Rom) บนค่าที่สมูทแล้ว
  const linePts: [number, number][] = series.map((p, i) => [xOf(p[0]), yOf(sm[i])])
  const lineD = smoothPath(linePts)
  const areaD = linePts.length >= 2 ? `${lineD} L ${xOf(maxX)} ${MT + plotH} L ${xOf(minX)} ${MT + plotH} Z` : ''

  // เส้นจำกัด (step) จากค่า median — เว้นช่วงที่ roadSpeed=0
  let limitD = ''; let penDown = false
  for (let i = 0; i < N; i++) {
    const rv = roadMed[i]
    if (rv <= 0) { penDown = false; continue }
    const x = xOf(series[i][0]), y = yOf(rv)
    if (!penDown) { limitD += `M ${x} ${y} `; penDown = true }
    else { const px = xOf(series[i - 1][0]); limitD += `L ${px} ${y} L ${x} ${y} ` }
  }

  // ช่วงวิ่งเกินกำหนด (speed จริง > จำกัดจริง) → เก็บเป็นช่วงเวลา ไว้วาดเป็นแถบด้านล่าง
  const overRuns: [number, number][] = []
  let runStart = -1
  for (let i = 0; i < N; i++) {
    const o = road[i] > 0 && spd[i] > road[i]
    if (o) { if (runStart < 0) runStart = series[i][0] }
    else if (runStart >= 0) { overRuns.push([runStart, series[i - 1][0]]); runStart = -1 }
  }
  if (runStart >= 0) overRuns.push([runStart, series[N - 1][0]])
  const overCount = series.reduce((c, p) => c + (p[2] > 0 && p[1] > p[2] ? 1 : 0), 0)

  // grid + x ticks
  const yLines = [30, 50, 80, 100, 120, 140].filter((v) => v <= maxY)
  const stepH = spanX > 6 * 3600 ? 2 * 3600 : 3600
  const xTicks: number[] = []
  for (let t = Math.ceil(minX / stepH) * stepH; t <= maxX; t += stepH) xTicks.push(t)

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = w / rect.width
    const px = (e.clientX - rect.left) * scale
    const sec = minX + ((px - ML) / plotW) * spanX
    // binary search จุดใกล้สุด
    let lo = 0, hi = pts.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] < sec) lo = mid + 1; else hi = mid }
    if (lo > 0 && Math.abs(pts[lo - 1][0] - sec) < Math.abs(pts[lo][0] - sec)) lo--
    setHover({ i: lo, x: (e.clientX - rect.left), y: (e.clientY - rect.top) })
  }

  const hp = hover ? pts[hover.i] : null
  const over = hp ? (hp[2] > 0 && hp[1] > hp[2]) : false

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* แถบสรุป */}
      <div className="flex h-[30px] items-center gap-3 text-xs">
        <span className="font-semibold text-slate-600">ความเร็ว–เวลา</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm" style={{ background: SPEED }} /> จริง</span>
        <span className="inline-flex items-center gap-1"><i className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: LIMIT }} /> จำกัดถนน</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm" style={{ background: OVER }} /> เกินความเร็ว</span>
        <span className="ml-auto text-slate-500">สูงสุด <b className="font-mono text-slate-700">{maxSpeed}</b> กม./ชม. · เกินกำหนด <b className="font-mono" style={{ color: overspeedPct > 0 ? OVER : '#64748b' }}>{overspeedPct}%</b> ({overCount} จุด)</span>
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="กราฟความเร็ว-เวลา"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="rounded-lg border border-slate-200">
        {/* y grid */}
        {yLines.map((v) => (
          <g key={v}>
            <line x1={ML} y1={yOf(v)} x2={ML + plotW} y2={yOf(v)} stroke="#eef2f6" />
            <text x={ML - 5} y={yOf(v) + 3} textAnchor="end" fontSize={9} fill={MUTED}>{v}</text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((t) => (
          <text key={t} x={xOf(t)} y={MT + plotH + XLBL - 2} textAnchor="middle" fontSize={9} fill={MUTED}>{hhmm(t)}</text>
        ))}

        {/* limit step line (denoised, บาง solid) */}
        <path d={limitD} fill="none" stroke={LIMIT} strokeWidth={1.4} strokeOpacity={0.75} strokeDasharray="6 4" strokeLinejoin="round" />
        {/* area + speed line (smooth) */}
        <path d={areaD} fill={SPEED} fillOpacity={0.08} />
        <path d={lineD} fill="none" stroke={SPEED} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

        {/* แถบช่วงเกินความเร็ว (ล่างกราฟ) */}
        <line x1={ML} y1={stripY + STRIP_H / 2} x2={ML + plotW} y2={stripY + STRIP_H / 2} stroke="#eef2f6" strokeWidth={STRIP_H} />
        <text x={ML} y={stripY - 3} fontSize={8.5} fill={MUTED}>ช่วงเกินความเร็ว</text>
        {overRuns.map(([s, e], i) => {
          const x1 = xOf(s), x2 = xOf(e)
          return <rect key={i} x={x1} y={stripY} width={Math.max(3, x2 - x1)} height={STRIP_H} rx={2} fill={OVER} />
        })}

        {/* hover guide */}
        {hp && (
          <g>
            <line x1={xOf(hp[0])} y1={MT} x2={xOf(hp[0])} y2={stripY + STRIP_H} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={xOf(hp[0])} cy={yOf(sm[hover!.i])} r={4} fill={over ? OVER : SPEED} stroke="#fff" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hp && hover && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: Math.min(Math.max(hover.x + 12, 4), w - 170), top: Math.max(hover.y - 10, HEAD) }}>
          <div className="font-mono font-semibold text-slate-700">{hhmm(hp[0])}</div>
          <div>ความเร็ว <b className="font-mono" style={{ color: over ? OVER : SPEED }}>{hp[1]}</b> กม./ชม.
            {hp[2] > 0 && <span className="text-slate-400"> · จำกัด {hp[2]}</span>}
            {over && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-medium text-red-600">เกินกำหนด</span>}
          </div>
          {places[hover.i] && <div className="mt-0.5 max-w-[160px] truncate text-slate-500">{places[hover.i]}</div>}
        </div>
      )}
    </div>
  )
}
