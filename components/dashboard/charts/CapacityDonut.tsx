'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { TeamCapacityRow } from '@/lib/types'
import { teamHex, ChartTooltip, INK, MUTED } from '@/lib/chartTheme'

// สัดส่วนกำลังคน (capacity) ต่อทีม — part-to-whole (donut) + legend มีค่า/label กำกับ
export default function CapacityDonut({ rows }: { rows: TeamCapacityRow[] }) {
  const data = rows.filter(r => r.capacity > 0).map(r => ({ name: r.teamCode, value: r.capacity, headcount: r.headcount }))
  const total = data.reduce((s, d) => s + d.value, 0)
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82}
              paddingAngle={2} cornerRadius={4} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map(d => <Cell key={d.name} fill={teamHex(d.name)} />)}
            </Pie>
            <Tooltip content={<ChartTooltip unit=" วัน-คน" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color: INK }}>{total.toLocaleString()}</span>
          <span className="text-[11px]" style={{ color: MUTED }}>รวม วัน-คน</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.sort((a, b) => b.value - a.value).map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: teamHex(d.name) }} />
            <span className="w-10 shrink-0 font-medium text-slate-600">{d.name}</span>
            <span className="text-slate-400">{d.headcount} คน</span>
            <span className="ml-auto font-semibold text-slate-700">{d.value.toLocaleString()}</span>
            <span className="w-9 shrink-0 text-right text-slate-400">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
