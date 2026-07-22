import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'
import { maintStateForWindow, overlappingEventWhere, type MaintEvent } from '@/lib/equipmentAvailability'

const DAY_MS = 86400000

// POST { assignmentId, newStartDate } → เลื่อนงานจองเครื่อง (แม่+ลูก) ไปวันเริ่มใหม่ ด้วย offset เดียว
// เช็คปลายทางว่าไม่ทับช่วงส่งซ่อม/Cal (date-aware) — จำนวนวันคงเดิม
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const assignmentId = parseInt(String(body.assignmentId ?? ''))
  const newStartDate = String(body.newStartDate ?? '')
  if (!assignmentId || !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    return NextResponse.json({ error: 'assignmentId และ newStartDate (YYYY-MM-DD) จำเป็น' }, { status: 400 })
  }

  const target = await prisma.equipmentAssignment.findUnique({ where: { id: assignmentId } })
  if (!target || target.parentId != null) return NextResponse.json({ error: 'ไม่พบงาน (ต้องเป็นวันแม่)' }, { status: 404 })
  if (target.isLocked) return NextResponse.json({ error: 'งานนี้ถูกล็อกไว้ เลื่อนไม่ได้' }, { status: 403 })

  const offset = Math.round((new Date(newStartDate).getTime() - new Date(target.assignedDate).getTime()) / DAY_MS)
  if (offset === 0) return NextResponse.json({ moved: 0 })

  const children = await prisma.equipmentAssignment.findMany({ where: { parentId: assignmentId } })
  const days = 1 + children.length
  const nStart = new Date(newStartDate)
  const nEnd = new Date(nStart); nEnd.setDate(nEnd.getDate() + days - 1)

  // ปลายทางต้องไม่ทับช่วงส่งซ่อม/Cal ; RETIRED เลื่อนไม่ได้
  const eq = await prisma.equipment.findUnique({ where: { id: target.equipmentId }, select: { status: true } })
  if (eq?.status === 'RETIRED') return NextResponse.json({ error: 'เครื่องมือปลดระวางแล้ว' }, { status: 400 })
  const evRows = await prisma.equipmentEvent.findMany({
    where: { equipmentId: target.equipmentId, ...overlappingEventWhere(nStart, nEnd) },
    select: { sentDate: true, expectedDate: true, returnedDate: true, type: true },
  })
  const evs: MaintEvent[] = evRows.map(e => ({ sentDate: e.sentDate, expectedDate: e.expectedDate, returnedDate: e.returnedDate, type: e.type }))
  if (maintStateForWindow(evs, nStart, nEnd).state === 'blocked') {
    return NextResponse.json({ error: 'วันปลายทางทับช่วงส่งซ่อม/Cal — เลื่อนไม่ได้' }, { status: 400 })
  }

  const shift = (d: Date) => new Date(new Date(d).getTime() + offset * DAY_MS)
  await prisma.$transaction(async (tx) => {
    await tx.equipmentAssignment.update({ where: { id: assignmentId }, data: { assignedDate: shift(target.assignedDate) } })
    for (const c of children) await tx.equipmentAssignment.update({ where: { id: c.id }, data: { assignedDate: shift(c.assignedDate) } })
  })
  return NextResponse.json({ moved: 1 })
}
