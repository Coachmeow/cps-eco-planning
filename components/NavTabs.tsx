'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

function countAlerts(employees: { siteAccess: { expiryDate: string }[] }[]): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return employees.reduce((sum, emp) => {
    return sum + emp.siteAccess.filter((a) => {
      const diff = Math.floor((new Date(a.expiryDate).getTime() - today.getTime()) / 86400000)
      return diff < 30
    }).length
  }, 0)
}

export default function NavTabs() {
  const path    = usePathname()
  const [alerts, setAlerts] = useState(0)

  useEffect(() => {
    fetch('/api/access-expiry')
      .then((r) => r.json())
      .then((data) => setAlerts(countAlerts(data)))
      .catch(() => {})
  }, [])

  const tabs = [
    { href: '/staff',     label: 'แผนพนักงาน', badge: 0      },
    { href: '/equipment', label: 'เครื่องมือ',  badge: 0      },
    { href: '/dashboard', label: 'Dashboard',   badge: 0      },
    { href: '/access',    label: 'Access',       badge: alerts },
  ]

  return (
    <nav className="flex items-center border-b border-slate-200 bg-white px-6 h-[45px]">
      <span className="mr-6 text-xs font-bold text-slate-400 tracking-widest">CPS ECO</span>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors
            ${path.startsWith(t.href)
              ? 'border-slate-700 text-slate-800'
              : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          {t.label}
          {t.badge > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
