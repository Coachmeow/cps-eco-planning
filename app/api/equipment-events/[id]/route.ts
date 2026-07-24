import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// PATCH = แก้ไขใบงาน / รับเครื่องกลับ (ส่ง returnedDate)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER', 'MAINTENANCE')) return forbidden()
  try {
    const { id } = await params
    const eventId = parseInt(id)
    const body = await req.json()

    const current = await prisma.equipmentEvent.findUnique({ where: { id: eventId } })
    if (!current) return NextResponse.json({ error: 'ไม่พบใบงาน' }, { status: 404 })

    // บังคับกรอกกำหนด Cal ครั้งถัดไป เฉพาะ "การรับกลับครั้งแรก" ของงาน Cal
    // (การแก้ไขงานที่รับกลับแล้ว อนุญาตให้เว้นว่าง = ดึงออกจากแผน Cal ได้)
    const isFirstReturn = !current.returnedDate && !!body.returnedDate
    const nextDueEffective = body.nextDueDate !== undefined ? body.nextDueDate : current.nextDueDate
    if (isFirstReturn && current.type === 'CALIBRATION' && !nextDueEffective) {
      return NextResponse.json({ error: 'ต้องระบุกำหนด Cal ครั้งถัดไป' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (body.expectedDate !== undefined) data.expectedDate = body.expectedDate ? new Date(body.expectedDate) : null
    if (body.nextDueDate  !== undefined) data.nextDueDate  = body.nextDueDate  ? new Date(body.nextDueDate)  : null
    if (body.vendor       !== undefined) data.vendor       = body.vendor || null
    if (body.cost         !== undefined) data.cost         = body.cost != null && body.cost !== '' ? parseInt(body.cost) : null
    if (body.notes        !== undefined) data.notes        = body.notes || null
    if (body.returnedDate !== undefined) data.returnedDate = body.returnedDate ? new Date(body.returnedDate) : null

    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.equipmentEvent.update({ where: { id: eventId }, data })

      // รับกลับ → เครื่องกลับมา ACTIVE
      const eqData: Record<string, unknown> = {}
      if (body.returnedDate) eqData.status = 'ACTIVE'

      // Cal = source of truth ของแผน Cal: recompute calDueDate จาก Cal event ล่าสุดที่รับกลับแล้ว
      // ครอบคลุมทั้ง รับกลับ / แก้วันที่ / เคลียร์ (ดึงออกจากแผน) และกันแก้ event เก่าไปทับของใหม่
      if (current.type === 'CALIBRATION') {
        const latest = await tx.equipmentEvent.findFirst({
          where: { equipmentId: current.equipmentId, type: 'CALIBRATION', returnedDate: { not: null } },
          orderBy: { sentDate: 'desc' },
        })
        eqData.calDueDate = latest?.nextDueDate ?? null
      }
      if (Object.keys(eqData).length > 0) {
        await tx.equipment.update({ where: { id: current.equipmentId }, data: eqData })
      }
      return ev
    })
    return NextResponse.json(event)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const eventId = parseInt(id)
    const current = await prisma.equipmentEvent.findUnique({ where: { id: eventId } })
    if (!current) return NextResponse.json({ error: 'ไม่พบใบงาน' }, { status: 404 })

    await prisma.$transaction(async (tx) => {
      await tx.equipmentEvent.delete({ where: { id: eventId } })

      const eqData: Record<string, unknown> = {}

      // ลบใบงานที่ยังไม่รับกลับ → ถ้าไม่เหลือใบงานเปิดอื่น ให้เครื่องกลับ ACTIVE (ไม่ค้าง CALIBRATING/BROKEN)
      if (!current.returnedDate) {
        const stillOpen = await tx.equipmentEvent.count({
          where: { equipmentId: current.equipmentId, returnedDate: null },
        })
        if (stillOpen === 0) {
          const eq = await tx.equipment.findUnique({ where: { id: current.equipmentId }, select: { status: true } })
          if (eq && eq.status !== 'RETIRED') eqData.status = 'ACTIVE'
        }
      }

      // Cal event = source of truth ของแผน Cal → recompute calDueDate หลังลบ (ลบประวัติแล้วต้องหลุดจากแผน)
      if (current.type === 'CALIBRATION') {
        const latest = await tx.equipmentEvent.findFirst({
          where: { equipmentId: current.equipmentId, type: 'CALIBRATION', returnedDate: { not: null } },
          orderBy: { sentDate: 'desc' },
        })
        eqData.calDueDate = latest?.nextDueDate ?? null
      }
      if (Object.keys(eqData).length > 0) {
        await tx.equipment.update({ where: { id: current.equipmentId }, data: eqData })
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
