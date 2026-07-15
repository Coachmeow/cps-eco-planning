'use client'

// ภาระงานต่อทีม — แท่งซ้อน: กำลังทีมเอง (สีทีม) + แรงเสริมข้ามทีม (ฟ้า) เทียบ demand
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { teamHex, axisTick, INK, MUTED } from '@/lib/chartTheme'
import type { TeamWorkloadRow } from '@/lib/types'
import React from 'react'

export default function TeamStackChart({ rows }: { rows: TeamWorkloadRow[] }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีข้อมูล</p>
  const items = rows.map(t => ({ label: t.teamCode, own: t.ownCap, cross: t.crossIn, demand: t.demand }))
  const h = Math.max(items.length * 34 + 24, 96)

  return (
    <>
      <div style={{ width: '100%', height: h }}>
        <ResponsiveContainer>
          <BarChart data={items} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 0 }} barCategoryGap="30%">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={56} tick={{ ...axisTick, fill: INK }} tickLine={false} axisLine={false} />
            <Tooltip content={<WorkTip />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
            <Bar dataKey="own" stackId="w" name="ทีมเอง" radius={[0, 0, 0, 0]} background={{ fill: '#f1f5f9', radius: 4 }} isAnimationActive={false}>
              {items.map((it, i) => <Cell key={i} fill={teamHex(it.label)} />)}
            </Bar>
            <Bar dataKey="cross" stackId="w" name="แรงเสริมข้ามทีม" fill="#7dd3fc" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
        แท่งสีทีม = กำลังทีมเอง · <span className="mx-1 inline-block h-2 w-2 rounded-full bg-sky-300 align-middle" /> แรงเสริมข้ามทีม · hover ดู demand
      </p>
    </>
  )
}

interface TipProps { active?: boolean; payload?: { payload?: { label: string; own: number; cross: number; demand: number } }[] }
function WorkTip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const total = row.own + row.cross
  const short = row.demand - total
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(15,42,36,.12)', padding: '8px 10px', fontSize: 12, color: INK }}>
      <div style={{ fontWeight: 700 }}>{row.label}</div>
      <div>ทีมเอง <b>{row.own.toFixed(1)}</b> · เสริม <b>{row.cross.toFixed(1)}</b> วัน-คน</div>
      <div>Demand <b>{row.demand.toFixed(1)}</b> วัน-คน{short > 0 ? <span style={{ color: '#ef4444' }}> · ขาด {short.toFixed(1)}</span> : null}</div>
    </div>
  )
}
