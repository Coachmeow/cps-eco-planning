// ธีมกราฟกลางของ Dashboard (ใช้กับ Recharts) — สีทีม/สถานะ + สไตล์แกน/tooltip
// สีทีมใช้ชุดเดียวกับทั้งแอป (identity ต่อ entity) ; ผ่าน CVD (worst adjacent ΔE 12.7)
// LOG เป็นสีเทา → ต้องมี label/legend กำกับเสมอ (secondary encoding)

export const TEAM_HEX: Record<string, string> = {
  ST: '#3b82f6',   // blue
  AMB: '#14b8a6',  // teal
  WP: '#8b5cf6',   // violet
  CEMS: '#f97316', // orange
  WT: '#06b6d4',   // cyan
  LOG: '#94a3b8',  // slate (ต้องมี label)
}
export const teamHex = (code: string) => TEAM_HEX[code] ?? '#94a3b8'

// สีตามระดับ utilization (status ramp — ห้ามเอาไปใช้เป็น series สี)
export const utilHex = (pct: number) => (pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981')

// สีไซต์ (hex เทียบเท่า Tailwind *-400 ใน lib/siteColors.ts — identity เดียวกันทั้งแอป)
export const SITE_HEX: Record<string, string> = {
  emerald: '#34d399', sky: '#38bdf8', violet: '#a78bfa', rose: '#fb7185',
  amber: '#fbbf24', orange: '#fb923c', cyan: '#22d3ee', indigo: '#818cf8',
  pink: '#f472b6', teal: '#2dd4bf', lime: '#a3e635', red: '#f87171',
}
export const siteHex = (color: string | null | undefined) => SITE_HEX[color ?? 'emerald'] ?? SITE_HEX.emerald

// จานสีลำดับ (sequential) สำหรับ heatmap ฯลฯ — เขียวอ่อน→เข้ม
export const SEQ_GREEN = ['#e6f6ef', '#b8e6d1', '#7dd3ab', '#38b787', '#1f9d6b', '#137a52']

// โทนหมึกข้อความ/แกน (ตัวอักษรไม่ใช้สี series)
export const INK = '#334155', MUTED = '#94a3b8', GRID = '#eef2f5', SURFACE = '#ffffff'

export const axisTick = { fontSize: 11, fill: MUTED }
export const gridProps = { stroke: GRID, strokeDasharray: '0' }

// tooltip กล่องเดียวใช้ร่วม (ครอบ Recharts <Tooltip content={...}/>)
import React from 'react'
interface TT { active?: boolean; label?: React.ReactNode; payload?: { name?: string; value?: number | string; color?: string; unit?: string }[]; unit?: string }
export function ChartTooltip({ active, label, payload, unit = '' }: TT) {
  if (!active || !payload || payload.length === 0) return null
  return React.createElement('div', {
    style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(15,42,36,.12)', padding: '8px 10px', fontSize: 12 },
  }, [
    label != null && String(label) !== '' ? React.createElement('div', { key: 'l', style: { fontWeight: 700, color: INK, marginBottom: 4 } }, label) : null,
    ...payload.map((p, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6, color: INK } }, [
      React.createElement('span', { key: 'd', style: { width: 8, height: 8, borderRadius: 2, background: p.color ?? MUTED, display: 'inline-block' } }),
      React.createElement('span', { key: 't', style: { color: MUTED } }, `${p.name ?? ''}: `),
      React.createElement('b', { key: 'v' }, `${p.value}${p.unit ?? unit}`),
    ])),
  ])
}
