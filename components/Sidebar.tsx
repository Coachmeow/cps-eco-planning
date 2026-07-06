'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ROLE_LABEL, type UserRole } from '@/lib/roles'

interface Me { uid: number; role: UserRole; username: string; name: string; cemsAccess?: boolean }

interface NavItem { href: string; label: string; icon: string; roles: UserRole[] }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'ภาพรวม',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
    ],
  },
  {
    title: 'วางแผน',
    items: [
      { href: '/staff',     label: 'แผนพนักงาน', icon: '👤', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
      { href: '/equipment', label: 'แผนเครื่องมือ', icon: '🔧', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
      { href: '/vehicles',  label: 'แผนใช้รถ',    icon: '🚗', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
    ],
  },
  {
    title: 'บริการ',
    items: [
      // เมนู CEMS กรองด้วย cemsAccess เพิ่มเติมใน component (ไม่ใช่แค่ role)
      { href: '/cems', label: 'CEMS Service', icon: '🖥', roles: ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL'] },
    ],
  },
  {
    title: 'ตั้งค่า',
    items: [
      { href: '/admin', label: 'จัดการข้อมูล', icon: '⚙️', roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
    ],
  },
]

const thaiDays   = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// นาฬิกาเวลาไทย (Asia/Bangkok) อัปเดตทุกวินาที
function ThaiClock({ collapsed }: { collapsed: boolean }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!now) return null

  // แปลงเป็นเวลาไทยเสมอ ไม่ว่าเครื่องผู้ใช้จะตั้ง timezone อะไร
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', weekday: 'short', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const wdIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  const day   = get('day')
  const month = thaiMonths[parseInt(get('month')) - 1]
  const yearBE = parseInt(get('year')) + 543
  const time  = `${get('hour')}:${get('minute')}:${get('second')}`

  if (collapsed) {
    return (
      <div className="px-2 py-2 text-center">
        <div className="text-[11px] font-semibold tabular-nums text-slate-700">{get('hour')}:{get('minute')}</div>
        <div className="text-[9px] text-slate-400">{day}/{get('month')}</div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
      <div className="text-lg font-bold tabular-nums tracking-wide text-emerald-600">{time}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">
        วัน{wdIdx >= 0 ? thaiDays[wdIdx] : ''} {day} {month} {yearBE}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const path = usePathname()
  const [me, setMe]               = useState<Me | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMe(d.user)).catch(() => {})
  }, [])

  // ไม่แสดง sidebar บนหน้า login / หน้า QR public (/m โลจบุ๊ครถ, /a เครื่อง CEMS)
  if (path === '/login' || path.startsWith('/m/') || path.startsWith('/a/') || path.startsWith('/p/')) return null

  const role = me?.role
  const groups = NAV
    .map(g => ({
      ...g,
      items: g.items.filter(it => {
        if (role && !it.roles.includes(role)) return false
        // เมนู CEMS โชว์เฉพาะ ADMIN หรือคนที่มีสิทธิ์ CEMS
        if (it.href === '/cems') return !!me && (me.role === 'ADMIN' || !!me.cemsAccess)
        return true
      }),
    }))
    .filter(g => g.items.length > 0)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className={`flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}>
      {/* Logo */}
      <div className={`flex h-[60px] items-center gap-2 border-b border-slate-100 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-lg">🌿</span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-widest text-slate-700">CPS ECO</p>
            <p className="text-[10px] text-slate-400">Planning System</p>
          </div>
        )}
      </div>

      {/* Clock */}
      <div className={collapsed ? '' : 'px-3 pt-3'}>
        <ThaiClock collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map(g => (
          <div key={g.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map(it => {
                const active = path.startsWith(it.href)
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    title={collapsed ? it.label : undefined}
                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${
                      active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                  >
                    <span className="text-base leading-none">{it.icon}</span>
                    {!collapsed && <span className="truncate">{it.label}</span>}
                    {active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-slate-100 p-3">
        {me && !collapsed && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              {me.name.charAt(0)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold text-slate-700">{me.name}</p>
              <p className="truncate text-[10px] text-slate-400">{ROLE_LABEL[me.role]}</p>
            </div>
          </div>
        )}
        <div className={`flex ${collapsed ? 'flex-col gap-1' : 'gap-1.5'}`}>
          <button
            onClick={logout}
            title="ออกจากระบบ"
            className={`flex items-center justify-center rounded-lg border border-slate-200 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors ${collapsed ? 'w-full' : 'flex-1'}`}
          >
            {collapsed ? '⎋' : 'ออกจากระบบ'}
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'ขยาย' : 'ย่อ'}
            className={`flex items-center justify-center rounded-lg border border-slate-200 py-1.5 text-xs text-slate-400 hover:bg-slate-100 transition-colors ${collapsed ? 'w-full' : 'px-2'}`}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
      </div>
    </aside>
  )
}
