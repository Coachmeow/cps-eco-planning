'use client'

// กราฟความเร็ว-เวลา ของรถคันที่เลือก (SVG มือ) — เส้นความเร็วจริง vs เส้นจำกัดตามกฎหมาย (Road Speed)
//  hover: เวลา · ความเร็ว · จำกัด · สถานที่ + ป้าย "เกินกำหนด"
import { useLayoutEffect, useRef, useState, useMemo } from 'react'
import { MUTED } from '@/lib/chartTheme'

export type SpeedPoint = [number, number, number, string]  // [secOfDay, speed, roadSpeed, place]

const SPEED = '#2563eb', LIMIT = '#f59e0b', OVER = '#dc2626'
const hhmm = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`

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
  const H = 420, HEAD = 30, ML = 34, MR = 12, MT = HEAD + 8, MB = 22
  const plotW = Math.max(10, w - ML - MR)
  const plotH = H - MT - MB
  const minX = series[0][0], maxX = series[series.length - 1][0]
  const spanX = Math.max(1, maxX - minX)
  const maxRoad = series.reduce((m, p) => Math.max(m, p[2]), 0)
  const maxY = Math.max(130, maxSpeed, maxRoad)

  const xOf = (sec: number) => ML + ((sec - minX) / spanX) * plotW
  const yOf = (v: number) => MT + plotH - (v / maxY) * plotH

  // เส้นความเร็วจริง (area + line)
  let areaD = `M ${xOf(minX)} ${MT + plotH}`, lineD = ''
  series.forEach((p, i) => { const x = xOf(p[0]), y = yOf(p[1]); areaD += ` L ${x} ${y}`; lineD += `${i ? 'L' : 'M'} ${x} ${y} ` })
  areaD += ` L ${xOf(maxX)} ${MT + plotH} Z`

  // เส้นจำกัด (step) — เว้นช่วงที่ roadSpeed=0
  let limitD = ''; let penDown = false
  series.forEach((p, i) => {
    if (p[2] <= 0) { penDown = false; return }
    const x = xOf(p[0]), y = yOf(p[2])
    if (!penDown) { limitD += `M ${x} ${y} `; penDown = true }
    else { const px = xOf(series[i - 1][0]); limitD += `L ${px} ${y} L ${x} ${y} ` }
  })

  // จุดวิ่งเกินกำหนด
  const overPts = series.filter((p) => p[2] > 0 && p[1] > p[2])

  // grid + x ticks
  const yLines = [30, 50, 80, 100, 120].filter((v) => v <= maxY)
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
        <span className="ml-auto text-slate-500">สูงสุด <b className="font-mono text-slate-700">{maxSpeed}</b> กม./ชม. · เกินกำหนด <b className="font-mono" style={{ color: overspeedPct > 0 ? OVER : '#64748b' }}>{overspeedPct}%</b> ({overPts.length} จุด)</span>
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
          <text key={t} x={xOf(t)} y={H - 7} textAnchor="middle" fontSize={9} fill={MUTED}>{hhmm(t)}</text>
        ))}

        {/* area + speed line */}
        <path d={areaD} fill={SPEED} fillOpacity={0.1} />
        <path d={lineD} fill="none" stroke={SPEED} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        {/* limit step line */}
        <path d={limitD} fill="none" stroke={LIMIT} strokeWidth={1.6} strokeDasharray="5 3" strokeLinejoin="round" />
        {/* overspeed dots */}
        {overPts.map((p, i) => <circle key={i} cx={xOf(p[0])} cy={yOf(p[1])} r={1.8} fill={OVER} />)}

        {/* hover guide */}
        {hp && (
          <g>
            <line x1={xOf(hp[0])} y1={MT} x2={xOf(hp[0])} y2={MT + plotH} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={xOf(hp[0])} cy={yOf(hp[1])} r={4} fill={over ? OVER : SPEED} stroke="#fff" strokeWidth={1.5} />
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
