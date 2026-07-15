'use client'

// Equipment Utilization — Demand เทียบกำลังเครื่องซื้อ (100%) : แท่งซ้อน ส่วนเกิน 100 เป็นสีแดง
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { axisTick, INK, MUTED } from '@/lib/chartTheme'
import type { EquipmentUtilRow } from '@/lib/types'
import React from 'react'

export default function DemandChart({ rows }: { rows: EquipmentUtilRow[] }) {
  const items = rows
    .filter(r => r.ownCount > 0)
    .sort((a, b) => (b.demandUtil ?? 0) - (a.demandUtil ?? 0))
    .map(r => {
      const d = r.demandUtil ?? 0
      return { label: r.typeCode, title: r.typeName, base: Math.min(d, 100), over: Math.max(d - 100, 0), total: d }
    })
  if (items.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>

  const h = Math.max(items.length * 30 + 24, 96)
  const domainMax = Math.max(120, Math.ceil(Math.max(...items.map(i => i.total)) * 1.1))

  return (
    <>
      <div className="max-h-60 overflow-y-auto pr-1">
        <div style={{ width: '100%', height: h }}>
          <ResponsiveContainer>
            <BarChart data={items} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }} barCategoryGap="28%">
              <XAxis type="number" domain={[0, domainMax]} hide />
              <YAxis type="category" dataKey="label" width={64} tick={{ ...axisTick, fill: INK }} tickLine={false} axisLine={false} />
              <Tooltip content={<DemandTip />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
              <ReferenceLine x={100} stroke="#64748b" strokeDasharray="4 3" />
              <Bar dataKey="base" stackId="d" name="Demand" fill="#34d399" radius={[0, 0, 0, 0]} background={{ fill: '#f1f5f9', radius: 4 }} isAnimationActive={false} />
              <Bar dataKey="over" stackId="d" name="เกินกำลัง" fill="#ef4444" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" /> Demand ·
        <span className="mx-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" /> เกิน 100% = ต้องเช่าเพิ่ม · เส้นประ = กำลังเครื่องซื้อ (100%)
      </p>
    </>
  )
}

interface TipProps { active?: boolean; payload?: { payload?: { label: string; title?: string; total: number } }[] }
function DemandTip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const over = row.total > 100
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(15,42,36,.12)', padding: '8px 10px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: INK }}>{row.label}{row.title ? ` · ${row.title}` : ''}</div>
      <div style={{ color: over ? '#ef4444' : INK, fontWeight: 600 }}>Demand {row.total}%</div>
      {over && <div style={{ color: '#ef4444' }}>เกินกำลังเครื่องซื้อ {row.total - 100}% → ต้องเช่าเพิ่ม</div>}
    </div>
  )
}
