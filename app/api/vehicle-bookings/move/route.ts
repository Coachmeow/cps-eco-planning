import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

const DAY_MS = 86400000

// POST { assignmentId, newStartDate } → เลื่อนงานจองรถ (แม่+ลูก) ไปวันเริ่มใหม่ ด้วย offset เดียว
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const assignmentId = parseInt(String(body.assignmentId ?? ''))
  const newStartDate = String(body.newStartDate ?? '')
  if (!assignmentId || !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    return NextResponse.json({ error: 'assignmentId และ newStartDate (YYYY-MM-DD) จำเป็น' }, { status: 400 })
  }

  const target = await prisma.vehicleBooking.findUnique({ where: { id: assignmentId } })
  if (!target || target.parentId != null) return NextResponse.json({ error: 'ไม่พบงาน (ต้องเป็นวันแม่)' }, { status: 404 })

  const offset = Math.round((new Date(newStartDate).getTime() - new Date(target.assignedDate).getTime()) / DAY_MS)
  if (offset === 0) return NextResponse.json({ moved: 0 })

  const children = await prisma.vehicleBooking.findMany({ where: { parentId: assignmentId } })
  const shift = (d: Date) => new Date(new Date(d).getTime() + offset * DAY_MS)
  await prisma.$transaction(async (tx) => {
    await tx.vehicleBooking.update({ where: { id: assignmentId }, data: { assignedDate: shift(target.assignedDate) } })
    for (const c of children) await tx.vehicleBooking.update({ where: { id: c.id }, data: { assignedDate: shift(c.assignedDate) } })
  })
  return NextResponse.json({ moved: 1 })
}
