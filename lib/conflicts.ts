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

  const eqConflicts = await prisma.$queryRaw<
    { equipment_id: number; assigned_date: Date; cnt: bigint }[]
  >`
    SELECT equipment_id, assigned_date, COUNT(*) as cnt
    FROM equipment_assignments
    WHERE assigned_date BETWEEN ${startDate} AND ${endDate}
    GROUP BY equipment_id, assigned_date
    HAVING COUNT(*) > 1
  `

  const staffConflicts = await prisma.$queryRaw<
    { employee_id: number; assigned_date: Date; site_count: bigint }[]
  >`
    SELECT employee_id, assigned_date, COUNT(DISTINCT site_id) as site_count
    FROM staff_assignments
    WHERE assigned_date BETWEEN ${startDate} AND ${endDate}
      AND status = 'FIELD'
      AND site_id IS NOT NULL
    GROUP BY employee_id, assigned_date
    HAVING COUNT(DISTINCT site_id) > 1
  `

  return { eqConflicts, staffConflicts }
}
