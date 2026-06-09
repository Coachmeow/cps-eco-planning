'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Employee, StaffAssignment, Site, ServiceTeam, CalendarData, ConflictSet } from '@/lib/types'

function toDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10)
}

function buildCalendarData(assignments: StaffAssignment[]): CalendarData {
  const map: CalendarData = new Map()
  for (const a of assignments) {
    const dateKey = toDateKey(a.assignedDate)
    if (!map.has(a.employeeId)) map.set(a.employeeId, new Map())
    const dayMap = map.get(a.employeeId)!
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, [])
    dayMap.get(dateKey)!.push(a)
  }
  return map
}

export function useStaffCalendar(year: number, month: number) {
  const [employees,   setEmployees]   = useState<Employee[]>([])
  const [assignments, setAssignments] = useState<StaffAssignment[]>([])
  const [conflicts,   setConflicts]   = useState<ConflictSet>({ staffConflicts: new Set(), equipmentConflicts: new Set() })
  const [sites,       setSites]       = useState<Site[]>([])
  const [teams,       setTeams]       = useState<ServiceTeam[]>([])
  const [loading,     setLoading]     = useState(true)

  const calendarData = buildCalendarData(assignments)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const qs = `year=${year}&month=${month}`
    const [empRes, asgRes, cflRes, siteRes, teamRes] = await Promise.all([
      fetch('/api/employees'),
      fetch(`/api/staff-assignments?${qs}`),
      fetch(`/api/conflicts?${qs}`),
      fetch('/api/sites'),
      fetch('/api/teams'),
    ])
    const [emp, asg, cfl, site, team] = await Promise.all([
      empRes.json(), asgRes.json(), cflRes.json(), siteRes.json(), teamRes.json(),
    ])
    setEmployees(emp)
    setAssignments(asg)
    setConflicts({
      staffConflicts: new Set(
        (cfl.staffConflicts ?? []).map((c: { employee_id: number; assigned_date: string }) =>
          `${c.employee_id}-${toDateKey(c.assigned_date)}`)
      ),
      equipmentConflicts: new Set(),
    })
    setSites(site)
    setTeams(team)
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addAssignment = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/staff-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
    await fetchAll()
  }, [fetchAll])

  const removeAssignment = useCallback(async (id: number) => {
    await fetch(`/api/staff-assignments/${id}`, { method: 'DELETE' })
    await fetchAll()
  }, [fetchAll])

  return { employees, calendarData, conflicts, sites, teams, loading, addAssignment, removeAssignment }
}
