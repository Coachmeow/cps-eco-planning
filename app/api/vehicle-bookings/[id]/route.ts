import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const targetId = parseInt(id)
  const target = await prisma.vehicleBooking.findUnique({ where: { id: targetId } })
  if (!target) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 })

  if (target.parentId == null) {
    // วันแม่ → ลบทั้งงาน (ลูกหายตาม)
    await prisma.vehicleBooking.deleteMany({ where: { parentId: targetId } })
    await prisma.vehicleBooking.delete({ where: { id: targetId } })
  } else {
    // วันลูก → ลบเฉพาะวันนั้น แล้วลดจำนวนวันที่ตัวแม่ให้ตรง
    await prisma.vehicleBooking.delete({ where: { id: targetId } })
    const remaining = await prisma.vehicleBooking.count({ where: { parentId: target.parentId } })
    await prisma.vehicleBooking.update({ where: { id: target.parentId }, data: { estimatedDays: 1 + remaining } })
  }
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.purpose      !== undefined) data.purpose     = body.purpose
  if (body.siteId       !== undefined) data.siteId      = body.siteId ? parseInt(body.siteId) : null
  if (body.destination  !== undefined) data.destination = body.destination || null
  if (body.driverId     !== undefined) data.driverId    = body.driverId ? parseInt(body.driverId) : null
  if (body.driverName   !== undefined) data.driverName  = body.driverName || null
  if (body.notes        !== undefined) data.notes       = body.notes || null
  const updated = await prisma.vehicleBooking.update({
    where: { id: parseInt(id) }, data,
    include: { vehicle: true, site: true, driver: true },
  })
  return NextResponse.json(updated)
}
