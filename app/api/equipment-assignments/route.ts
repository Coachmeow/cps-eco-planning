import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEquipmentConflicts } from '@/lib/conflicts'

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
  const body = await req.json()
  const { equipmentId, assignedDate, siteId, staffAssignmentId, notes } = body

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

  return NextResponse.json({ created, conflict: { hasConflict } }, { status: 201 })
}
