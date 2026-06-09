'use client'

import { useState } from 'react'

interface Props { href: string; label: string }

export default function ExportButton({ href, label }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res  = await fetch(href)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename="(.+)"/)?.[1] ?? 'export'
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } finally { setLoading(false) }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded border border-slate-200 bg-white
        px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm
        hover:bg-slate-50 disabled:opacity-50 transition-colors"
    >
      {loading ? <span className="animate-spin">⟳</span> : <span>↓</span>}
      {loading ? 'กำลัง export...' : label}
    </button>
  )
}
