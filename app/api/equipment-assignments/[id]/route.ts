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

  const target = await prisma.equipmentAssignment.findUnique({ where: { id: targetId } })
  if (!target) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 })

  if (target.parentId == null) {
    // วันแม่ → ลบทั้งงาน (ลูกหายตาม)
    await prisma.equipmentAssignment.deleteMany({ where: { parentId: targetId } })
    await prisma.equipmentAssignment.delete({ where: { id: targetId } })
  } else {
    // วันลูก → ลบเฉพาะวันนั้น แล้วลดจำนวนวันที่ตัวแม่ให้ตรง
    await prisma.equipmentAssignment.delete({ where: { id: targetId } })
    const remaining = await prisma.equipmentAssignment.count({ where: { parentId: target.parentId } })
    await prisma.equipmentAssignment.update({
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
  const current = await prisma.equipmentAssignment.findUnique({ where: { id: parseInt(id) } })
  if (!current) return NextResponse.json({ error: 'ไม่พบ' }, { status: 404 })
  if (current.isLocked) return NextResponse.json({ error: 'ถูก lock ไว้' }, { status: 403 })

  const updated = await prisma.equipmentAssignment.update({
    where: { id: parseInt(id) },
    data:  body,
    include: { equipment: { include: { type: true } }, site: true },
  })
  return NextResponse.json(updated)
}
