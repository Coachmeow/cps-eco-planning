import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStaffConflict } from '@/lib/conflicts'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)

  const assignments = await prisma.staffAssignment.findMany({
    where: { assignedDate: { gte: startDate, lte: endDate } },
    include: {
      employee:    { include: { primaryTeam: true } },
      site:        true,
      serviceType: true,
    },
    orderBy: [{ employeeId: 'asc' }, { assignedDate: 'asc' }],
  })

  return NextResponse.json(assignments)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    employeeId, assignedDate, siteId, serviceTypeId,
    estimatedDays = 1, status = 'FIELD', notes, isLocked = false,
  } = body

  if (!employeeId || !assignedDate) {
    return NextResponse.json({ error: 'employeeId และ assignedDate จำเป็น' }, { status: 400 })
  }

  const date = new Date(assignedDate)

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { primaryTeamId: true },
  })
  if (!employee) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

  const isCrossTeam = serviceTypeId != null && serviceTypeId !== employee.primaryTeamId
  const { hasConflict, conflictingIds } = await getStaffConflict(employeeId, date, siteId ?? null)

  const created = await prisma.staffAssignment.create({
    data: {
      employeeId, assignedDate: date,
      siteId: siteId ?? null, serviceTypeId: serviceTypeId ?? null,
      isCrossTeam, estimatedDays, status, notes, isLocked,
    },
    include: { employee: true, site: true, serviceType: true },
  })

  const extraDays = []
  if (estimatedDays > 1) {
    for (let i = 1; i < estimatedDays; i++) {
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + i)
      const extra = await prisma.staffAssignment.create({
        data: {
          employeeId, assignedDate: nextDate,
          siteId: siteId ?? null, serviceTypeId: serviceTypeId ?? null,
          isCrossTeam, estimatedDays: 0, status, notes, isLocked,
          parentId: created.id,
        },
        include: { employee: true, site: true, serviceType: true },
      })
      extraDays.push(extra)
    }
  }

  return NextResponse.json(
    { created, extraDays, conflict: { hasConflict, conflictingIds } },
    { status: 201 }
  )
}
