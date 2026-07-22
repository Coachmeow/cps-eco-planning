'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Vehicle, VehicleBooking, Site, Employee, VehicleCalendarData } from '@/lib/types'
import { toDateKey } from '@/lib/dateKey'

function buildCalendarData(bookings: VehicleBooking[]): VehicleCalendarData {
  const map: VehicleCalendarData = new Map()
  for (const b of bookings) {
    const dateKey = toDateKey(b.assignedDate)
    if (!map.has(b.vehicleId)) map.set(b.vehicleId, new Map())
    const dayMap = map.get(b.vehicleId)!
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, [])
    dayMap.get(dateKey)!.push(b)
  }
  return map
}

export function useVehicleCalendar(year: number, month: number) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [bookings, setBookings] = useState<VehicleBooking[]>([])
  const [conflicts, setConflicts] = useState<Set<string>>(new Set())
  const [sites, setSites] = useState<Site[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const calendarData = buildCalendarData(bookings)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const qs = `year=${year}&month=${month}`
    const [vRes, bRes, cflRes, siteRes, empRes] = await Promise.all([
      fetch('/api/vehicles'),
      fetch(`/api/vehicle-bookings?${qs}`),
      fetch(`/api/conflicts?${qs}`),
      fetch('/api/sites'),
      fetch('/api/employees'),
    ])
    const [v, b, cfl, site, emp] = await Promise.all([
      vRes.json(), bRes.json(), cflRes.json(), siteRes.json(), empRes.json(),
    ])
    setVehicles(Array.isArray(v) ? v : [])
    setBookings(Array.isArray(b) ? b : [])
    setConflicts(new Set(
      (cfl.vehicleConflicts ?? []).map((c: { vehicle_id: number; assigned_date: string }) =>
        `${c.vehicle_id}-${toDateKey(c.assigned_date)}`)
    ))
    setSites(Array.isArray(site) ? site : [])
    setEmployees(Array.isArray(emp) ? emp : [])
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addBooking = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/vehicle-bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
    await fetchAll()
  }, [fetchAll])

  const removeBooking = useCallback(async (id: number) => {
    await fetch(`/api/vehicle-bookings/${id}`, { method: 'DELETE' })
    await fetchAll()
  }, [fetchAll])

  const moveBooking = useCallback(async (p: { assignmentId: number; newStartDate: string }) => {
    const res = await fetch('/api/vehicle-bookings/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'เลื่อนไม่สำเร็จ')
    await fetchAll()
  }, [fetchAll])

  return { vehicles, calendarData, conflicts, sites, employees, loading, addBooking, removeBooking, moveBooking }
}
