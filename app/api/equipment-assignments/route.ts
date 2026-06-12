import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEquipmentConflicts } from '@/lib/conflicts'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year   = parseInt(searchParams.get('year')   ?? String(new Date().getFullYear()))
  const month  = parseInt(searchParams.get('month')  ?? String(new Date().getMonth() + 1))
  const typeId = searchParams.get('typeId')

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)

  const assignments = await prisma.equipmentAssignment.findMany({
    where: {
      assignedDate: { gte: startDate, lte: endDate },
      ...(typeId ? { equipment: { typeId: parseInt(typeId) } } : {}),
    },
    include: { equipment: { include: { type: true } }, site: true },
    orderBy: [{ equipmentId: 'asc' }, { assignedDate: 'asc' }],
  })

  return NextResponse.json(assignments)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const { equipmentId, assignedDate, siteId, staffAssignmentId, notes, estimatedDays = 1 } = body

  if (!equipmentId || !assignedDate) {
    return NextResponse.json({ error: 'equipmentId และ assignedDate จำเป็น' }, { status: 400 })
  }

  const date = new Date(assignedDate)
  const hasConflict = await getEquipmentConflicts(equipmentId, date)

  const created = await prisma.equipmentAssignment.create({
    data: {
      equipmentId, assignedDate: date,
      siteId: siteId ?? null,
      staffAssignmentId: staffAssignmentId ?? null,
      notes,
    },
    include: { equipment: { include: { type: true } }, site: true },
  })

  // create extra day records for multi-day assignments
  const extraDays = []
  const days = Math.min(Math.floor(Number(estimatedDays)), 20)
  for (let i = 1; i < days; i++) {
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + i)
    const extra = await prisma.equipmentAssignment.create({
      data: {
        equipmentId, assignedDate: nextDate,
        siteId: siteId ?? null,
        staffAssignmentId: staffAssignmentId ?? null,
        notes,
      },
      include: { equipment: { include: { type: true } }, site: true },
    })
    extraDays.push(extra)
  }

  return NextResponse.json({ created, extraDays, conflict: { hasConflict } }, { status: 201 })
}
