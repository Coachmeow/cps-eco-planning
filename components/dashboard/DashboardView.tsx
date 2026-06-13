'use client'

import { useState, useEffect, useCallback } from 'react'
import BarRow from './BarRow'
import ExportButton from '@/components/ExportButton'
import type { DashboardData, PersonUtilRow, SiteMandayRow, TeamCapacityRow, TrendPoint } from '@/lib/types'
import { siteDotClass } from '@/lib/siteColors'

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-slate-400', AMB: 'bg-teal-400', WP: 'bg-purple-400',
  CEMS: 'bg-orange-400', WT: 'bg-blue-400', LOG: 'bg-gray-400',
}
function utilBarColor(pct: number) { return pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-400' }
const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const thaiMonthsShort = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  )
}

// แนวโน้ม 6 เดือน — แท่ง = man-days, เส้น = util เครื่องมือ % (วาด SVG เอง ไม่พึ่ง lib)
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length === 0) return <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p>
  const W = 640, H = 220, padL = 34, padR = 38, padT = 18, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = trend.length, slotW = plotW / n
  const maxMd = Math.max(...trend.map(t => t.manDays), 1)
  const cx    = (i: number) => padL + slotW * i + slotW / 2
  const yMd   = (v: number) => padT + plotH - (v / maxMd) * plotH
  const yUtil = (v: number) => padT + plotH - (Math.min(v, 100) / 100) * plotH
  const barW  = slotW * 0.46
  const linePts = trend.map((t, i) => `${cx(i)},${yUtil(t.eqUtil)}`).join(' ')
  const baseY = padT + plotH

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Man-days (วัน-คน)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-sky-500" /> Util เครื่องมือ %</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + plotH * g} y2={padT + plotH * g} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {/* bars: man-days */}
        {trend.map((t, i) => (
          <g key={i}>
            <rect x={cx(i) - barW / 2} y={yMd(t.manDays)} width={barW} height={Math.max(baseY - yMd(t.manDays), 0)} rx={2} fill="#6ee7b7" />
            {t.manDays > 0 && <text x={cx(i)} y={yMd(t.manDays) - 4} textAnchor="middle" fontSize={10} fill="#475569">{t.manDays}</text>}
          </g>
        ))}
        {/* line: util % */}
        <polyline points={linePts} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {trend.map((t, i) => (
          <g key={`p${i}`}>
            <circle cx={cx(i)} cy={yUtil(t.eqUtil)} r={3} fill="#0ea5e9" />
            <text x={cx(i)} y={yUtil(t.eqUtil) - 7} textAnchor="middle" fontSize={9} fill="#0284c7">{t.eqUtil}%</text>
          </g>
        ))}
        {/* x labels */}
        {trend.map((t, i) => (
          <text key={`l${i}`} x={cx(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">{thaiMonthsShort[t.month]}</text>
        ))}
      </svg>
    </div>
  )
}

export default function DashboardView() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data,  setData]  = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/dashboard?year=${year}&month=${month}`)
    setData(await res.json())
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])
  function prevMonth() { if (month === 1) { setYear(y=>y-1); setMonth(12) } else setMonth(m=>m-1) }
  function nextMonth() { if (month === 12) { setYear(y=>y+1); setMonth(1) } else setMonth(m=>m+1) }

  const avgUtil     = data ? Math.round(data.equipmentUtil.filter(r=>r.ownCount>0).reduce((s,r)=>s+r.ownUtil,0)/Math.max(data.equipmentUtil.filter(r=>r.ownCount>0).length,1)) : 0
  const totalDemand = data?.teamWorkload.reduce((s,t)=>s+t.demand,0) ?? 0
  const totalOwnCap = data?.teamWorkload.reduce((s,t)=>s+t.ownCap,0) ?? 0
  const totalCross  = data?.teamWorkload.reduce((s,t)=>s+t.crossIn,0) ?? 0

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
          <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year+543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
        </div>
        {data && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 shadow-sm">{data.workdays} วันทำงาน</span>}
        <div className="ml-auto"><ExportButton href={`/api/export/dashboard?year=${year}&month=${month}`} label="Export PDF" /></div>
      </div>

      {loading || !data ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Util เฉลี่ยเครื่องมือ', value: `${avgUtil}%`,        icon: '🔧', tint: 'bg-rose-100'    },
              { label: 'ภาระงานรวม',            value: `${totalDemand} วัน`, icon: '📅', tint: 'bg-sky-100'     },
              { label: 'กำลังคนทีมตัวเอง',      value: `${totalOwnCap} วัน`, icon: '👥', tint: 'bg-emerald-100' },
              { label: 'พึ่ง Cross-team',        value: `${totalCross} วัน`,  icon: '🤝', tint: 'bg-amber-100'   },
            ].map((k) => (
              <div key={k.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${k.tint} text-xl`}>{k.icon}</span>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight text-slate-800">{k.value}</p>
                  <p className="truncate text-xs text-slate-500">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          <Card title="Equipment Utilization % (ของบริษัท)">
            <div className="space-y-2.5">
              {data.equipmentUtil.filter(r=>r.ownCount>0).sort((a,b)=>b.ownUtil-a.ownUtil).map(r=>(
                <BarRow key={r.typeId} label={r.typeCode} value={r.ownUtil} displayText={`${r.ownUtil}%`} color={utilBarColor(r.ownUtil)} />
              ))}
            </div>
          </Card>

          <Card title="ภาระงานต่อทีม (วัน-คน)">
            {data.teamWorkload.length === 0 ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p> : (
              <div className="space-y-3">
                {data.teamWorkload.map(t=>{
                  const max = Math.max(...data.teamWorkload.map(x=>x.demand),1)
                  return (
                    <div key={t.teamId} className="space-y-0.5">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{t.teamCode}</span>
                        <span>{t.ownCap.toFixed(1)} own{t.crossIn>0&&<span className="ml-1 text-sky-500">+{t.crossIn.toFixed(1)}</span>} / {t.demand.toFixed(1)} วัน</span>
                      </div>
                      <div className="flex h-4 overflow-hidden rounded bg-slate-100">
                        <div className={`h-full ${TEAM_COLOR[t.teamCode]??'bg-slate-400'}`} style={{width:`${(t.ownCap/max)*100}%`}} />
                        {t.crossIn>0&&<div className="h-full bg-sky-300" style={{width:`${(t.crossIn/max)*100}%`}} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Team capacity remaining — sorted by remaining desc */}
          <Card title="Capacity คงเหลือต่อทีม (วัน-คน)">
            {data.teamCapacity.length === 0
              ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p>
              : (
              <div className="space-y-3">
                {data.teamCapacity.map((t: TeamCapacityRow) => {
                  const usedColor = t.usedPct >= 90 ? 'bg-red-400' : t.usedPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
                  const remColor  = t.remaining <= 0 ? 'text-red-500' : t.usedPct >= 70 ? 'text-amber-600' : 'text-emerald-600'
                  return (
                    <div key={t.teamId} className="space-y-0.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-medium text-slate-600">{t.teamCode} <span className="text-slate-400">· {t.headcount} คน</span></span>
                        <span className="text-slate-500">
                          ใช้ {t.booked} / {t.capacity} · เหลือ <span className={`font-semibold ${remColor}`}>{t.remaining} วัน</span>
                        </span>
                      </div>
                      <div className="flex h-4 overflow-hidden rounded bg-slate-100">
                        <div className={`h-full ${usedColor}`} style={{ width: `${Math.min(t.usedPct, 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Per-person Utilization — scrollable, sorted desc */}
          <Card title="Utilization รายคน (%)">
            {data.personUtil.length === 0
              ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p>
              : (
              <div className="h-64 overflow-y-auto space-y-1.5 pr-1">
                {data.personUtil.map((p: PersonUtilRow, i: number) => {
                  const barColor = p.utilPct >= 80 ? 'bg-red-400' : p.utilPct >= 50 ? 'bg-amber-400' : 'bg-emerald-400'
                  return (
                    <div key={p.employeeId} className="flex items-center gap-2">
                      <span className="w-4 text-right text-[10px] text-slate-300">{i+1}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TEAM_COLOR[p.primaryTeam]??'bg-slate-200 text-slate-600'}`}>{p.primaryTeam}</span>
                      <span className="w-20 truncate text-xs text-slate-600">{p.nickname||p.fullName.split(' ')[1]||p.fullName}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all`} style={{width:`${Math.min(p.utilPct,100)}%`}} />
                      </div>
                      <span className={`w-10 text-right text-xs font-semibold ${p.utilPct>=80?'text-red-500':p.utilPct>=50?'text-amber-500':'text-emerald-600'}`}>{p.utilPct}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Man-days per site — scrollable, sorted desc */}
          <Card title="Man-days รายไซต์ (วัน-คน)">
            {(!data.siteMandays || data.siteMandays.length === 0)
              ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p>
              : (
              <div className="h-64 overflow-y-auto space-y-1.5 pr-1">
                {data.siteMandays.map((s: SiteMandayRow, i: number) => {
                  const max = Math.max(...data.siteMandays.map(x => x.manDays), 1)
                  return (
                    <div key={s.siteId} className="flex items-center gap-2">
                      <span className="w-4 text-right text-[10px] text-slate-300">{i+1}</span>
                      <span className="w-20 truncate text-xs font-medium text-slate-700" title={s.siteName}>{s.siteCode}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${siteDotClass(s.color)} rounded-full transition-all`} style={{width:`${(s.manDays/max)*100}%`}} />
                      </div>
                      <span className="w-12 text-right text-xs font-semibold text-slate-700">{s.manDays} วัน</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* แนวโน้ม 6 เดือน — card ปกติ อยู่กลุ่ม util/man-day */}
          <Card title="แนวโน้ม 6 เดือน">
            <TrendChart trend={data.trend} />
          </Card>

          {/* Cross-team compact */}
          {data.crossContrib.length > 0 && (
            <div className="col-span-full rounded-lg border border-slate-200 bg-white px-5 py-3 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cross-team Contribution</h3>
              <div className="flex flex-wrap gap-2">
                {data.crossContrib.map(c => (
                  <div key={c.employeeId} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs">
                    <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${TEAM_COLOR[c.primaryTeam]??'bg-slate-200 text-slate-600'}`}>{c.primaryTeam}</span>
                    <span className="text-slate-600">{c.nickname||c.fullName.split(' ')[1]||c.fullName}</span>
                    <span className="font-semibold text-sky-600">{c.crossTeamDays}d</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card title="Own vs Rental">
            <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-slate-400">
                    <th className="py-2 pr-4 font-medium">ประเภท</th>
                    <th className="py-2 pr-4 text-right font-medium">Own</th>
                    <th className="py-2 pr-4 text-right font-medium">Util (Own)</th>
                    <th className="py-2 pr-4 text-right font-medium">เช่า</th>
                    <th className="py-2 text-right font-medium">Util (เช่า)</th>
                  </tr></thead>
                  <tbody>
                    {data.equipmentUtil.map(r=>(
                      <tr key={r.typeId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-medium text-slate-700">{r.typeCode}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{r.ownCount>0?`${r.ownCount} เครื่อง`:'—'}</td>
                        <td className={`py-2 pr-4 text-right font-semibold ${r.ownUtil>=80?'text-red-500':r.ownUtil>=50?'text-amber-500':'text-emerald-600'}`}>{r.ownCount>0?`${r.ownUtil}%`:'—'}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{r.rentalCount>0?`${r.rentalCount} เครื่อง`:'—'}</td>
                        <td className="py-2 text-right font-semibold text-amber-500">{r.rentalCount>0?`${r.rentalUtil}%`:'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
