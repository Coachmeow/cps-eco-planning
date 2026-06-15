import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const targetId = parseInt(id)

  const target = await prisma.staffAssignment.findUnique({ where: { id: targetId } })
  if (!target) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 })

  if (target.parentId == null) {
    // วันแม่ → ลบทั้งงาน (ลูกหายตาม)
    // เครื่องที่แนบ "คงอยู่ที่ไซต์" แค่ตัดสายผูก (จัดการ/ดึงออกรายเครื่องในแผนเครื่องมือ)
    await prisma.equipmentAssignment.updateMany({ where: { staffAssignmentId: targetId }, data: { staffAssignmentId: null } })
    await prisma.staffAssignment.deleteMany({ where: { parentId: targetId } })
    await prisma.staffAssignment.delete({ where: { id: targetId } })
  } else {
    // วันลูก → ลบเฉพาะวันนั้น แล้วลดจำนวนวันที่ตัวแม่ให้ตรง (utilization ถูกต้อง)
    await prisma.staffAssignment.delete({ where: { id: targetId } })
    const remaining = await prisma.staffAssignment.count({ where: { parentId: target.parentId } })
    await prisma.staffAssignment.update({
      where: { id: target.parentId },
      data:  { estimatedDays: 1 + remaining },
    })
  }
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const body    = await req.json()
  const current = await prisma.staffAssignment.findUnique({ where: { id: parseInt(id) } })
  if (!current) return NextResponse.json({ error: 'ไม่พบ' }, { status: 404 })
  if (current.isLocked) return NextResponse.json({ error: 'ถูก lock ไว้' }, { status: 403 })

  const updated = await prisma.staffAssignment.update({
    where: { id: parseInt(id) },
    data:  body,
    include: { employee: true, site: true, serviceType: true },
  })
  return NextResponse.json(updated)
}
