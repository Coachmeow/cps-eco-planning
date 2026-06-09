'use client'

import { useState, useEffect, useCallback } from 'react'
import BarRow from './BarRow'
import ExportButton from '@/components/ExportButton'
import type { DashboardData } from '@/lib/types'

const TEAM_COLOR: Record<string, string> = {
  ST: 'bg-slate-400', AMB: 'bg-teal-400', WP: 'bg-purple-400',
  CEMS: 'bg-orange-400', WT: 'bg-blue-400', LOG: 'bg-gray-400',
}
function utilBarColor(pct: number) { return pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-400' }
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
  const totalDemand = data?.teamWorkload.reduce((s,t)=>s+t.demand,0) ?? 0
  const totalOwnCap = data?.teamWorkload.reduce((s,t)=>s+t.ownCap,0) ?? 0
  const totalCross  = data?.teamWorkload.reduce((s,t)=>s+t.crossIn,0) ?? 0

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200">‹</button>
          <span className="min-w-[80px] text-center text-sm font-medium text-slate-700">{thaiMonths[month]} {year+543}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200">›</button>
        </div>
        {data && <span className="text-xs text-slate-400">{data.workdays} วันทำงาน</span>}
        <div className="ml-auto"><ExportButton href={`/api/export/dashboard?year=${year}&month=${month}`} label="Export PDF" /></div>
      </div>

      {loading || !data ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Util เฉลี่ยเครื่องมือ', value: `${avgUtil}%`,         sub: 'เฉพาะของบริษัท' },
              { label: 'ภาระงานรวม',            value: `${totalDemand} วัน`,  sub: 'วัน-คนทุกทีม'  },
              { label: 'กำลังคนทีมตัวเอง',      value: `${totalOwnCap} วัน`,  sub: 'primary team'  },
              { label: 'พึ่ง Cross-team',        value: `${totalCross} วัน`,   sub: 'วัน-คนข้ามทีม' },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
                <p className="text-[11px] text-slate-400">{k.sub}</p>
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

          <Card title="Cross-team Contribution (Top 10)">
            {data.crossContrib.length === 0 ? <p className="text-center text-sm text-slate-300 py-8">ไม่มีงาน cross-team</p> : (
              <div className="space-y-2.5">
                {data.crossContrib.map(c=>{
                  const max = Math.max(...data.crossContrib.map(x=>x.crossTeamDays),1)
                  return <BarRow key={c.employeeId} label={c.nickname||c.fullName.split(' ')[0]} value={c.crossTeamDays} maxValue={max} displayText={`${c.crossTeamDays} วัน`} color={TEAM_COLOR[c.primaryTeam]??'bg-slate-400'} />
                })}
              </div>
            )}
          </Card>

          <div className="col-span-full">
            <Card title="Own vs Rental">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100 text-left text-slate-400">
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
        </div>
      )}
    </div>
  )
}
