'use client'

import { useState, useEffect } from 'react'
import type { UserRole } from '@/lib/roles'

export interface Me {
  uid:      number
  role:     UserRole
  username: string
  name:     string
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
  return { me, loading, role: me?.role }
}
