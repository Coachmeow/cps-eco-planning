'use client'

// Shared UI ของโมดูล CEMS — มิเรอร์สไตล์จาก AdminView (Btn/Input/Modal/CustomSelect)
import { useEffect, useRef, useState } from 'react'

export function Btn({ children, onClick, variant = 'default', small }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'danger' | 'ghost'; small?: boolean
}) {
  const base = `rounded font-medium transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'}`
  const cls = variant === 'danger' ? `${base} text-red-500 hover:bg-red-50`
            : variant === 'ghost'  ? `${base} text-slate-500 hover:bg-slate-100`
            : `${base} bg-slate-700 text-white hover:bg-slate-800`
  return <button onClick={onClick} className={cls}>{children}</button>
}

export function Input({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300" />
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className={`flex max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex-col rounded-xl bg-white shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function CustomSelect({ value, onChange, options, placeholder, className }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])
  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none">
        <span className={selected ? '' : 'text-slate-300'}>{selected?.label ?? placeholder ?? 'เลือก...'}</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${o.value === value ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ย่อรูปด้วย canvas → JPEG ~256px คืน data URL
export async function resizeImage(file: File, max = 256, quality = 0.8): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result)); r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i); i.onerror = rej
    i.src = dataUrl
  })
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

// ── Labels ─────────────────────────────────────────────
export const OWNERSHIP_LABEL: Record<string, string> = {
  POOL_OWN: 'Pool · ซื้อเอง', POOL_LEGACY: 'Pool · ของเก่า', CUSTOMER: 'ของลูกค้า',
}
export const OWNERSHIP_CHIP: Record<string, string> = {
  POOL_OWN: 'bg-emerald-100 text-emerald-700', POOL_LEGACY: 'bg-amber-100 text-amber-700', CUSTOMER: 'bg-sky-100 text-sky-700',
}
export const AN_STATUS_LABEL: Record<string, string> = {
  READY: 'พร้อมใช้', IN_USE: 'ใช้งานอยู่', REPAIR: 'ส่งซ่อม', RETIRED: 'ปลดระวาง',
}
export const AN_STATUS_CHIP: Record<string, string> = {
  READY: 'bg-emerald-100 text-emerald-700', IN_USE: 'bg-sky-100 text-sky-700',
  REPAIR: 'bg-red-100 text-red-600', RETIRED: 'bg-slate-200 text-slate-500',
}
export const EVENT_META: Record<string, { label: string; icon: string; chip: string }> = {
  REPAIR: { label: 'ส่งซ่อม',   icon: '🔧', chip: 'bg-red-100 text-red-600' },
  RETURN: { label: 'รับคืน',    icon: '✅', chip: 'bg-emerald-100 text-emerald-700' },
  MOVE:   { label: 'ย้ายที่',   icon: '🚚', chip: 'bg-amber-100 text-amber-700' },
  PM:     { label: 'เข้า PM',   icon: '🛠', chip: 'bg-sky-100 text-sky-700' },
  ISSUE:  { label: 'แจ้งอาการ', icon: '⚠️', chip: 'bg-orange-100 text-orange-700' },
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'

// อายุใช้งานจากวันรับเข้า เช่น "2 ปี 3 เดือน"
export function ageText(received: string | null | undefined): string {
  if (!received) return '—'
  const start = new Date(received), now = new Date()
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (months < 0) months = 0
  const y = Math.floor(months / 12), m = months % 12
  return y > 0 ? `${y} ปี${m > 0 ? ` ${m} เดือน` : ''}` : `${m} เดือน`
}
