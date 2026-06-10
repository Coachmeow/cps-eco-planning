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

  // own-cap: assignments ที่ employee ทำงานให้ทีมตัวเอง (serviceTypeId === primaryTeamId)
  // ใช้ Prisma ORM แทน raw SQL เพื่อหลีกเลี่ยงปัญหา camelCase vs snake_case column name
  const ownCapAssignments = await prisma.staffAssignment.findMany({
    where: {
      assignedDate:  { gte: startDate, lte: endDate },
      status:        'FIELD',
      parentId:      null,
      serviceTypeId: { not: null },
    },
    select: {
      serviceTypeId: true,
      estimatedDays: true,
      employee:      { select: { primaryTeamId: true } },
    },
  })

  const ownCapMap = new Map<number, number>()
  for (const sa of ownCapAssignments) {
    if (sa.serviceTypeId != null && sa.serviceTypeId === sa.employee.primaryTeamId) {
      ownCapMap.set(sa.serviceTypeId, (ownCapMap.get(sa.serviceTypeId) ?? 0) + Number(sa.estimatedDays))
    }
  }

  const teamWorkload = teams.map((t) => {
    const demand  = Number(demandRaw.find((d) => d.serviceTypeId === t.id)?._sum.estimatedDays ?? 0)
    const ownCap  = ownCapMap.get(t.id) ?? 0
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

  // ── Per-person Utilization ─────────────────────────────────
  const personGroups = await prisma.staffAssignment.groupBy({
    by:    ['employeeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null },
    _sum:  { estimatedDays: true },
  })

  const personUtil = (await Promise.all(
    personGroups.map(async (g) => {
      const emp = await prisma.employee.findUnique({
        where: { id: g.employeeId }, include: { primaryTeam: true },
      })
      const fieldDays = Number(g._sum.estimatedDays ?? 0)
      const utilPct   = workdays > 0 ? Math.round((fieldDays / workdays) * 100) : 0
      return {
        employeeId:  g.employeeId,
        fullName:    emp?.fullName ?? '',
        nickname:    emp?.nickname ?? '',
        primaryTeam: emp?.primaryTeam.code ?? '',
        fieldDays,
        utilPct,
      }
    })
  )).sort((a, b) => b.utilPct - a.utilPct)

  return NextResponse.json({ equipmentUtil, teamWorkload, crossContrib, personUtil, workdays, year, month })
}
