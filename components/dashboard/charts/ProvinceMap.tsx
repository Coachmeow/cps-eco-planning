'use client'

// แผนที่กระจายงานรายจังหวัด — heatmap (คน-วัน/จำนวนไซต์/หัวคน) + กล่องรายละเอียดถาวรข้างแผนที่
//  hover จังหวัด = พรีวิว · คลิก = ปักหมุดค้าง (เลือก/ก็อปเบอร์ได้) · ไม่ชี้เลย = โชว์สภาพอากาศเสี่ยง 3 วัน
//  โหมด: สะสม(เดือน) · ปัจจุบัน(วันนี้) · เลือกวันที่ — งานจาก /api/dashboard/province-map · อากาศจาก /api/dashboard/weather
import { useState, useEffect, useMemo } from 'react'
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
const wxIcon = (kind: string) => (kind === 'rain' ? '🌧️' : kind === 'heat' ? '🌡️' : '☀️')

export default function ProvinceMap({ year, month }: { year: number; month: number }) {
  const [mode, setMode] = useState<'month' | 'today' | 'date'>('month')
  const [metric, setMetric] = useState<'md' | 'sites'>('md')
  const [pickDate, setPickDate] = useState(todayKey())
  const [resp, setResp] = useState<(Resp & { key: string; error?: boolean }) | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pinnedName, setPinnedName] = useState<string | null>(null)
  const [wx, setWx] = useState<Wx | null>(null)
  const [office, setOffice] = useState<OfficeResp | null>(null)

  // วันที่สำหรับ "อยู่ออฟฟิศ" = วันที่เลือก (โหมด date) มิฉะนั้นวันนี้
  const officeDate = mode === 'date' ? pickDate : todayKey()

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

  // พนักงานอยู่ออฟฟิศ — ตามวันที่ officeDate
  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/office-staff?date=${officeDate}`)
      .then((r) => r.json())
      .then((d: OfficeResp) => { if (!cancelled) setOffice(d) })
      .catch(() => { if (!cancelled) setOffice({ date: officeDate, office: [], onLeave: 0, field: 0, error: true }) })
    return () => { cancelled = true }
  }, [officeDate])

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

  function togglePin(name: string) { setPinnedName((cur) => (cur === name ? null : name)) }

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
          <label className="text-xs text-slate-400">ปักหมุด</label>
          <select
            value={pinnedName ?? ''}
            onChange={(e) => setPinnedName(e.target.value || null)}
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* ซ้าย: แผนที่ + legend + คำอธิบาย */}
          <div className="lg:w-[380px] lg:shrink-0">
            <div className="relative mx-auto w-full max-w-[380px]" style={{ aspectRatio: '1 / 1' }}>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-full w-full" role="img" aria-label="แผนที่กระจายงานรายจังหวัด">
                {PROVINCES.map((geo) => {
                  const p = byName.get(geo.th)
                  const isPinned = geo.th === pinnedName
                  return (
                    <path
                      key={geo.th}
                      data-prov={geo.th}
                      d={geo.d}
                      fill={heat(valOf(p) / maxVal)}
                      stroke={isPinned ? '#059669' : '#ffffff'}
                      strokeWidth={isPinned ? 2 : 0.6}
                      className="cursor-pointer transition-[fill] duration-200 hover:stroke-slate-500 hover:[stroke-width:1.4]"
                      onMouseEnter={() => setHover(geo.th)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => togglePin(geo.th)}
                    />
                  )
                })}
              </svg>
              <div className="absolute bottom-2 left-2 rounded-lg border border-slate-200 bg-white/90 p-2.5 text-[11px] shadow-sm backdrop-blur">
                <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">{legendLabel}</div>
                <div className="h-2 w-32 rounded" style={{ background: `linear-gradient(90deg, ${SEQ_GREEN[0]}, ${SEQ_GREEN[2]}, ${SEQ_GREEN[5]})` }} />
                <div className="mt-0.5 flex justify-between text-slate-400"><span>น้อย</span><span>สูงสุด {maxVal}</span></div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {live
                ? 'ความเข้มสี = จำนวนคนที่อยู่พื้นที่' + (mode === 'today' ? 'วันนี้' : 'วันที่เลือก') + ' · ชี้จังหวัด=ดู · คลิก=ปักหมุด'
                : 'ความเข้มสี = ' + (metric === 'sites' ? 'จำนวนไซต์' : 'คน-วันสะสมทั้งเดือน') + ' · ชี้จังหวัด=ดู · คลิก=ปักหมุด'}
            </p>
            {resp.unmatched.sites > 0 && (
              <p className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠️ มี {resp.unmatched.sites} ไซต์ที่ระบุจังหวัดไม่ตรงมาตรฐาน (ไม่ได้แสดงบนแผนที่)
              </p>
            )}
          </div>

          {/* กลาง: กล่องถาวร — จังหวัดที่ชี้/ปักหมุด หรือ สภาพอากาศเสี่ยง (สูงเท่าแผนที่ · เลื่อนในกล่อง) */}
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4 lg:h-[380px]">
            {shown ? (
              <ProvincePanel prov={shown} live={live} mode={mode} date={resp.date} isPinned={shownName === pinnedName} onUnpin={() => setPinnedName(null)} />
            ) : (
              <WeatherPanel wx={wx} />
            )}
          </div>

          {/* ขวา: พนักงานอยู่ออฟฟิศ (ไม่มีแผนออกภาคสนามวันนั้น) */}
          <div className="overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4 lg:h-[380px] lg:w-[250px] lg:shrink-0">
            <OfficePanel office={office} loading={!office || office.date !== officeDate} dateLabel={mode === 'date' ? officeDate : 'วันนี้'} />
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
          <button onClick={onUnpin} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100">
            📌 ปักหมุด · คลิกเพื่อปลด
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
        🚚 รถในพื้นที่ <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{prov.vehicles.length}</span>
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
        👷 พนักงาน <span className="rounded-full bg-emerald-50 px-1.5 text-emerald-600">{prov.staff.length}</span>
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
      <span className="text-2xl">🌤️</span>
      <span>ไม่มีงานล่วงหน้า 3 วัน</span>
      <span className="text-xs text-slate-300">ชี้จังหวัดบนแผนที่เพื่อดูรถ + พนักงาน</span>
    </div>
  )
  return (
    <div className="text-sm">
      <h3 className="text-base font-bold text-slate-800">🌦️ สภาพอากาศเสี่ยง</h3>
      <p className="mb-3 text-xs text-slate-400">จังหวัดที่มีงานล่วงหน้า 3 วัน · 🌧️ เสี่ยงฝน · 🌡️ ร้อนจัด (ชี้จังหวัดบนแผนที่เพื่อดูรายละเอียดงาน)</p>
      <div className="space-y-2">
        {wx.provinces.map((p) => (
          <div key={p.name} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="mb-1.5 text-sm font-semibold text-slate-700">{p.name}</div>
            <div className="flex gap-1.5">
              {p.daily.map((d) => (
                <div key={d.date} className={`flex-1 rounded-md border px-1.5 py-1 text-center ${WX_CLS[d.level]}`}>
                  <div className="text-[10px] opacity-70">{d.date === tk ? 'วันนี้' : `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`}</div>
                  <div className="text-base leading-tight">{wxIcon(d.kind)}</div>
                  <div className="font-mono text-[10px] tabular-nums">💧{d.rainProb}%</div>
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

function OfficePanel({ office, loading, dateLabel }: { office: OfficeResp | null; loading: boolean; dateLabel: string }) {
  if (loading || !office) return <div className="flex h-full items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
  if (office.error) return <div className="flex h-full items-center justify-center text-sm text-slate-400">โหลดไม่สำเร็จ</div>
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-bold text-slate-800">🏢 อยู่ออฟฟิศ</h3>
        <span className="rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">{office.office.length}</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">ไม่มีแผนออกภาคสนาม · {dateLabel}{office.onLeave > 0 ? ` · ลา ${office.onLeave} คน` : ''}</p>
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
                      📞 {s.tel}
                    </a>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
