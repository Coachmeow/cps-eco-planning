'use client'

import { useState, useEffect } from 'react'
import { toDateKey } from '@/lib/dateKey'

export interface Holiday { id: number; date: string; name: string }

// โหลดวันหยุดพิเศษทั้งหมด คืน Set/Map (key = "YYYY-MM-DD") สำหรับคำนวณ util + ไฮไลต์ปฏิทิน
export function useHolidays(refreshKey?: unknown) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  useEffect(() => {
    fetch('/api/holidays').then(r => r.json())
      .then(d => Array.isArray(d) && setHolidays(d)).catch(() => {})
  }, [refreshKey])

  const holidaySet = new Set(holidays.map(h => toDateKey(h.date)))
  const holidayMap = new Map(holidays.map(h => [toDateKey(h.date), h.name]))
  return { holidays, holidaySet, holidayMap }
}
