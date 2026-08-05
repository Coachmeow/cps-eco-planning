'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SelectOption { value: string; label: string }

/**
 * ดรอปดาวน์ที่พิมพ์ค้นหาได้ — ใช้แทน <select> เมื่อรายการยาว (เช่น ไซต์งานหลายสิบไซต์)
 * ค้นแบบ substring บน label จึงค้นได้ทั้งโค้ดและชื่อภาษาไทย
 */
export default function SearchableSelect({
  value, onChange, options, placeholder = 'เลือก...', invalid = false, className = '', disabled = false,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  invalid?: boolean
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)                       // index ที่ไฮไลต์อยู่
  const ref      = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => o.label.toLowerCase().includes(s)) : options
  }, [options, q])

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // เปิดแล้ว: โฟกัสช่องค้นหา + เลื่อนให้เห็นทั้งแผง (popup แม่เป็น overflow-y-auto จะได้ไม่โดนตัดขอบ)
  useEffect(() => {
    if (!open) { setQ(''); setHi(0); return }
    inputRef.current?.focus()
    panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  // เลื่อนรายการที่ไฮไลต์ให้อยู่ในสายตาเสมอ
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[hi] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  function pick(v: string) { onChange(v); setOpen(false) }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (filtered[hi]) pick(filtered[hi].value) }
    else if (e.key === 'Escape')    { e.preventDefault(); setOpen(false) }
  }

  const borderCls = invalid ? 'border-red-300 focus:ring-red-300' : 'border-slate-200 focus:ring-slate-300'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center justify-between rounded border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50 ${borderCls}`}>
        <span className={`truncate text-left ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="ml-2 shrink-0 text-[10px] text-slate-400">▾</span>
      </button>

      {open && (
        <div ref={panelRef} className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-1.5">
            <input ref={inputRef} type="text" value={q} onChange={e => { setQ(e.target.value); setHi(0) }}
              onKeyDown={onKeyDown} placeholder="🔍 พิมพ์เพื่อค้นหา..."
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none" />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0
              ? <p className="px-3 py-3 text-center text-xs text-slate-300">ไม่พบรายการที่ค้นหา</p>
              : filtered.map((o, i) => (
                  <button key={o.value} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                      o.value === value ? 'bg-sky-50 font-semibold text-sky-700'
                      : i === hi        ? 'bg-slate-100 text-slate-800'
                                        : 'text-slate-600'}`}>
                    {o.label}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  )
}
