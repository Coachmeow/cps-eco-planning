import { prisma } from './prisma'

export async function getEquipmentConflicts(
  equipmentId: number,
  assignedDate: Date,
  excludeId?: number
): Promise<boolean> {
  const count = await prisma.equipmentAssignment.count({
    where: {
      equipmentId,
      assignedDate,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })
  return count > 0
}

export async function getStaffConflict(
  employeeId: number,
  assignedDate: Date,
  siteId: number | null,
  excludeId?: number
): Promise<{ hasConflict: boolean; conflictingIds: number[] }> {
  const existing = await prisma.staffAssignment.findMany({
    where: {
      employeeId,
      assignedDate,
      status: 'FIELD',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, siteId: true },
  })

  if (existing.length === 0) return { hasConflict: false, conflictingIds: [] }
  if (siteId === null) return { hasConflict: false, conflictingIds: [] }

  const conflicts = existing.filter((a) => a.siteId !== siteId)
  return {
    hasConflict: conflicts.length > 0,
    conflictingIds: conflicts.map((a) => a.id),
  }
}

export async function getMonthlyConflicts(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)

  // ── Equipment conflicts: same equipment, same day, >1 assignment ──────────
  const eqGroups = await prisma.equipmentAssignment.groupBy({
    by:    ['equipmentId', 'assignedDate'],
    where: { assignedDate: { gte: startDate, lte: endDate } },
    _count: { id: true },
  })
  const eqConflicts = eqGroups
    .filter((g) => g._count.id > 1)
    .map((g) => ({
      equipment_id:  g.equipmentId,
      assigned_date: g.assignedDate,
      cnt:           g._count.id,
    }))

  // ── Staff conflicts: same employee, same day, different sites ─────────────
  const staffAssignments = await prisma.staffAssignment.findMany({
    where: {
      assignedDate: { gte: startDate, lte: endDate },
      status:       'FIELD',
      siteId:       { not: null },
    },
    select: { employeeId: true, assignedDate: true, siteId: true },
  })

  // group by employeeId+date และนับ distinct siteIds ใน JS
  const siteMap = new Map<string, Set<number>>()
  for (const a of staffAssignments) {
    const dateKey = a.assignedDate instanceof Date
      ? a.assignedDate.toISOString().slice(0, 10)
      : String(a.assignedDate).slice(0, 10)
    const key = `${a.employeeId}__${dateKey}`
    if (!siteMap.has(key)) siteMap.set(key, new Set())
    if (a.siteId != null) siteMap.get(key)!.add(a.siteId)
  }

  const staffConflicts: { employee_id: number; assigned_date: string; site_count: number }[] = []
  for (const [key, sites] of siteMap.entries()) {
    if (sites.size > 1) {
      const [empId, dateStr] = key.split('__')
      staffConflicts.push({
        employee_id:   Number(empId),
        assigned_date: dateStr,
        site_count:    sites.size,
      })
    }
  }

  return { eqConflicts, staffConflicts }
}
