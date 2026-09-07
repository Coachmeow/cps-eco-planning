'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, Leaf } from 'lucide-react'
import Sidebar from './Sidebar'

// หน้า public/พิมพ์ (QR โลจบุ๊ค, เครื่อง CEMS ฯลฯ) — แสดงเต็มจอ ไม่มี sidebar/แถบบน
function isBare(path: string): boolean {
  return path === '/login' || path.startsWith('/m/') || path.startsWith('/a/') ||
         path.startsWith('/p/') || path.startsWith('/g/')
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // เปลี่ยนหน้า = ปิด drawer อัตโนมัติ
  useEffect(() => { setMobileOpen(false) }, [path])

  if (isBare(path)) return <main className="h-full">{children}</main>

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* แถบบนเฉพาะมือถือ — ปุ่มเปิดเมนู (desktop ซ่อน) */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100"><Leaf className="h-3.5 w-3.5 text-emerald-600" /></span>
            Eco Planning
          </span>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
