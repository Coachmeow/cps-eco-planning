'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Equipment, EquipmentAssignment, EquipmentType, Site, EquipmentCalendarData, ConflictSet } from '@/lib/types'
import { toDateKey } from '@/lib/dateKey'

function buildCalendarData(assignments: EquipmentAssignment[]): EquipmentCalendarData {
  const map: EquipmentCalendarData = new Map()
  for (const a of assignments) {
    const dateKey = toDateKey(a.assignedDate)
    if (!map.has(a.equipmentId)) map.set(a.equipmentId, new Map())
    const dayMap = map.get(a.equipmentId)!
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, [])
    dayMap.get(dateKey)!.push(a)
  }
  return map
}

export function useEquipmentCalendar(year: number, month: number, typeId: number | null) {
  const [equipment,   setEquipment]   = useState<Equipment[]>([])
  const [eqTypes,     setEqTypes]     = useState<EquipmentType[]>([])
  const [assignments, setAssignments] = useState<EquipmentAssignment[]>([])
  const [conflicts,   setConflicts]   = useState<ConflictSet>({ staffConflicts: new Set(), equipmentConflicts: new Set() })
  const [sites,       setSites]       = useState<Site[]>([])
  const [loading,     setLoading]     = useState(true)

  const calendarData = buildCalendarData(assignments)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const qs   = `year=${year}&month=${month}`
    const eqQs = typeId ? `typeId=${typeId}` : ''
    const asgQs = typeId ? `${qs}&typeId=${typeId}` : qs

    const [eqRes, typeRes, asgRes, cflRes, siteRes] = await Promise.all([
      fetch(`/api/equipment?${eqQs}`),
      fetch('/api/equipment-types'),
      fetch(`/api/equipment-assignments?${asgQs}`),
      fetch(`/api/conflicts?${qs}`),
      fetch('/api/sites'),
    ])
    const [eq, types, asg, cfl, site] = await Promise.all([
      eqRes.json(), typeRes.json(), asgRes.json(), cflRes.json(), siteRes.json(),
    ])
    setEquipment(eq)
    setEqTypes(types)
    setAssignments(asg)
    setConflicts({
      staffConflicts: new Set(),
      equipmentConflicts: new Set(
        (cfl.eqConflicts ?? []).map((c: { equipment_id: number; assigned_date: string }) =>
          `${c.equipment_id}-${toDateKey(c.assigned_date)}`)
      ),
    })
    setSites(site)
    setLoading(false)
  }, [year, month, typeId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addAssignment = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/equipment-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
    await fetchAll()
  }, [fetchAll])

  const addAssignments = useCallback(async (payloads: Record<string, unknown>[]) => {
    await Promise.allSettled(
      payloads.map(payload =>
        fetch('/api/equipment-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    )
    await fetchAll()
  }, [fetchAll])

  const removeAssignment = useCallback(async (id: number) => {
    await fetch(`/api/equipment-assignments/${id}`, { method: 'DELETE' })
    await fetchAll()
  }, [fetchAll])

  return { equipment, eqTypes, calendarData, conflicts, sites, loading, addAssignment, addAssignments, removeAssignment }
}
