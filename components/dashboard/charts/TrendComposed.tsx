'use client'

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { TrendPoint } from '@/lib/types'
import { ChartTooltip, axisTick, GRID, MUTED } from '@/lib/chartTheme'

const thMonth = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// แนวโน้ม 6 เดือน — แท่ง=man-days (แกนซ้าย) · เส้น=util เครื่องมือ% (แกนขวา)
export default function TrendComposed({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  const data = trend.map(t => ({ m: thMonth[t.month] ?? t.month, manDays: t.manDays, util: t.eqUtil }))

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Man-days (วัน-คน)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-sky-500" /> Util เครื่องมือ %</span>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="m" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false} width={34} />
            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} width={34} unit="%" />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
            <Bar yAxisId="l" dataKey="manDays" name="Man-days" fill="#6ee7b7" radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="util" name="Util %" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: '#0ea5e9' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-right text-[10px]" style={{ color: MUTED }}>แกนซ้าย = วัน-คน · แกนขวา = %</p>
    </div>
  )
}
