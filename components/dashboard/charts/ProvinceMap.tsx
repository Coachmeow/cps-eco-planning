'use client'

// แผนที่ Dashboard — แผนที่ไทยอันเดียว สลับ 2 มุมมองด้วย toggle:
//  1) กระจายงาน (heatmap คน-วัน/ไซต์/หัวคน) + hover/ปักหมุดจังหวัด + สภาพอากาศเสี่ยง (idle)
//  2) เส้นทางเดินทาง (arcs ฐานสระบุรี→ไซต์ วันนี้/พรุ่งนี้) + รายการรถที่กำลังเดินทาง
// ขวา: พนักงานประจำออฟฟิศ + รถพร้อมใช้งาน (เลือกวันที่แยกอิสระต่อกล่อง)
// API: province-map · weather · office-staff · office-vehicles · travel
import { useState, useEffect, useMemo, useRef } from 'react'
import { Truck, HardHat, Building2, CloudRain, Thermometer, Sun, CloudSunRain, Droplet, Pin, Phone, Plane, Layers, Car, Bus, MapPin, Play, Pause, type LucideIcon } from 'lucide-react'
import { PROVINCES, MAP_W, MAP_H } from '@/lib/thailandGeo'
import { teamHex, SEQ_GREEN } from '@/lib/chartTheme'

interface Staff { id: number; nick: string; team: string; tel: string | null; days: number }
interface Veh { plate: string; name: string | null; driver: string | null; site: string | null }
interface Prov { name: string; manDays: number; head: number; sites: number; vehicles: Veh[]; staff: Staff[] }
interface Resp { scope: string; date?: string; provinces: Prov[]; unmatched: { sites: number; days: number } }

interface WxDay { date: string; rainProb: number; tmax: number; level: number; kind: string }
interface WxProv { name: string; daily: WxDay[]; worst: number }
interface Wx { days: string[]; provinces: WxProv[]; error?: boolean }

interface Office { id: number; nick: string; team: string; tel: string | null }
interface OfficeResp { date: string; office: Office[]; onLeave: number; field: number; error?: boolean }

interface Trip {
  plate: string; vtype: string | null; driver: string; tel: string | null; team: string
  fromProv: string | null; fromSite: string | null; fromBase: boolean
  toProv: string | null; toSite: string; days: number; cross: boolean
}
interface TravelResp { date: string; trips: Trip[]; error?: boolean }
interface OfficeVeh { id: number; plate: string; name: string | null; type: string | null }
interface OfficeVehResp { date: string; vehicles: OfficeVeh[]; booked: number; total: number; error?: boolean }

// จุดกลางจังหวัด (พิกัด SVG) + ฐานสระบุรี — สำหรับวาดเส้นทางเดินทาง
const CENT = new Map(PROVINCES.map((p) => [p.th, { x: p.cx, y: p.cy }]))
const HUB = CENT.get('สระบุรี') ?? { x: 214, y: 353 }
function arcPath(o: { x: number; y: number }, d: { x: number; y: number }): string {
  const mx = (o.x + d.x) / 2, my = (o.y + d.y) / 2
  const dx = d.x - o.x, dy = d.y - o.y, len = Math.hypot(dx, dy) || 1
  const cx = mx + (-dy / len) * len * 0.22, cy = my + (dx / len) * len * 0.22
  return `M ${o.x} ${o.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${d.x} ${d.y}`
}
function offsetDayKey(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ไอคอนตามชนิดรถ (จาก Vehicle.vehicleType)
function vehIcon(type: string | null | undefined): LucideIcon {
  const t = type || ''
  if (t.includes('เก๋ง')) return Car
  if (t.includes('ตู้')) return Bus
  return Truck // กระบะ / บรรทุก / ปูน / อื่นๆ
}

const ZERO = '#f1f5f9'
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const STOPS = SEQ_GREEN.map(hexToRgb)
function heat(t: number): string {
  if (t <= 0) return ZERO
  const tt = Math.min(1, t)
  const p = tt * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(p))
  const f = p - i
  const c = STOPS[i].map((a, k) => Math.round(a + (STOPS[i + 1][k] - a) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// สีตามระดับความเสี่ยงอากาศ
const WX_CLS = ['border-slate-200 bg-slate-50 text-slate-500', 'border-amber-200 bg-amber-50 text-amber-700', 'border-red-200 bg-red-50 text-red-700']
const WxIcon = ({ kind, className }: { kind: string; className?: string }) => {
  const I: LucideIcon = kind === 'rain' ? CloudRain : kind === 'heat' ? Thermometer : Sun
  return <I className={className} />
}

export default function ProvinceMap({ year, month }: { year: number; month: number }) {
  const [mode, setMode] = useState<'month' | 'today' | 'date'>('month')
  const [metric, setMetric] = useState<'md' | 'sites'>('md')
  const [pickDate, setPickDate] = useState(todayKey())
  const [resp, setResp] = useState<(Resp & { key: string; error?: boolean }) | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pinnedName, setPinnedName] = useState<string | null>(null)
  const [wx, setWx] = useState<Wx | null>(null)
  const [office, setOffice] = useState<OfficeResp | null>(null)
  // กล่อง idle (ตรงกลาง) — สลับ 2 มุมมอง: สภาพอากาศ ↔ พนักงานประจำ Location วันนี้
  const [idleView, setIdleView] = useState<'wx' | 'loc'>('wx')       // แท็บที่เลือก
  const [idleDisplay, setIdleDisplay] = useState<'wx' | 'loc'>('wx') // หน้าที่แสดงจริง (สลับตอนจางหาย)
  const [idleVisible, setIdleVisible] = useState(true)              // opacity สำหรับ crossfade
  const [idleAuto, setIdleAuto] = useState(true)   // หมุนอัตโนมัติทุก 6 วิ
  const [idlePaused, setIdlePaused] = useState(false) // หยุดชั่วคราวเมื่อชี้เมาส์
  const [locData, setLocData] = useState<(Resp & { error?: boolean }) | null>(null) // สแนปช็อตพนักงานวันนี้ (คงที่)
  const wxTabRef = useRef<HTMLButtonElement>(null)
  const locTabRef = useRef<HTMLButtonElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 }) // ตำแหน่งไฮไลต์เลื่อน
  const [viewMode, setViewMode] = useState<'heat' | 'travel'>('heat')
  const [travelDay, setTravelDay] = useState<'today' | 'tomorrow' | 'date'>('today')
  const [travelPickDate, setTravelPickDate] = useState(todayKey())
  const [travel, setTravel] = useState<(TravelResp & { key: string }) | null>(null)
  const [officeVeh, setOfficeVeh] = useState<OfficeVehResp | null>(null)
  const [hoverRoute, setHoverRoute] = useState<number | null>(null)

  // วันที่ของแต่ละกล่องออฟฟิศ (เลือกอิสระ · เริ่มที่วันนี้)
  const [staffDate, setStaffDate] = useState(todayKey())
  const [vehDate, setVehDate] = useState(todayKey())
  const travelDateKey = travelDay === 'today' ? todayKey() : travelDay === 'tomorrow' ? offsetDayKey(1) : travelPickDate
  const travelDayLabel = travelDay === 'today' ? 'วันนี้' : travelDay === 'tomorrow' ? 'พรุ่งนี้' : travelPickDate

  const reqKey =
    mode === 'month' ? `m:${year}-${month}`
    : mode === 'today' ? `d:${todayKey()}`
    : `d:${pickDate}`

  useEffect(() => {
    let cancelled = false
    const base = '/api/dashboard/province-map'
    const url =
      mode === 'month' ? `${base}?scope=month&year=${year}&month=${month}`
      : mode === 'today' ? `${base}?scope=date&date=${todayKey()}`
      : `${base}?scope=date&date=${pickDate}`
    fetch(url)
      .then((r) => r.json())
      .then((d: Resp) => {
        if (cancelled) return
        setResp({ ...d, key: reqKey })
        setHover(null); setPinnedName(null)
      })
      .catch(() => {
        if (cancelled) return
        setResp({ scope: '', provinces: [], unmatched: { sites: 0, days: 0 }, key: reqKey, error: true })
      })
    return () => { cancelled = true }
  }, [reqKey, mode, pickDate, year, month])

  // สภาพอากาศ — ดึงครั้งเดียวตอน mount (อิสระจากโหมดแผนที่)
  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/weather')
      .then((r) => r.json())
      .then((d: Wx) => { if (!cancelled) setWx(d) })
      .catch(() => { if (!cancelled) setWx({ days: [], provinces: [], error: true }) })
    return () => { cancelled = true }
  }, [])

  // พนักงานประจำ Location วันนี้ — ดึงครั้งเดียวตอน mount (แยกจากโหมดแผนที่ ให้เป็น "วันนี้" เสมอ)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/province-map?scope=date&date=${todayKey()}`)
      .then((r) => r.json())
      .then((d: Resp) => { if (!cancelled) setLocData(d) })
      .catch(() => { if (!cancelled) setLocData({ scope: '', provinces: [], unmatched: { sites: 0, days: 0 }, error: true }) })
    return () => { cancelled = true }
  }, [])

  // พนักงานประจำออฟฟิศ — ตามวันที่ staffDate
  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/office-staff?date=${staffDate}`)
      .then((r) => r.json())
      .then((d: OfficeResp) => { if (!cancelled) setOffice(d) })
      .catch(() => { if (!cancelled) setOffice({ date: staffDate, office: [], onLeave: 0, field: 0, error: true }) })
    return () => { cancelled = true }
  }, [staffDate])

  // รถพร้อมใช้งาน — ตามวันที่ vehDate
  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/office-vehicles?date=${vehDate}`)
      .then((r) => r.json())
      .then((d: OfficeVehResp) => { if (!cancelled) setOfficeVeh(d) })
      .catch(() => { if (!cancelled) setOfficeVeh({ date: vehDate, vehicles: [], booked: 0, total: 0, error: true }) })
    return () => { cancelled = true }
  }, [vehDate])

  // เส้นทางเดินทาง — ดึงเมื่ออยู่โหมดเส้นทาง
  useEffect(() => {
    if (viewMode !== 'travel') return
    let cancelled = false
    fetch(`/api/dashboard/travel?date=${travelDateKey}`)
      .then((r) => r.json())
      .then((d: TravelResp) => { if (!cancelled) setTravel({ ...d, key: travelDateKey }) })
      .catch(() => { if (!cancelled) setTravel({ date: travelDateKey, trips: [], error: true, key: travelDateKey }) })
    return () => { cancelled = true }
  }, [viewMode, travelDateKey])

  const loading = !resp || resp.key !== reqKey
  const live = mode !== 'month'
  const byName = useMemo(() => {
    const m = new Map<string, Prov>()
    resp?.provinces.forEach((p) => m.set(p.name, p))
    return m
  }, [resp])
  const valOf = (p?: Prov) => (!p ? 0 : live ? p.head : metric === 'sites' ? p.sites : p.manDays)
  const maxVal = useMemo(() => {
    if (!resp) return 1
    return Math.max(1, ...resp.provinces.map((p) => valOf(p)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resp, live, metric])

  const shownName = hover ?? pinnedName
  const shown = shownName ? byName.get(shownName) : undefined
  const legendLabel = live ? 'คนอยู่พื้นที่' : metric === 'sites' ? 'จำนวนไซต์' : 'ปริมาณงาน (คน-วัน)'

  const travelView = viewMode === 'travel'
  // เส้นบนแผนที่ = เฉพาะทริปข้ามจังหวัดที่รู้พิกัดต้นทาง-ปลายทาง (index อิงลำดับใน trips ทั้งหมด)
  const routes = useMemo(() => {
    const list = (travel?.trips ?? []).map((t, i) => {
      if (!t.cross || !t.fromProv || !t.toProv) return null
      const from = CENT.get(t.fromProv)
      const to = CENT.get(t.toProv)
      if (!from || !to) return null
      return { t, i, from, to, path: arcPath(from, to), col: teamHex(t.team) }
    })
    return list.filter((r): r is NonNullable<typeof r> => r !== null)
  }, [travel])
  const allTrips = travel?.trips ?? []
  const travelLoading = travelView && (!travel || travel.key !== travelDateKey)

  // อันดับความเสี่ยงอากาศต่อจังหวัด (ไว้เรียงหน้า Location + ป้ายชิปบนหัวจังหวัด)
  const wxRank = useMemo(() => {
    const m = new Map<string, { rank: number; level: number; kind: string }>()
    wx?.provinces.forEach((p, i) => {
      const wd = p.daily.reduce((a, b) => (b.level > a.level ? b : a), p.daily[0])
      m.set(p.name, { rank: i, level: p.worst, kind: wd?.kind ?? 'sun' })
    })
    return m
  }, [wx])

  // จังหวัดที่มีพนักงานประจำไซต์วันนี้ เรียงตามความเสี่ยงอากาศ (จังหวัดที่ไม่มีข้อมูลอากาศต่อท้าย)
  const locProvinces = useMemo(() => {
    const list = (locData?.provinces ?? []).filter((p) => p.staff.length > 0)
    return list.slice().sort((a, b) => {
      const ra = wxRank.get(a.name)?.rank ?? 999
      const rb = wxRank.get(b.name)?.rank ?? 999
      if (ra !== rb) return ra - rb
      return b.head - a.head
    })
  }, [locData, wxRank])

  // หมุนสลับ สภาพอากาศ ↔ Location ทุก 6 วิ — หยุดเมื่อชี้เมาส์ / ปิดสวิตช์ / ไม่ได้อยู่โหมด idle
  const idleShown = !travelView && !shown
  useEffect(() => {
    if (!idleAuto || idlePaused || !idleShown) return
    const t = setInterval(() => setIdleView((v) => (v === 'wx' ? 'loc' : 'wx')), 6000)
    return () => clearInterval(t)
  }, [idleAuto, idlePaused, idleShown])

  // crossfade: จางหน้าเดิมออก → สลับเนื้อหาตอนมองไม่เห็น (ความสูงเปลี่ยนตอนซ่อน) → จางเข้า
  useEffect(() => {
    if (idleView === idleDisplay) return
    setIdleVisible(false)
    const t = setTimeout(() => { setIdleDisplay(idleView); setIdleVisible(true) }, 220)
    return () => clearTimeout(t)
  }, [idleView, idleDisplay])

  // ไฮไลต์ toggle เลื่อนไปยังแท็บที่เลือก (วัดตำแหน่งจริงของปุ่ม)
  useEffect(() => {
    const el = idleView === 'wx' ? wxTabRef.current : locTabRef.current
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [idleView, idleShown, wx, locData])

  function togglePin(name: string) { setPinnedName((cur) => (cur === name ? null : name)) }

  return (
    <div>
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* มุมมอง: กระจายงาน ↔ เส้นทาง */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {([['heat', 'กระจายงาน', Layers], ['travel', 'เส้นทาง', Plane]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setViewMode(k)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === k ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {!travelView && (
          <>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {([['month', 'สะสม (เดือน)'], ['today', 'วันนี้'], ['date', 'เลือกวันที่']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    mode === k ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'date' && (
              <input
                type="date"
                value={pickDate}
                onChange={(e) => setPickDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm"
              />
            )}

            {!live && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {([['md', 'คน-วัน'], ['sites', 'จำนวนไซต์']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMetric(k)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      metric === k ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {travelView && (
          <>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {([['today', 'วันนี้'], ['tomorrow', 'พรุ่งนี้'], ['date', 'เลือกวันที่']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTravelDay(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    travelDay === k ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {travelDay === 'date' && (
              <input
                type="date"
                value={travelPickDate}
                onChange={(e) => setTravelPickDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm"
              />
            )}
          </>
        )}
      </div>

      {(!travelView && (loading || !resp)) ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : (!travelView && resp && resp.error) ? (
        <p className="py-8 text-center text-sm text-slate-300">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* ซ้าย: แผนที่ (heatmap หรือ เส้นทาง) + legend */}
          <div className="lg:flex-[2] lg:min-w-0">
            <div className="relative mx-auto aspect-[493/880] w-full max-w-[360px] lg:h-[600px] lg:w-auto lg:max-w-none">
              <svg viewBox={travelView ? '-45 -15 583 915' : `0 0 ${MAP_W} ${MAP_H}`} className="h-full w-full" role="img" aria-label="แผนที่">
                {travelView && (
                  <defs>
                    <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                      <path d="M0 0 L6 3 L0 6 Z" fill="context-stroke" />
                    </marker>
                  </defs>
                )}
                <g>
                  {PROVINCES.map((geo) => {
                    if (travelView) return <path key={geo.th} d={geo.d} fill="#eef2f5" stroke="#c3cddb" strokeWidth={0.5} />
                    const p = byName.get(geo.th)
                    const isPinned = geo.th === pinnedName
                    return (
                      <path
                        key={geo.th}
                        data-prov={geo.th}
                        d={geo.d}
                        fill={heat(valOf(p) / maxVal)}
                        stroke={isPinned ? '#059669' : '#c3cddb'}
                        strokeWidth={isPinned ? 2 : 0.6}
                        className="cursor-pointer transition-[fill] duration-200 hover:stroke-slate-500 hover:[stroke-width:1.4]"
                        onMouseEnter={() => setHover(geo.th)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => togglePin(geo.th)}
                      />
                    )
                  })}
                </g>
                {travelView && (
                  <>
                    <g>
                      {routes.map((r) => (
                        <path
                          key={r.i}
                          d={r.path}
                          fill="none"
                          stroke={r.col}
                          strokeWidth={hoverRoute === r.i ? 3.4 : 2.2}
                          strokeLinecap="round"
                          strokeDasharray="6 6"
                          markerEnd="url(#arrow)"
                          className="route-flow cursor-pointer transition-[opacity,stroke-width]"
                          style={{ opacity: hoverRoute != null && hoverRoute !== r.i ? 0.12 : 0.85 }}
                          onMouseEnter={() => setHoverRoute(r.i)}
                          onMouseLeave={() => setHoverRoute(null)}
                        >
                          <title>{r.t.plate} · {r.t.fromBase ? 'ฐาน' : r.t.fromProv} → {r.t.toProv} · {r.t.toSite}</title>
                        </path>
                      ))}
                    </g>
                    {/* จุดต้นทาง (ไม่ใช่ฐาน) */}
                    <g>
                      {routes.filter((r) => !r.t.fromBase).map((r) => (
                        <circle key={r.i} cx={r.from.x} cy={r.from.y} r={3.5} fill="#94a3b8" stroke="#ffffff" strokeWidth={1.2} />
                      ))}
                    </g>
                    {/* จุดปลายทาง */}
                    <g>
                      {routes.map((r) => (
                        <g key={r.i} className="cursor-pointer" onMouseEnter={() => setHoverRoute(r.i)} onMouseLeave={() => setHoverRoute(null)}>
                          <circle cx={r.to.x} cy={r.to.y} r={4.5} fill={r.col} stroke="#ffffff" strokeWidth={1.5} />
                          <text x={r.to.x} y={r.to.y + (r.i % 2 === 0 ? -8 : 14)} textAnchor="middle" fontSize={9} fontWeight={600} fill="#334155" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">{r.t.toSite}</text>
                        </g>
                      ))}
                    </g>
                    {/* ฐานสระบุรี — โชว์เมื่อมีเส้นทางที่ออกจากฐาน */}
                    {routes.some((r) => r.t.fromBase) && (
                      <g>
                        <circle cx={HUB.x} cy={HUB.y} r={6} fill="#059669" stroke="#ffffff" strokeWidth={2} />
                        <text x={HUB.x + 10} y={HUB.y - 10} textAnchor="start" fontFamily="IBM Plex Sans Thai, sans-serif" fontSize={12} fontWeight={700} fill="#059669" stroke="#ffffff" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">ฐาน สระบุรี</text>
                      </g>
                    )}
                  </>
                )}
              </svg>
            </div>

            {/* legend + คำอธิบาย — อยู่ใต้แผนที่ ไม่ทับตัวแผนที่ */}
            {travelView ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> ฐาน (สระบุรี)</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" /> ต้นทาง (ไซต์เมื่อวาน)</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> เส้นทางข้ามจังหวัด</span>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold uppercase tracking-wide text-slate-400">{legendLabel}</span>
                <span className="h-2 w-28 rounded" style={{ background: `linear-gradient(90deg, ${SEQ_GREEN[0]}, ${SEQ_GREEN[2]}, ${SEQ_GREEN[5]})` }} />
                <span className="text-slate-400">น้อย → สูงสุด {maxVal}</span>
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              {travelView
                ? 'รถที่ออกไซต์ใหม่ ' + travelDayLabel + ' · เส้นบนแผนที่ = ย้ายข้ามจังหวัด (ต้นทาง=ไซต์เมื่อวาน/ฐาน=สระบุรี)'
                : live
                ? 'ความเข้มสี = จำนวนคนที่อยู่พื้นที่' + (mode === 'today' ? 'วันนี้' : 'วันที่เลือก') + ' · ชี้จังหวัด=ดู · คลิก=ปักหมุด'
                : 'ความเข้มสี = ' + (metric === 'sites' ? 'จำนวนไซต์' : 'คน-วันสะสมทั้งเดือน') + ' · ชี้จังหวัด=ดู · คลิก=ปักหมุด'}
            </p>
          </div>

          {/* กลาง: จังหวัด/อากาศ (heatmap) หรือ รถที่กำลังเดินทาง (travel) — สูงเท่าแผนที่ */}
          <div className="scroll-soft overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4 lg:h-[600px] lg:flex-1 lg:min-w-0">
            {travelView ? (
              <TravelPanel trips={allTrips} dayLabel={travelDayLabel} loading={travelLoading} error={!!travel?.error} hoverRoute={hoverRoute} setHoverRoute={setHoverRoute} />
            ) : shown ? (
              <ProvincePanel prov={shown} live={live} mode={mode} date={resp?.date} isPinned={shownName === pinnedName} onUnpin={() => setPinnedName(null)} />
            ) : (
              <div onMouseEnter={() => setIdlePaused(true)} onMouseLeave={() => setIdlePaused(false)}>
                {/* toggle สลับ สภาพอากาศ ↔ ประจำ Location — ไฮไลต์เลื่อนตาม */}
                <div className="mb-3 flex items-center gap-1.5">
                  <div className="relative inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                    <span
                      aria-hidden
                      className="absolute bottom-0.5 top-0.5 rounded bg-emerald-600 transition-all duration-300 ease-out"
                      style={{ left: pill.left, width: pill.width, opacity: pill.width ? 1 : 0 }}
                    />
                    {([['wx', 'สภาพอากาศ', CloudSunRain], ['loc', 'ประจำ Location', MapPin]] as const).map(([k, label, Icon]) => (
                      <button
                        key={k}
                        ref={k === 'wx' ? wxTabRef : locTabRef}
                        onClick={() => setIdleView(k)}
                        className={`relative z-10 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors duration-300 ${
                          idleView === k ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setIdleAuto((a) => !a)}
                    title={idleAuto ? 'หยุดการสลับอัตโนมัติ' : 'สลับอัตโนมัติทุก 6 วิ'}
                    className="ml-auto inline-flex items-center rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
                  >
                    {idleAuto ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                </div>
                <div className="transition-opacity duration-200 ease-out" style={{ opacity: idleVisible ? 1 : 0 }}>
                  {idleDisplay === 'wx'
                    ? <WeatherPanel wx={wx} />
                    : <LocationPanel provinces={locProvinces} wxRank={wxRank} loading={!locData} error={!!locData?.error} />}
                </div>
              </div>
            )}
          </div>

          {/* ขวาสุด: พนักงาน + รถ อยู่ออฟฟิศ ซ้อนบน-ล่าง (กว้างเท่ากล่องกลาง · แต่ละกล่องครึ่งความสูง) */}
          <div className="flex flex-col gap-5 lg:h-[600px] lg:flex-1 lg:min-w-0">
            <div className="scroll-soft overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4 lg:min-h-0 lg:flex-1">
              <OfficePanel office={office} loading={!office || office.date !== staffDate} date={staffDate} onDate={setStaffDate} />
            </div>
            <div className="scroll-soft overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4 lg:min-h-0 lg:flex-1">
              <OfficeVehPanel data={officeVeh} loading={!officeVeh || officeVeh.date !== vehDate} date={vehDate} onDate={setVehDate} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProvincePanel({ prov, live, mode, date, isPinned, onUnpin }: {
  prov: Prov; live: boolean; mode: string; date?: string; isPinned: boolean; onUnpin: () => void
}) {
  return (
    <div className="text-sm">
      <div className="mb-0.5 flex items-center gap-2">
        <h3 className="text-lg font-bold text-slate-800">{prov.name}</h3>
        {isPinned && (
          <button onClick={onUnpin} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100">
            <Pin className="h-3 w-3" /> ปักหมุด · คลิกเพื่อปลด
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-400">{live ? (mode === 'today' ? 'สถานะ ณ วันนี้' : `ณ ${date ?? ''}`) : 'งานเดือนนี้'}</p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { n: live ? prov.head : prov.manDays, l: live ? 'คนวันนี้' : 'คน-วัน' },
          { n: prov.sites, l: 'ไซต์' },
          { n: prov.vehicles.length, l: 'รถ' },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="font-mono text-xl font-semibold tabular-nums text-slate-800">{s.n}</div>
            <div className="text-xs text-slate-500">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Truck className="h-3.5 w-3.5" /> รถในพื้นที่ <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{prov.vehicles.length}</span>
      </div>
      {prov.vehicles.length === 0 ? (
        <p className="py-0.5 text-xs text-slate-300">ไม่มีรถ</p>
      ) : (
        <div className="mb-3">
          {prov.vehicles.map((v) => (
            <div key={v.plate} className="flex items-center gap-2 border-t border-slate-100 py-1.5">
              <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-700">{v.plate}</span>
              <span className="min-w-0 leading-tight">
                <b className="text-xs text-slate-700">{v.name || '—'}</b>
                <span className="block truncate text-[11px] text-slate-400">{[v.driver, v.site].filter(Boolean).join(' · ')}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        <HardHat className="h-3.5 w-3.5" /> พนักงาน <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{prov.staff.length}</span>
      </div>
      <div>
        {prov.staff.map((s) => {
          const col = teamHex(s.team)
          return (
            <div key={s.id} className="flex items-center gap-2.5 border-t border-slate-100 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/employees/${s.id}/photo`}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
                style={{ background: col + '22' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
              />
              <span className="min-w-0 flex-1 leading-tight">
                <b className="text-xs text-slate-700">{s.nick}</b>
                <span className="ml-1 font-mono text-[11px]" style={{ color: col }}>{s.team}</span>
                {s.tel && (
                  <a href={`tel:${s.tel.replace(/[^0-9+]/g, '')}`} className="block truncate font-mono text-[11px] text-slate-500 hover:text-emerald-600">
                    📞 {s.tel}
                  </a>
                )}
              </span>
              {!live && <span className="shrink-0 font-mono text-[11px] text-slate-400">{s.days} ว</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeatherPanel({ wx }: { wx: Wx | null }) {
  const tk = todayKey()
  if (!wx) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลดสภาพอากาศ...</div>
  if (wx.error) return <div className="flex h-full items-center justify-center text-sm text-slate-400">ดึงสภาพอากาศไม่สำเร็จ</div>
  if (wx.provinces.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-slate-400">
      <CloudSunRain className="h-8 w-8 text-slate-300" />
      <span>ไม่มีงานล่วงหน้า 3 วัน</span>
      <span className="text-xs text-slate-300">ชี้จังหวัดบนแผนที่เพื่อดูรถ + พนักงาน</span>
    </div>
  )
  return (
    <div className="text-sm">
      <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800"><CloudSunRain className="h-4 w-4 text-sky-500" /> สภาพอากาศ</h3>
      <p className="mb-3 flex flex-wrap items-center gap-x-1 text-xs text-slate-400">จังหวัดที่มีงานล่วงหน้า 3 วัน · <CloudRain className="inline h-3 w-3" /> เสี่ยงฝน · <Thermometer className="inline h-3 w-3" /> ร้อนจัด</p>
      <div className="space-y-2">
        {wx.provinces.map((p) => (
          <div key={p.name} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="mb-1.5 text-sm font-semibold text-slate-700">{p.name}</div>
            <div className="flex gap-1.5">
              {p.daily.map((d) => (
                <div key={d.date} className={`flex-1 rounded-md border px-1.5 py-1 text-center ${WX_CLS[d.level]}`}>
                  <div className="text-[10px] opacity-70">{d.date === tk ? 'วันนี้' : `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`}</div>
                  <div className="flex justify-center py-0.5"><WxIcon kind={d.kind} className="h-4 w-4" /></div>
                  <div className="flex items-center justify-center gap-0.5 font-mono text-[10px] tabular-nums"><Droplet className="h-2.5 w-2.5" />{d.rainProb}%</div>
                  <div className="font-mono text-[10px] tabular-nums">{d.tmax}°</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ป้ายชิปความเสี่ยงอากาศบนหัวจังหวัด (อธิบายว่าเรียงตามอะไร)
function WxChip({ wr }: { wr?: { level: number; kind: string } }) {
  if (!wr) return null
  const [cls, label] =
    wr.level === 2 ? ['border-red-200 bg-red-50 text-red-700', 'เสี่ยง']
    : wr.level === 1 ? ['border-amber-200 bg-amber-50 text-amber-700', 'เฝ้าระวัง']
    : ['border-slate-200 bg-slate-50 text-slate-500', 'ปกติ']
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      <WxIcon kind={wr.kind} className="h-2.5 w-2.5" /> {label}
    </span>
  )
}

function LocationPanel({ provinces, wxRank, loading, error }: {
  provinces: Prov[]
  wxRank: Map<string, { rank: number; level: number; kind: string }>
  loading: boolean; error: boolean
}) {
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
  if (error) return <div className="flex h-full items-center justify-center text-sm text-slate-400">โหลดข้อมูลไม่สำเร็จ</div>
  if (provinces.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-slate-400">
      <MapPin className="h-8 w-8 text-slate-300" />
      <span>ไม่มีพนักงานประจำไซต์วันนี้</span>
      <span className="text-xs text-slate-300">ชี้จังหวัดบนแผนที่เพื่อดูรายละเอียด</span>
    </div>
  )
  return (
    <div className="text-sm">
      <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800"><MapPin className="h-4 w-4 text-emerald-600" /> ประจำ Location</h3>
      <p className="mb-3 text-xs text-slate-400">พนักงานที่อยู่ไซต์งานรายจังหวัด · วันนี้ · เรียงตามความเสี่ยงอากาศ</p>
      <div className="space-y-2">
        {provinces.map((p) => (
          <div key={p.name} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">{p.name}</span>
              <WxChip wr={wxRank.get(p.name)} />
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500">
                <HardHat className="h-3 w-3" />{p.staff.length}
              </span>
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {p.staff.map((s) => {
                const col = teamHex(s.team)
                return (
                  <div key={s.id} className="w-[84px] shrink-0 rounded-md border border-slate-100 bg-slate-50 p-1.5 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/employees/${s.id}/photo`}
                      alt=""
                      width={30}
                      height={30}
                      className="mx-auto mb-1 h-[30px] w-[30px] rounded-full object-cover"
                      style={{ background: col + '22' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                    <div className="truncate text-[11px] font-semibold text-slate-700">{s.nick}</div>
                    <div className="truncate font-mono text-[9.5px] font-medium" style={{ color: col }}>{s.team}</div>
                    {s.tel && (
                      <a href={`tel:${s.tel.replace(/[^0-9+]/g, '')}`} className="block truncate font-mono text-[9px] text-slate-500 hover:text-emerald-600">
                        {s.tel}
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelDate({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  return (
    <input
      type="date"
      value={date}
      onChange={(e) => onDate(e.target.value || todayKey())}
      className="ml-auto shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 outline-none focus:border-emerald-400"
      title="เลือกวันที่"
    />
  )
}

function OfficePanel({ office, loading, date, onDate }: { office: OfficeResp | null; loading: boolean; date: string; onDate: (d: string) => void }) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800"><Building2 className="h-4 w-4" /> ประจำออฟฟิศ</h3>
        {office && !office.error && <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">{office.office.length}</span>}
        <PanelDate date={date} onDate={onDate} />
      </div>
      {loading || !office ? (
        <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
      ) : office.error ? (
        <p className="py-6 text-center text-sm text-slate-400">โหลดไม่สำเร็จ</p>
      ) : (
        <>
      <p className="mb-3 text-xs text-slate-400">ไม่มีแผนออกภาคสนาม{office.onLeave > 0 ? ` · ลา ${office.onLeave} คน` : ''}</p>
      {office.office.length === 0 ? (
        <p className="text-xs text-slate-300">ทุกคนออกภาคสนาม/ลา</p>
      ) : (
        <div>
          {office.office.map((s) => {
            const col = teamHex(s.team)
            return (
              <div key={s.id} className="flex items-center gap-2.5 border-t border-slate-100 py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/employees/${s.id}/photo`}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                  style={{ background: col + '22' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                />
                <span className="min-w-0 flex-1 leading-tight">
                  <b className="text-xs text-slate-700">{s.nick}</b>
                  <span className="ml-1 font-mono text-[11px]" style={{ color: col }}>{s.team}</span>
                  {s.tel && (
                    <a href={`tel:${s.tel.replace(/[^0-9+]/g, '')}`} className="block truncate font-mono text-[11px] text-slate-500 hover:text-emerald-600">
                      <Phone className="inline h-3 w-3 align-[-1px]" /> {s.tel}
                    </a>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}

function TravelPanel({ trips, dayLabel, loading, error, hoverRoute, setHoverRoute }: {
  trips: Trip[]
  dayLabel: string; loading: boolean; error: boolean
  hoverRoute: number | null; setHoverRoute: (i: number | null) => void
}) {
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
  if (error) return <div className="flex h-full items-center justify-center text-sm text-slate-400">โหลดไม่สำเร็จ</div>
  if (trips.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-slate-400">
      <Plane className="h-8 w-8 text-slate-300" />
      <span>ไม่มีการออกไซต์ใหม่ {dayLabel}</span>
    </div>
  )
  const crossN = trips.filter((t) => t.cross).length
  return (
    <div className="text-sm">
      <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800"><Plane className="h-4 w-4 text-emerald-600" /> รถที่ออกเดินทาง</h3>
      <p className="mb-3 text-xs text-slate-400">{trips.length} คัน · {dayLabel} · ข้ามจังหวัด {crossN} (มีเส้นบนแผนที่)</p>
      <div className="space-y-2">
        {trips.map((t, i) => {
          const VI = vehIcon(t.vtype)
          const col = teamHex(t.team)
          const from = t.fromBase ? 'ฐาน สระบุรี' : t.fromProv ?? t.fromSite ?? '—'
          const to = t.toProv ?? t.toSite
          return (
            <div
              key={t.plate + i}
              onMouseEnter={() => setHoverRoute(i)}
              onMouseLeave={() => setHoverRoute(null)}
              className={`rounded-lg border p-2.5 transition ${t.cross ? 'cursor-pointer' : ''} ${hoverRoute === i ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center gap-2">
                <VI className="h-4 w-4 shrink-0" style={{ color: col }} />
                <span className="font-mono text-xs font-semibold text-slate-700">{t.plate}</span>
                {!t.cross && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">{t.toProv ? 'ในจังหวัด' : 'ไม่ระบุจังหวัด'}</span>}
                <span className="ml-auto font-mono text-[11px] text-slate-400">อยู่ ~{t.days} วัน</span>
              </div>
              <div className="mt-1 text-[13px]"><span className="text-slate-400">{from}</span> → <span className="font-semibold text-slate-700">{to}</span></div>
              <div className="truncate text-[11px] text-slate-400">{t.toSite} · คนขับ {t.driver} <span className="font-mono" style={{ color: col }}>{t.team}</span></div>
              {t.tel && (
                <a href={`tel:${t.tel.replace(/[^0-9+]/g, '')}`} className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-emerald-600">
                  <Phone className="h-3 w-3" /> {t.tel}
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OfficeVehPanel({ data, loading, date, onDate }: { data: OfficeVehResp | null; loading: boolean; date: string; onDate: (d: string) => void }) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800"><Truck className="h-4 w-4" /> รถพร้อมใช้งาน</h3>
        {data && !data.error && <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">{data.vehicles.length}</span>}
        <PanelDate date={date} onDate={onDate} />
      </div>
      {loading || !data ? (
        <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
      ) : data.error ? (
        <p className="py-6 text-center text-sm text-slate-400">โหลดไม่สำเร็จ</p>
      ) : (
        <>
      <p className="mb-3 text-xs text-slate-400">ไม่ติดงานภาคสนาม · พร้อมใช้งาน</p>
      {data.vehicles.length === 0 ? (
        <p className="text-xs text-slate-300">รถถูกจองครบทุกคัน</p>
      ) : (
        <div>
          {data.vehicles.map((v) => {
            const VI = vehIcon(v.type)
            return (
              <div key={v.id} className="flex items-center gap-2.5 border-t border-slate-100 py-1.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><VI className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 leading-tight">
                  <b className="font-mono text-[11.5px] text-slate-700">{v.plate}</b>
                  <span className="block truncate text-[11px] text-slate-400">{[v.name, v.type].filter(Boolean).join(' · ') || '—'}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}
