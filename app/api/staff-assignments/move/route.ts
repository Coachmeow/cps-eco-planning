import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

const DAY_MS = 86400000

// GET ?assignmentId= → หา "เพื่อนร่วมกลุ่ม" (parent อื่นที่ไซต์+วันเริ่ม+จำนวนวัน+สถานะ+ประเภทงานตรงกัน)
// ใช้โชว์รายชื่อให้ติ๊กก่อนเลื่อนทั้งกลุ่ม — งานคนร่วมงานไม่มี groupId เชื่อม จึงจับกลุ่มจากลักษณะงานที่ตรงกัน
export async function GET(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const id = parseInt(req.nextUrl.searchParams.get('assignmentId') ?? '')
  if (!id) return NextResponse.json({ error: 'assignmentId จำเป็น' }, { status: 400 })

  const target = await prisma.staffAssignment.findUnique({ where: { id } })
  if (!target || target.parentId != null) return NextResponse.json({ error: 'ไม่พบงาน (ต้องเป็นวันแม่)' }, { status: 404 })

  const peers = await prisma.staffAssignment.findMany({
    where: {
      id:            { not: target.id },
      parentId:      null,
      assignedDate:  target.assignedDate,
      siteId:        target.siteId,
      estimatedDays: target.estimatedDays,
      status:        target.status,
      serviceTypeId: target.serviceTypeId,
      isLocked:      false,
    },
    include: { employee: true },
    orderBy: { employeeId: 'asc' },
  })

  return NextResponse.json(peers.map(p => ({
    id:         p.id,
    employeeId: p.employeeId,
    name:       p.employee.nickname ?? p.employee.fullName,
    fullName:   p.employee.fullName,
  })))
}

// POST { assignmentId, newStartDate, includeIds? } → เลื่อนงาน (แม่+ลูก+เครื่องมือ/รถที่ผูก) ไปวันเริ่มใหม่
// จำนวนวัน/โครงวันคงเดิม (เลื่อนทุก record ด้วย offset เดียวกัน) — ไม่ลบสร้างใหม่
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const assignmentId = parseInt(String(body.assignmentId ?? ''))
  const newStartDate = String(body.newStartDate ?? '')
  const includeIds: number[] = Array.isArray(body.includeIds)
    ? body.includeIds.map((v: unknown) => parseInt(String(v))).filter(Boolean) : []

  if (!assignmentId || !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    return NextResponse.json({ error: 'assignmentId และ newStartDate (YYYY-MM-DD) จำเป็น' }, { status: 400 })
  }

  const target = await prisma.staffAssignment.findUnique({ where: { id: assignmentId } })
  if (!target || target.parentId != null) return NextResponse.json({ error: 'ไม่พบงาน (ต้องเป็นวันแม่)' }, { status: 404 })
  if (target.isLocked) return NextResponse.json({ error: 'งานนี้ถูกล็อกไว้ เลื่อนไม่ได้' }, { status: 403 })

  const offsetDays = Math.round((new Date(newStartDate).getTime() - new Date(target.assignedDate).getTime()) / DAY_MS)
  if (offsetDays === 0) return NextResponse.json({ moved: 0, skipped: [] })

  const wantIds = [assignmentId, ...includeIds.filter(i => i !== assignmentId)]
  const parents = await prisma.staffAssignment.findMany({
    where: { id: { in: wantIds }, parentId: null },
    include: { employee: true },
  })

  const skipped: string[] = []
  const movable = parents.filter(p => {
    if (p.isLocked) { skipped.push(p.employee.nickname ?? p.employee.fullName); return false }
    return true
  })

  const shift = (d: Date) => new Date(new Date(d).getTime() + offsetDays * DAY_MS)

  await prisma.$transaction(async (tx) => {
    for (const parent of movable) {
      // แม่ + ลูกทุกวัน เลื่อนด้วย offset เดียวกัน (โครงวันคงเดิม รองรับงานที่เคยเล็มวันกลางออก)
      const children = await tx.staffAssignment.findMany({ where: { parentId: parent.id } })
      await tx.staffAssignment.update({ where: { id: parent.id }, data: { assignedDate: shift(parent.assignedDate) } })
      for (const c of children) {
        await tx.staffAssignment.update({ where: { id: c.id }, data: { assignedDate: shift(c.assignedDate) } })
      }
      // เครื่องมือ/รถที่ผูกกับงานนี้ → เลื่อนตาม
      const eqRows = await tx.equipmentAssignment.findMany({ where: { staffAssignmentId: parent.id } })
      for (const r of eqRows) {
        await tx.equipmentAssignment.update({ where: { id: r.id }, data: { assignedDate: shift(r.assignedDate) } })
      }
      const vehRows = await tx.vehicleBooking.findMany({ where: { staffAssignmentId: parent.id } })
      for (const r of vehRows) {
        await tx.vehicleBooking.update({ where: { id: r.id }, data: { assignedDate: shift(r.assignedDate) } })
      }
    }
  })

  return NextResponse.json({ moved: movable.length, skipped })
}
