'use client'

import { useState, useEffect, useCallback } from 'react'
import ExportButton from '@/components/ExportButton'
import type { DashboardData, PersonUtilRow, SiteMandayRow, TeamCapacityRow } from '@/lib/types'
import { siteDotClass } from '@/lib/siteColors'
import CapacityDonut from '@/components/dashboard/charts/CapacityDonut'
import TrendComposed from '@/components/dashboard/charts/TrendComposed'

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-blue-400', AMB: 'bg-teal-400', WP: 'bg-purple-400',
  CEMS: 'bg-orange-400', WT: 'bg-cyan-400', LOG: 'bg-gray-400',
}
const TEAM_COLOR_CHIP: Record<string, string> = {
  ST: 'bg-blue-100 text-blue-700', AMB: 'bg-teal-100 text-teal-700', WP: 'bg-purple-100 text-purple-700',
  CEMS: 'bg-orange-100 text-orange-700', WT: 'bg-cyan-100 text-cyan-700', LOG: 'bg-gray-100 text-gray-600',
}
function utilBarColor(pct: number) { return pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-400' }
function utilTextColor(pct: number) { return pct >= 80 ? 'text-red-500' : pct >= 50 ? 'text-amber-500' : 'text-emerald-600' }

// แถวสถิติมาตรฐานเดียว ใช้ร่วมทุกการ์ด (แท่ง/ฟอนต์/ความกว้างเท่ากันหมด)
function StatRow({ rank, badge, label, title, fillColor, pct, value, valueColor }: {
  rank?: number; badge?: React.ReactNode; label: string; title?: string
  fillColor: string; pct: number; value: string; valueColor?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {rank != null && <span className="w-4 shrink-0 text-right text-[10px] text-slate-300">{rank}</span>}
      {badge}
      <span className="w-16 shrink-0 truncate text-xs text-slate-600" title={title ?? label}>{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${fillColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`w-14 shrink-0 text-right text-xs font-semibold ${valueColor ?? 'text-slate-700'}`}>{value}</span>
    </div>
  )
}

function TeamBadge({ code }: { code: string }) {
  return <span className={`w-9 shrink-0 rounded text-center text-[10px] font-semibold leading-5 ${TEAM_COLOR_CHIP[code] ?? 'bg-slate-200 text-slate-600'}`}>{code}</span>
}
const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
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

  // Util พนักงานเฉลี่ย — ฐานกำลังคนทั้งทีม (booked ÷ capacity) ของ ST/AMB/WP/WT/CEMS
  const STAFF_UTIL_TEAMS = ['ST', 'AMB', 'WP', 'WT', 'CEMS']
  const staffCap = data?.teamCapacity.filter(t => STAFF_UTIL_TEAMS.includes(t.teamCode)) ?? []
  const staffCapTotal = staffCap.reduce((s,t)=>s+t.capacity,0)
  const staffBookedTotal = staffCap.reduce((s,t)=>s+t.booked,0)
  const staffUtil = staffCapTotal > 0 ? Math.round((staffBookedTotal/staffCapTotal)*100) : 0

  // Util รถยนต์เฉลี่ย — เฉลี่ย % การจองต่อคัน
  const vehUtil = data?.vehicleUtil && data.vehicleUtil.length > 0
    ? Math.round(data.vehicleUtil.reduce((s,v)=>s+v.util,0)/data.vehicleUtil.length) : 0

  // % เครื่องมือพร้อมใช้
  const equipAvail = data?.equipmentAvail?.pct ?? 0

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
              { label: 'Util เฉลี่ยเครื่องมือ',  value: `${avgUtil}%`,    icon: '🔧', tint: 'bg-rose-100'    },
              { label: 'Util พนักงานเฉลี่ย',     value: `${staffUtil}%`,  icon: '👥', tint: 'bg-emerald-100' },
              { label: 'Util รถยนต์เฉลี่ย',       value: `${vehUtil}%`,    icon: '🚗', tint: 'bg-sky-100'     },
              { label: 'เครื่องมือพร้อมใช้',      value: `${equipAvail}%`, icon: '✅', tint: 'bg-amber-100'   },
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

          {data.alerts && (data.alerts.calOverdue + data.alerts.calSoon + data.alerts.repairOverdue + (data.alerts.mileageMismatch ?? 0)) > 0 && (
            <div className="col-span-full flex flex-wrap gap-2">
              {data.alerts.calOverdue > 0 && (
                <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">📐 Cal เกินกำหนด {data.alerts.calOverdue} เครื่อง</span>
              )}
              {data.alerts.calSoon > 0 && (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600">📐 Cal ใกล้ครบ (30 วัน) {data.alerts.calSoon} เครื่อง</span>
              )}
              {data.alerts.repairOverdue > 0 && (
                <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">🔧 ส่งซ่อม/Cal เกินกำหนดรับกลับ {data.alerts.repairOverdue} เครื่อง</span>
              )}
              {data.alerts.stillOut > 0 && (
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">กำลังส่งซ่อม/Cal รวม {data.alerts.stillOut} เครื่อง</span>
              )}
              {(data.alerts.mileageMismatch ?? 0) > 0 && (
                <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">🚗 ไมล์รถไม่ตรง {data.alerts.mileageMismatch} รายการ</span>
              )}
            </div>
          )}

          <Card title="Equipment Utilization (Demand vs กำลังเครื่องซื้อ)">
            {(() => {
              const rows = data.equipmentUtil.filter(r => r.ownCount > 0).sort((a, b) => (b.demandUtil ?? 0) - (a.demandUtil ?? 0))
              const scaleMax = Math.max(100, ...rows.map(r => r.demandUtil ?? 0))
              const markerLeft = (100 / scaleMax) * 100
              return (
                <>
                  <div className="h-60 space-y-2 overflow-y-auto pr-1">
                    {rows.map(r => {
                      const d = r.demandUtil ?? 0
                      const over = d > 100
                      return (
                        <div key={r.typeId} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 truncate text-xs text-slate-600" title={r.typeName}>{r.typeCode}</span>
                          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="flex h-full w-full">
                              <div className="h-full bg-emerald-400" style={{ width: `${(Math.min(d, 100) / scaleMax) * 100}%` }} />
                              {over && <div className="h-full bg-red-500" style={{ width: `${((d - 100) / scaleMax) * 100}%` }} />}
                            </div>
                            <div className="absolute inset-y-0 w-px bg-slate-400/60" style={{ left: `${markerLeft}%` }} />
                          </div>
                          <span className={`w-14 shrink-0 text-right text-xs font-semibold ${over ? 'text-red-500' : 'text-slate-700'}`}>{d}%</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" /> กำลังเครื่องซื้อ ·{' '}
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500 align-middle" /> เกิน 100% = ต้องเช่าเพิ่ม
                  </p>
                </>
              )
            })()}
          </Card>

          <Card title="ภาระงานต่อทีม (วัน-คน)">
            {data.teamWorkload.length === 0 ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p> : (
              <div className="space-y-3">
                {data.teamWorkload.map(t=>{
                  const max = Math.max(...data.teamWorkload.map(x=>x.demand),1)
                  return (
                    <div key={t.teamId} className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{t.teamCode}</span>
                        <span>{t.ownCap.toFixed(1)} own{t.crossIn>0&&<span className="ml-1 text-sky-500">+{t.crossIn.toFixed(1)}</span>} / {t.demand.toFixed(1)} วัน</span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
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
                    <div key={t.teamId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-600">{t.teamCode} <span className="text-slate-400">· {t.headcount} คน</span></span>
                        <span className="text-slate-500">
                          ใช้ {t.booked} / {t.capacity} · เหลือ <span className={`font-semibold ${remColor}`}>{t.remaining} วัน</span>
                        </span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
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
              <div className="h-64 overflow-y-auto space-y-2 pr-1">
                {data.personUtil.map((p: PersonUtilRow, i: number) => (
                  <StatRow key={p.employeeId} rank={i+1} badge={<TeamBadge code={p.primaryTeam} />}
                    label={p.nickname || p.fullName.split(' ')[1] || p.fullName}
                    pct={p.utilPct} value={`${p.utilPct}%`}
                    fillColor={utilBarColor(p.utilPct)} valueColor={utilTextColor(p.utilPct)} />
                ))}
              </div>
            )}
          </Card>

          {/* Man-days per site — scrollable, sorted desc */}
          <Card title="Man-days รายไซต์ (วัน-คน)">
            {(!data.siteMandays || data.siteMandays.length === 0)
              ? <p className="text-center text-sm text-slate-300 py-8">ยังไม่มีข้อมูล</p>
              : (
              <div className="h-64 overflow-y-auto space-y-2 pr-1">
                {data.siteMandays.map((s: SiteMandayRow, i: number) => {
                  const max = Math.max(...data.siteMandays.map(x => x.manDays), 1)
                  return (
                    <StatRow key={s.siteId} rank={i+1} label={s.siteCode} title={s.siteName}
                      pct={(s.manDays / max) * 100} value={`${s.manDays} วัน`} fillColor={siteDotClass(s.color)} />
                  )
                })}
              </div>
            )}
          </Card>

          {/* Utilization รถ */}
          {data.vehicleUtil && data.vehicleUtil.length > 0 && (
            <Card title="Utilization รถ (% การจอง)">
              <div className="h-64 space-y-2 overflow-y-auto pr-1">
                {data.vehicleUtil.map(v => (
                  <StatRow key={v.vehicleId} label={v.label} pct={v.util} value={`${v.util}%`}
                    fillColor={utilBarColor(v.util)} valueColor={utilTextColor(v.util)} />
                ))}
              </div>
            </Card>
          )}

          <Card title="สัดส่วนกำลังคนต่อทีม (Capacity)">
            <CapacityDonut rows={data.teamCapacity} />
          </Card>

          {/* แนวโน้ม 6 เดือน — card ปกติ อยู่กลุ่ม util/man-day */}
          <Card title="แนวโน้ม 6 เดือน">
            <TrendComposed trend={data.trend} />
          </Card>

          <Card title="Own vs Rental">
            <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-100 text-left text-slate-400">
                    <th className="py-2 pr-4 font-medium">ประเภท</th>
                    <th className="py-2 pr-4 text-right font-medium">Own</th>
                    <th className="py-2 pr-4 text-right font-medium">Own Load</th>
                    <th className="py-2 pr-4 text-right font-medium">เช่า</th>
                    <th className="py-2 pr-4 text-right font-medium">Util (เช่า)</th>
                    <th className="py-2 text-right font-medium">Demand</th>
                  </tr></thead>
                  <tbody>
                    {data.equipmentUtil.map(r=>(
                      <tr key={r.typeId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-medium text-slate-700">{r.typeCode}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{r.ownCount>0?`${r.ownCount} เครื่อง`:'—'}</td>
                        <td className={`py-2 pr-4 text-right font-semibold ${r.ownUtil>=80?'text-red-500':r.ownUtil>=50?'text-amber-500':'text-emerald-600'}`}>{r.ownCount>0?`${r.ownUtil}%`:'—'}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{r.rentalCount>0?`${r.rentalCount} เครื่อง`:'—'}</td>
                        <td className="py-2 pr-4 text-right font-semibold text-amber-500">{r.rentalCount>0?`${r.rentalUtil}%`:'—'}</td>
                        <td className={`py-2 text-right font-semibold ${r.demandUtil==null?'text-slate-300':r.demandUtil>100?'text-red-500':'text-slate-600'}`}>{r.demandUtil==null?'เช่าล้วน':`${r.demandUtil}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </Card>

          {/* Cross-team compact — ล่างสุด */}
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
        </div>
      )}
    </div>
  )
}
