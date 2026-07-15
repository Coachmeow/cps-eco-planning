'use client'

// กราฟแท่งนอน (ranking) ใช้ร่วม — Recharts vertical layout + tooltip + ขอบมน + สีต่อแถว
// รายการยาวเลื่อนดูได้ (สูงตามจำนวนแถว ห่อใน container สกรอลล์ที่ฝั่งเรียกใช้)
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts'
import { ChartTooltip, axisTick, INK } from '@/lib/chartTheme'

export interface HBarItem { label: string; value: number; hex: string; title?: string }

export default function HBarList({ items, unit = '', maxDomain, refLine, rowH = 30, valueFmt }: {
  items: HBarItem[]
  unit?: string
  maxDomain?: number          // เช่น 100 สำหรับ % ; ไม่ระบุ = auto
  refLine?: number            // เส้นอ้างอิง เช่น 100%
  rowH?: number
  valueFmt?: (v: number) => string
}) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  const h = Math.max(items.length * rowH + 24, 96)
  const domainMax = maxDomain ?? Math.ceil(Math.max(...items.map(i => i.value), 1) * 1.15)
  const fmt = valueFmt ?? ((v: number) => `${v}${unit}`)

  return (
    <div style={{ width: '100%', height: h }}>
      <ResponsiveContainer>
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis type="category" dataKey="label" width={74} tick={{ ...axisTick, fill: INK }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
          {refLine != null && <ReferenceLine x={refLine} stroke="#94a3b8" strokeDasharray="4 3" />}
          <Bar dataKey="value" name="ค่า" radius={[0, 4, 4, 0]} background={{ fill: '#f1f5f9', radius: 4 }} isAnimationActive={false}>
            {items.map((it, i) => <Cell key={i} fill={it.hex} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 11, fontWeight: 600, fill: INK }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
