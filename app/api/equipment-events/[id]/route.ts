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

    const data: Record<string, unknown> = {}
    if (body.expectedDate !== undefined) data.expectedDate = body.expectedDate ? new Date(body.expectedDate) : null
    if (body.nextDueDate  !== undefined) data.nextDueDate  = body.nextDueDate  ? new Date(body.nextDueDate)  : null
    if (body.vendor       !== undefined) data.vendor       = body.vendor || null
    if (body.cost         !== undefined) data.cost         = body.cost != null && body.cost !== '' ? parseInt(body.cost) : null
    if (body.notes        !== undefined) data.notes        = body.notes || null
    if (body.returnedDate !== undefined) data.returnedDate = body.returnedDate ? new Date(body.returnedDate) : null

    const event = await prisma.equipmentEvent.update({ where: { id: eventId }, data })

    // ถ้ารับกลับ → เครื่องกลับมา ACTIVE; ถ้าเป็น Cal และมีกำหนดถัดไป → อัปเดต calDueDate
    if (body.returnedDate) {
      const eqData: Record<string, unknown> = { status: 'ACTIVE' }
      const nextDue = body.nextDueDate ?? current.nextDueDate
      if (current.type === 'CALIBRATION' && nextDue) eqData.calDueDate = new Date(nextDue)
      await prisma.equipment.update({ where: { id: current.equipmentId }, data: eqData })
    }
    return NextResponse.json(event)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    await prisma.equipmentEvent.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
