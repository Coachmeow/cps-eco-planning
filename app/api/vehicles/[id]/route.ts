import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// รายละเอียดรถ + ปริมาณใช้งานสะสม (วันจอง) + ประวัติการจอง
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vId = parseInt(id)
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vId } })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })
  const usageDays = await prisma.vehicleBooking.count({ where: { vehicleId: vId } })
  const bookings = await prisma.vehicleBooking.findMany({
    where: { vehicleId: vId, parentId: null }, orderBy: { assignedDate: 'desc' }, take: 50,
    include: { site: true, driver: true },
  })
  const { photoUrl, ...v } = vehicle
  return NextResponse.json({ ...v, hasPhoto: !!photoUrl, usageDays, bookings })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const vehicle = await prisma.vehicle.update({
      where: { id: parseInt(id) },
      data: {
        licensePlate: body.licensePlate,
        name:         body.name        || null,
        vehicleType:  body.vehicleType || null,
        brand:        body.brand       || null,
        model:        body.model       || null,
        seats:        body.seats != null && body.seats !== '' ? parseInt(body.seats) : null,
        status:       body.status      ?? 'ACTIVE',
        notes:        body.notes       || null,
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl || null } : {}),
      },
    })
    return NextResponse.json(vehicle)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const vId = parseInt(id)
    await prisma.vehicleBooking.deleteMany({ where: { vehicleId: vId } })
    await prisma.vehicle.delete({ where: { id: vId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
