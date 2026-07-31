'use client'

import { useState, useEffect } from 'react'
import type { UserRole } from '@/lib/roles'

export type CemsRole = 'NONE' | 'USER' | 'ADMIN'

export interface Me {
  uid:        number
  role:       UserRole
  username:   string
  name:       string
  cemsAccess?: boolean    // เข้าโมดูล CEMS ได้ไหม (= cemsRole !== 'NONE')
  cemsRole?:   CemsRole   // ระดับสิทธิ์ใน CEMS (ADMIN ของระบบ = 'ADMIN' เสมอ)
}

// โหลดข้อมูลผู้ใช้ปัจจุบันสำหรับ gate UI (ปุ่ม/แท็บ) ฝั่ง client
export function useMe() {
  const [me, setMe]           = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  return { me, loading, role: me?.role, cemsRole: me?.cemsRole ?? 'NONE', isCemsAdmin: me?.cemsRole === 'ADMIN' }
}
