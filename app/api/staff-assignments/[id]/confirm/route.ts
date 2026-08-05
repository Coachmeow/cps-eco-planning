import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// POST → ยืนยันงานจอง: ปลดธง isTentative ของงานคน (แม่+วันลูก) + เครื่องมือ/รถที่แนบไปกับงานนั้น
// รับ id ของวันแม่หรือวันลูกก็ได้ — ยืนยันทั้งชุดเสมอ (งานเดียวกันจะครึ่งจองครึ่งยืนยันไม่ได้)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const target = await prisma.staffAssignment.findUnique({
      where: { id: parseInt(id) }, select: { id: true, parentId: true },
    })
    if (!target) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })

    const rootId = target.parentId ?? target.id
    const clear = { isTentative: false, tentativeReason: null }

    await prisma.$transaction(async (tx) => {
      const childIds = (await tx.staffAssignment.findMany({ where: { parentId: rootId }, select: { id: true } })).map(c => c.id)
      const saIds = [rootId, ...childIds]
      await tx.staffAssignment.updateMany({ where: { id: { in: saIds } }, data: clear })
      // เครื่องมือ/รถ ที่ผูกกับงานนี้ ยืนยันตามไปด้วย (จองพร้อมกันก็ต้องยืนยันพร้อมกัน)
      await tx.equipmentAssignment.updateMany({ where: { staffAssignmentId: { in: saIds } }, data: clear })
      await tx.vehicleBooking.updateMany({ where: { staffAssignmentId: { in: saIds } }, data: clear })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
