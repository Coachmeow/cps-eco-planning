'use client'

// แผนที่กระจายงานรายจังหวัด — heatmap (คน-วัน/จำนวนไซต์/หัวคน) + วงรถ + popup รายละเอียด (รูป+เบอร์)
// 3 โหมด: สะสม(เดือน) · ปัจจุบัน(วันนี้) · เลือกวันที่ — ดึงข้อมูลจาก /api/dashboard/province-map
import { useState, useEffect, useMemo, useRef } from 'react'
import { PROVINCES, MAP_W, MAP_H } from '@/lib/thailandGeo'
import { teamHex, SEQ_GREEN } from '@/lib/chartTheme'

interface Staff { id: number; nick: string; team: string; tel: string | null; days: number }
interface Veh { plate: string; name: string | null; driver: string | null; site: string | null }
interface Prov { name: string; manDays: number; head: number; sites: number; vehicles: Veh[]; staff: Staff[] }
interface Resp { scope: string; date?: string; provinces: Prov[]; unmatched: { sites: number; days: number } }

const ZERO = '#f1f5f9'
// ไล่สีจาก SEQ_GREEN ของแอป (เขียวอ่อน→เข้ม)
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

const CENT = new Map(PROVINCES.map((p) => [p.th, { cx: p.cx, cy: p.cy }]))

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ProvinceMap({ year, month }: { year: number; month: number }) {
  const [mode, setMode] = useState<'month' | 'today' | 'date'>('month')
  const [metric, setMetric] = useState<'md' | 'sites'>('md')
  const [pickDate, setPickDate] = useState(todayKey())
  const [resp, setResp] = useState<(Resp & { key: string; error?: boolean }) | null>(null)
  const [pop, setPop] = useState<{ name: string; x: number; y: number } | null>(null)
  const pinned = useRef(false)

  // key ของคำขอปัจจุบัน — ใช้เทียบว่า resp ที่มีตรงกับตัวกรองปัจจุบันหรือยัง (= สถานะ loading)
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
        setPop(null); pinned.current = false
      })
      .catch(() => {
        if (cancelled) return
        setResp({ scope: '', provinces: [], unmatched: { sites: 0, days: 0 }, key: reqKey, error: true })
      })
    return () => { cancelled = true }
  }, [reqKey, mode, pickDate, year, month])

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

  const popProv = pop ? byName.get(pop.name) : undefined

  function showPop(name: string, e: React.MouseEvent) {
    if (pinned.current) return
    setPop({ name, x: e.clientX, y: e.clientY })
  }
  function movePop(e: React.MouseEvent) {
    if (pinned.current) return
    setPop((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))
  }
  function hidePop() { if (!pinned.current) setPop(null) }

  // ตำแหน่ง popup (clamp ไม่ให้ตกขอบจอ)
  const popStyle: React.CSSProperties = pop
    ? { left: Math.min(pop.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 288), top: pop.y + 16 }
    : {}

  const legendLabel = live ? 'คนอยู่พื้นที่' : metric === 'sites' ? 'จำนวนไซต์' : 'ปริมาณงาน (คน-วัน)'

  return (
    <div>
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-400">ไปที่</label>
          <select
            onChange={(e) => {
              const name = e.target.value
              if (!name) { pinned.current = false; setPop(null); return }
              const el = document.querySelector(`[data-prov="${CSS.escape(name)}"]`) as SVGPathElement | null
              const r = el?.getBoundingClientRect()
              pinned.current = true
              setPop({ name, x: r ? r.left + r.width / 2 : 400, y: r ? r.top + r.height / 2 : 300 })
            }}
            defaultValue=""
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm"
          >
            <option value="">— เลือกจังหวัด —</option>
            {PROVINCES.map((p) => (
              <option key={p.th} value={p.th}>{p.th}</option>
            ))}
          </select>
        </div>
      </div>

      {loading || !resp ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : resp.error ? (
        <p className="py-8 text-center text-sm text-slate-300">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {/* แผนที่ (จัตุรัส) */}
          <div className="relative mx-auto w-full max-w-[440px]" style={{ aspectRatio: '1 / 1' }}>
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-full w-full" role="img" aria-label="แผนที่กระจายงานรายจังหวัด">
              <g>
                {PROVINCES.map((geo) => {
                  const p = byName.get(geo.th)
                  return (
                    <path
                      key={geo.th}
                      data-prov={geo.th}
                      d={geo.d}
                      fill={heat(valOf(p) / maxVal)}
                      stroke="#ffffff"
                      strokeWidth={0.6}
                      className="cursor-pointer transition-[fill] duration-200 hover:stroke-slate-500 hover:[stroke-width:1.4]"
                      onMouseEnter={(e) => { pinned.current = false; showPop(geo.th, e) }}
                      onMouseMove={movePop}
                      onMouseLeave={hidePop}
                    />
                  )
                })}
              </g>
              <g style={{ pointerEvents: 'none' }}>
                {resp.provinces.filter((p) => p.vehicles.length > 0).map((p) => {
                  const c = CENT.get(p.name)
                  if (!c) return null
                  const r = 6 + p.vehicles.length * 3
                  return (
                    <g key={p.name}>
                      <circle cx={c.cx} cy={c.cy} r={r} fill="#f59e0b" opacity={0.92} stroke="#fff" strokeWidth={1.5} />
                      <text x={c.cx} y={c.cy + 3.5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#7c4a03">{p.vehicles.length}</text>
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* legend */}
            <div className="absolute bottom-2 left-2 rounded-lg border border-slate-200 bg-white/90 p-2.5 text-[11px] shadow-sm backdrop-blur">
              <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">{legendLabel}</div>
              <div className="h-2 w-32 rounded" style={{ background: `linear-gradient(90deg, ${SEQ_GREEN[0]}, ${SEQ_GREEN[2]}, ${SEQ_GREEN[5]})` }} />
              <div className="mt-0.5 flex justify-between text-slate-400"><span>น้อย</span><span>สูงสุด {maxVal}</span></div>
              <div className="mt-1.5 flex items-center gap-1.5 text-slate-400">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-amber-900">2</span>
                วงส้ม = รถ{live ? 'ที่ออกงาน' : ''}
              </div>
            </div>
          </div>

          {/* คำอธิบาย + แจ้งเตือนข้อมูลไม่ตรง */}
          <div className="flex-1 space-y-3 text-sm">
            <p className="text-slate-500">
              {live
                ? 'ความเข้มสี = จำนวนคนที่อยู่พื้นที่' + (mode === 'today' ? 'วันนี้' : 'วันที่เลือก') + ' · วงส้ม = รถที่ออกงาน'
                : 'ความเข้มสี = ' + (metric === 'sites' ? 'จำนวนไซต์' : 'ปริมาณงานสะสมทั้งเดือน (คน-วัน)') + ' · วงส้ม = จำนวนรถ'}
            </p>
            <p className="text-xs text-slate-400">ชี้เมาส์ที่จังหวัดเพื่อดูรถ + พนักงาน (รูป · เบอร์โทร)</p>
            {resp.unmatched.sites > 0 && (
              <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠️ มี {resp.unmatched.sites} ไซต์ที่ระบุจังหวัดไม่ตรงมาตรฐาน (ไม่ได้แสดงบนแผนที่) — ควรแก้ชื่อจังหวัดให้เป็นค่ามาตรฐาน
              </p>
            )}
            {resp.provinces.length === 0 && (
              <p className="text-slate-400">ไม่มีงานในช่วงที่เลือก</p>
            )}
          </div>
        </div>
      )}

      {/* popup */}
      {pop && popProv && (
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl"
          style={popStyle}
        >
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-slate-700">
            {live && <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
            {pop.name}
          </div>
          <div className="mb-2 text-[11px] text-slate-400">{live ? (mode === 'today' ? 'สถานะ ณ วันนี้' : `ณ ${resp?.date ?? ''}`) : 'งานเดือนนี้'}</div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
              <b className="mr-1 text-sm text-slate-700">{live ? popProv.head : popProv.manDays}</b>{live ? 'คน' : 'คน-วัน'}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
              <b className="mr-1 text-sm text-slate-700">{popProv.sites}</b>ไซต์
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
              <b className="mr-1 text-sm text-slate-700">{popProv.vehicles.length}</b>รถ
            </span>
          </div>

          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            🚚 รถ <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{popProv.vehicles.length}</span>
          </div>
          {popProv.vehicles.length === 0 ? (
            <p className="py-0.5 text-slate-300">ไม่มีรถ</p>
          ) : (
            <div className="mb-1">
              {popProv.vehicles.slice(0, 6).map((v) => (
                <div key={v.plate} className="flex items-center gap-2 border-t border-slate-100 py-1">
                  <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700">{v.plate}</span>
                  <span className="min-w-0 leading-tight">
                    <b className="text-[11px] text-slate-600">{v.name || '—'}</b>
                    <span className="block truncate text-[10px] text-slate-400">{[v.driver, v.site].filter(Boolean).join(' · ')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mb-1 mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            👷 พนักงาน <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{popProv.staff.length}</span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {popProv.staff.slice(0, 12).map((s) => {
              const col = teamHex(s.team)
              return (
                <div key={s.id} className="flex items-center gap-2 border-t border-slate-100 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/employees/${s.id}/photo`}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                    style={{ background: col + '22' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                  />
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="text-[11.5px] text-slate-600">{s.nick}</b>
                    <span className="ml-1 font-mono text-[10px]" style={{ color: col }}>{s.team}</span>
                    {s.tel && <span className="block truncate font-mono text-[10px] text-slate-400">📞 {s.tel}</span>}
                  </span>
                  {!live && <span className="shrink-0 font-mono text-[10px] text-slate-400">{s.days} ว</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
