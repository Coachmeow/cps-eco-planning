'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const IDLE_MS  = 30 * 60 * 1000   // 30 นาที
const KEY      = 'cps_last_activity'
const WRITE_THROTTLE = 5000        // เขียน localStorage อย่างมากทุก 5 วินาที

// ออกจากระบบอัตโนมัติเมื่อไม่มีกิจกรรมครบ 30 นาที (ใช้ร่วมข้ามแท็บผ่าน localStorage)
export default function IdleLogout() {
  const path = usePathname()
  const lastWrite = useRef(0)

  useEffect(() => {
    if (path === '/login' || path.startsWith('/m/')) return

    const bump = () => {
      const now = Date.now()
      if (now - lastWrite.current > WRITE_THROTTLE) {
        lastWrite.current = now
        localStorage.setItem(KEY, String(now))
      }
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))

    // ตั้งเวลาเริ่มต้น (ถ้ายังไม่มี หรือเพิ่งเข้ามา)
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, String(Date.now()))

    let stopped = false
    async function check() {
      if (stopped) return
      const last = Number(localStorage.getItem(KEY) || Date.now())
      if (Date.now() - last >= IDLE_MS) {
        stopped = true
        clearInterval(timer)
        events.forEach(e => window.removeEventListener(e, bump))
        try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
        localStorage.removeItem(KEY)
        window.location.href = '/login?idle=1'
      }
    }
    const timer = setInterval(check, 30 * 1000)  // ตรวจทุก 30 วินาที
    check()  // ตรวจทันทีตอนโหลด (เผื่อ refresh หลังปล่อยทิ้งไว้นาน)

    return () => {
      stopped = true
      clearInterval(timer)
      events.forEach(e => window.removeEventListener(e, bump))
    }
  }, [path])

  return null
}
