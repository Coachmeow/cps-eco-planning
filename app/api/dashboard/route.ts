/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { countWorkdays } from '@/lib/workdays'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)
  const workdays  = countWorkdays(year, month)

  // ── Equipment Utilization ──────────────────────────────────
  const eqTypesRaw = await prisma.equipmentType.findMany({
    include: {
      equipment: {
        where:   { status: { not: 'RETIRED' } },
        include: { assignments: { where: { assignedDate: { gte: startDate, lte: endDate } } } },
      },
    },
  })

  const equipmentUtil = eqTypesRaw.map((t: any) => {
    const own    = t.equipment.filter((e: any) => !e.isRental)
    const rental = t.equipment.filter((e: any) => e.isRental)
    const ownAssigned    = own.reduce((s: number, e: any) => s + e.assignments.length, 0)
    const rentalAssigned = rental.reduce((s: number, e: any) => s + e.assignments.length, 0)
    const ownUtil    = own.length > 0 && workdays > 0
      ? Math.round((ownAssigned    / (workdays * own.length))    * 100) : 0
    const rentalUtil = rental.length > 0 && workdays > 0
      ? Math.round((rentalAssigned / (workdays * rental.length)) * 100) : 0
    return {
      typeId: t.id, typeCode: t.code, typeName: t.name,
      ownCount: own.length, rentalCount: rental.length,
      ownAssigned, rentalAssigned, ownUtil, rentalUtil,
    }
  }).filter((t: any) => t.ownCount + t.rentalCount > 0)

  // ── Team Workload ──────────────────────────────────────────
  const teams = await prisma.serviceTeam.findMany()

  const demandRaw = await prisma.staffAssignment.groupBy({
    by:    ['serviceTypeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null },
    _sum:  { estimatedDays: true },
  })

  const ownCapRaw = await prisma.$queryRaw<
    { service_type_id: number; days: number }[]
  >`
    SELECT sa.service_type_id, SUM(sa.estimated_days)::float AS days
    FROM staff_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.assigned_date BETWEEN ${startDate} AND ${endDate}
      AND sa.status = 'FIELD'
      AND sa.parent_id IS NULL
      AND sa.service_type_id = e.primary_team_id
    GROUP BY sa.service_type_id
  `

  const teamWorkload = teams.map((t) => {
    const demand  = Number(demandRaw.find((d) => d.serviceTypeId === t.id)?._sum.estimatedDays ?? 0)
    const ownCap  = Number(ownCapRaw.find((d) => d.service_type_id === t.id)?.days ?? 0)
    const crossIn = Math.max(0, demand - ownCap)
    return { teamId: t.id, teamCode: t.code, teamName: t.name, demand, ownCap, crossIn }
  }).filter((t) => t.demand > 0)

  // ── Cross-team Contributors ────────────────────────────────
  const crossRaw = await prisma.staffAssignment.groupBy({
    by:    ['employeeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', isCrossTeam: true, parentId: null },
    _sum:  { estimatedDays: true },
    orderBy: { _sum: { estimatedDays: 'desc' } },
    take:  10,
  })

  const crossContrib = await Promise.all(
    crossRaw.map(async (row) => {
      const emp = await prisma.employee.findUnique({
        where: { id: row.employeeId }, include: { primaryTeam: true },
      })
      return {
        employeeId:    row.employeeId,
        fullName:      emp?.fullName ?? '',
        nickname:      emp?.nickname ?? '',
        primaryTeam:   emp?.primaryTeam.code ?? '',
        crossTeamDays: Number(row._sum.estimatedDays ?? 0),
      }
    })
  )

  return NextResponse.json({ equipmentUtil, teamWorkload, crossContrib, workdays, year, month })
}
