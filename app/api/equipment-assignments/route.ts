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

  // จองได้เฉพาะเครื่องพร้อมใช้ — กันจองเครื่องซ่อม/Cal/เสีย/ปลดระวาง
  const eq = await prisma.equipment.findUnique({ where: { id: parseInt(String(equipmentId)) }, select: { status: true } })
  if (!eq) return NextResponse.json({ error: 'ไม่พบเครื่องมือ' }, { status: 404 })
  if (eq.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'เครื่องมือไม่พร้อมใช้ (ซ่อม/Cal/เสีย) จองไม่ได้' }, { status: 400 })
  }

  const date = new Date(assignedDate)
  const hasConflict = await getEquipmentConflicts(equipmentId, date)
  const days = Math.min(Math.floor(Number(estimatedDays)), 20)

  // วันแม่ — เก็บจำนวนวันรวมไว้ที่ estimatedDays
  const created = await prisma.equipmentAssignment.create({
    data: {
      equipmentId, assignedDate: date,
      siteId: siteId ?? null,
      staffAssignmentId: staffAssignmentId ?? null,
      notes,
      estimatedDays: days,
    },
    include: { equipment: { include: { type: true } }, site: true },
  })

  // วันลูก — ชี้ parentId กลับไปที่วันแม่, estimatedDays = 0 (กันนับซ้ำ)
  const extraDays = []
  for (let i = 1; i < days; i++) {
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + i)
    const extra = await prisma.equipmentAssignment.create({
      data: {
        equipmentId, assignedDate: nextDate,
        siteId: siteId ?? null,
        staffAssignmentId: staffAssignmentId ?? null,
        notes,
        estimatedDays: 0,
        parentId: created.id,
      },
      include: { equipment: { include: { type: true } }, site: true },
    })
    extraDays.push(extra)
  }

  return NextResponse.json({ created, extraDays, conflict: { hasConflict } }, { status: 201 })
}
