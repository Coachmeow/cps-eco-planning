'use client'

import { useState, useEffect, useCallback } from 'react'
import ExportButton from '@/components/ExportButton'
import type { DashboardData, SiteMandayRow, TeamCapacityRow } from '@/lib/types'
import CapacityRings from '@/components/dashboard/charts/CapacityRings'
import TrendComposed from '@/components/dashboard/charts/TrendComposed'
import DemandChart from '@/components/dashboard/charts/DemandChart'
import TeamStackChart from '@/components/dashboard/charts/TeamStackChart'
import HBarList from '@/components/dashboard/charts/HBarList'
import ManDaySankey from '@/components/dashboard/charts/ManDaySankey'
import PersonUtilBars from '@/components/dashboard/charts/PersonUtilBars'
import ProvinceMap from '@/components/dashboard/charts/ProvinceMap'
import { Wrench, Users, Car, CircleCheck } from 'lucide-react'
import { utilHex, siteHex } from '@/lib/chartTheme'

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-blue-400', AMB: 'bg-teal-400', WP: 'bg-purple-400',
  CEMS: 'bg-orange-400', WT: 'bg-cyan-400', LOG: 'bg-gray-400',
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

  // Util พนักงานเฉลี่ย — ฐานกำลังคนทั้งทีม (booked ÷ capacity)
  // teamCapacity ตัดทีมสนับสนุน/แอดมิน (isFieldTeam=false เช่น LOG) มาจากฝั่ง API แล้ว
  const staffCap = data?.teamCapacity ?? []
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
          {/* แผนที่กระจายงานรายจังหวัด — heatmap + รถ + พนักงาน (สะสม/วันนี้/เลือกวันที่) */}
          <div className="col-span-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              แผนที่กระจายงานรายจังหวัด <span className="font-normal text-slate-400">· ปริมาณงาน + รถ + พนักงาน</span>
            </h2>
            <ProvinceMap year={year} month={month} />
          </div>

          {/* Cross-team — เหนือกลุ่ม Sankey */}
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

          {/* Sankey man-day: ไซต์ → (คลิก) กลุ่มงาน → (คลิก) คน · ซ้าย = แผงกำลังคน (Capacity rings) */}
          {(data.sankeyRows?.length ?? 0) > 0 && (
            <div className="col-span-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                Man-day <span className="font-normal text-slate-400">· ไซต์ → กลุ่มงาน → คน</span>
              </h2>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
                <div className="lg:w-[400px] lg:shrink-0 lg:border-r lg:border-slate-100 lg:pr-6">
                  <CapacityRings rows={data.teamCapacity} />
                </div>
                <div className="min-w-0 flex-1">
                  <ManDaySankey rows={data.sankeyRows!} />
                </div>
              </div>
            </div>
          )}

          {/* KPI 4 การ์ด (3 Utilization + เครื่องมือพร้อมใช้) — ใต้กลุ่ม Sankey */}
          <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Util เฉลี่ยเครื่องมือ',  value: `${avgUtil}%`,    icon: Wrench,      color: 'text-rose-500',    tint: 'bg-rose-100'    },
              { label: 'Util พนักงานเฉลี่ย',     value: `${staffUtil}%`,  icon: Users,       color: 'text-emerald-600', tint: 'bg-emerald-100' },
              { label: 'Util รถยนต์เฉลี่ย',       value: `${vehUtil}%`,    icon: Car,         color: 'text-sky-500',     tint: 'bg-sky-100'     },
              { label: 'เครื่องมือพร้อมใช้',      value: `${equipAvail}%`, icon: CircleCheck, color: 'text-amber-500',   tint: 'bg-amber-100'   },
            ].map((k) => (
              <div key={k.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${k.tint}`}><k.icon className={`h-6 w-6 ${k.color}`} strokeWidth={2} /></span>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight text-slate-800">{k.value}</p>
                  <p className="truncate text-xs text-slate-500">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* แถว 3 กล่องขนาดเท่ากัน: ภาระงานต่อทีม · Capacity คงเหลือ · แนวโน้ม 6 เดือน */}
          <div className="col-span-full grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card title="ภาระงานต่อทีม (วัน-คน)">
              <TeamStackChart rows={data.teamWorkload} />
            </Card>

            {/* Team capacity remaining — sorted by remaining desc */}
            <Card title="Capacity คงเหลือต่อทีม (วัน-คน)">
              {/* งานรอยืนยันนับรวมอยู่ในยอด "ใช้" แล้ว (คิวถูกกันไว้จริง) — แยกโชว์ให้เห็นความเสี่ยง */}
              {(data.tentativeDays ?? 0) > 0 && (
                <p className="mb-3 rounded border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  ⏳ ในยอดนี้เป็น<b>งานรอยืนยัน {data.tentativeDays} วัน-คน</b> — ถ้าลูกค้ายกเลิกจะว่างเพิ่มเท่านี้
                </p>
              )}
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

            {/* แนวโน้ม 6 เดือน — ย้ายมาต่อขวาของ Capacity */}
            <Card title="แนวโน้ม 6 เดือน">
              <TrendComposed trend={data.trend} />
            </Card>
          </div>

          {/* Utilization รายคน (ซ้าย · เลื่อนแนวข้าง) + Man-days รายไซต์ (ขวา · คงความกว้าง เลื่อนแนวตั้ง) — สูงเท่ากัน */}
          <div className="col-span-full flex flex-col gap-5 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Utilization รายคน (%)
                <span className="font-normal text-slate-400"> · เรียงมาก→น้อย · เส้นประ = 80/100% · สีเขียว&lt;50 เหลือง 50–79 แดง≥80</span>
              </h2>
              <PersonUtilBars people={data.personUtil} />
            </div>
            {/* Man-days: ความสูงถูกกำหนดโดยกล่อง Utilization ข้างๆ (inner absolute ไม่ดันความสูง) แล้ว scroll ภายใน */}
            <div className="relative flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:w-[360px] lg:shrink-0">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Man-days รายไซต์ (วัน-คน)</h2>
              <div className="max-h-80 overflow-y-auto pr-1 lg:absolute lg:inset-x-5 lg:bottom-5 lg:top-14 lg:max-h-none">
                <HBarList valueFmt={v => `${v} วัน`}
                  items={(data.siteMandays ?? []).map((s: SiteMandayRow) => ({
                    label: s.siteCode, title: s.siteName ?? s.siteCode, value: s.manDays, hex: siteHex(s.color),
                  }))} />
              </div>
            </div>
          </div>

          <Card title="Equipment Utilization (Demand vs กำลังเครื่องซื้อ)">
            <DemandChart rows={data.equipmentUtil} />
          </Card>

          {/* Own vs Rental — ย้ายมาแทนตำแหน่งเดิมของ Man-days รายไซต์ */}
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

          {/* Utilization รถ */}
          {data.vehicleUtil && data.vehicleUtil.length > 0 && (
            <Card title="Utilization รถ (% การจอง)">
              <div className="max-h-64 overflow-y-auto pr-1">
                <HBarList unit="%" maxDomain={100}
                  items={data.vehicleUtil.map(v => ({ label: v.label, value: v.util, hex: utilHex(v.util) }))} />
              </div>
            </Card>
          )}

          {/* งานจองรอลูกค้ายืนยันที่ใกล้ถึงวันงาน — ไว้ไล่ตามก่อนถึงวันจริง */}
          {(data.tentativeSoon?.length ?? 0) > 0 && (
            <Card title={`⏳ งานรอยืนยัน ใกล้ถึงวันงาน (${data.tentativeSoon!.length} งาน ภายใน 7 วัน)`}>
              <div className="divide-y divide-slate-100">
                {data.tentativeSoon!.map((t, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700">{t.employee}</span>
                      <span className="ml-1.5 text-slate-400">{t.site}{t.days > 1 ? ` · ${t.days} วัน` : ''}</span>
                      {t.reason && <p className="mt-0.5 break-words text-[11px] text-amber-600">{t.reason}</p>}
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {new Date(t.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
