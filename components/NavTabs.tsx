'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ROLE_LABEL, type UserRole } from '@/lib/roles'

interface Me { uid: number; role: UserRole; username: string; name: string }

const TABS: { href: string; label: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Dashboard',    roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { href: '/staff',     label: 'แผนพนักงาน',  roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { href: '/equipment', label: 'เครื่องมือ',   roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { href: '/access',    label: 'Access',        roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { href: '/admin',     label: '⚙ จัดการ',     roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
]

function countAlerts(employees: { siteAccess: { expiryDate: string }[] }[]): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return employees.reduce((sum, emp) =>
    sum + emp.siteAccess.filter((a) => {
      const diff = Math.floor((new Date(a.expiryDate).getTime() - today.getTime()) / 86400000)
      return diff < 30
    }).length, 0)
}

export default function NavTabs() {
  const path = usePathname()
  const [me,     setMe]     = useState<Me | null>(null)
  const [alerts, setAlerts] = useState(0)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user)).catch(() => {})
    fetch('/api/access-expiry').then((r) => r.json())
      .then((data) => Array.isArray(data) && setAlerts(countAlerts(data))).catch(() => {})
  }, [])

  // ไม่แสดง nav บนหน้า login
  if (path === '/login') return null

  const role = me?.role
  const tabs = TABS.filter((t) => !role || t.roles.includes(role))

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

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
          {t.href === '/access' && alerts > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {alerts}
            </span>
          )}
        </Link>
      ))}

      {/* user + logout */}
      <div className="ml-auto flex items-center gap-3">
        {me && (
          <div className="text-right leading-tight">
            <p className="text-xs font-medium text-slate-700">{me.name}</p>
            <p className="text-[10px] text-slate-400">{ROLE_LABEL[me.role]}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
    </nav>
  )
}
