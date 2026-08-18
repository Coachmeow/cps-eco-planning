import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, getSession, hasRole, forbidden } from '@/lib/auth'

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
  // ไมล์: ล่าสุด, log ล่าสุด, mismatch ที่ยังไม่เคลียร์
  const logs = await prisma.vehicleLog.findMany({
    where: { vehicleId: vId }, orderBy: { loggedAt: 'desc' }, take: 20,
    include: { driver: { select: { nickname: true, fullName: true } }, site: { select: { code: true } } },
  })
  const trips = await prisma.vehicleTrip.findMany({
    where: { vehicleId: vId }, orderBy: { startedAt: 'desc' }, take: 20,
    include: { driver: { select: { nickname: true, fullName: true } }, site: { select: { code: true } } },
  })
  // ไมล์ล่าสุด = สูงสุดจากทั้ง log (refuel/legacy) และทริป (out/in)
  const logMax  = logs.reduce((mx, l) => Math.max(mx, l.mileage), 0)
  const tripMax = trips.reduce((mx, t) => Math.max(mx, t.mileageIn ?? t.mileageOut), 0)
  const lastMileage = Math.max(logMax, tripMax) || null

  // mismatch รวมจาก log + ทริป → รูปแบบเดียวกัน (เรียงใหม่→เก่า)
  const mismatches = [
    ...logs.filter(l => l.mismatch).map(l => ({ id: `L${l.id}`, loggedAt: l.loggedAt, mileage: l.mileage, expectedMileage: l.expectedMileage })),
    ...trips.filter(t => t.mismatch).map(t => ({ id: `T${t.id}`, loggedAt: t.startedAt, mileage: t.mileageOut, expectedMileage: t.expectedMileage })),
  ].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())

  const { photoUrl, ...v } = vehicle
  return NextResponse.json({ ...v, hasPhoto: !!photoUrl, usageDays, bookings, lastMileage, logs, mismatches })
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const vId = parseInt(id)
    const v = await prisma.vehicle.findUnique({ where: { id: vId } })
    if (!v) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })

    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }

    const [bookings, logsCount, tripsCount] = await Promise.all([
      prisma.vehicleBooking.count({ where: { vehicleId: vId } }),
      prisma.vehicleLog.count({ where: { vehicleId: vId } }),
      prisma.vehicleTrip.count({ where: { vehicleId: vId } }),
    ])
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photoUrl, ...vNoPhoto } = v
    const snapshot = JSON.parse(JSON.stringify({ vehicle: vNoPhoto, bookings, logsCount, tripsCount, hadPhoto: !!photoUrl }))

    // ลบลูกก่อน (FK): log + ทริป อ้าง booking + vehicle ; แล้วค่อยลบ booking และ vehicle
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({
        data: {
          entityType: 'vehicle', entityLabel: `${v.licensePlate}${v.name ? ` (${v.name})` : ''}`,
          reason, snapshot, deletedById: session!.uid, deletedByName: session!.name || session!.username || '—',
        },
      })
      await tx.vehicleLog.deleteMany({ where: { vehicleId: vId } })
      await tx.vehicleTrip.deleteMany({ where: { vehicleId: vId } })
      await tx.vehicleBooking.deleteMany({ where: { vehicleId: vId } })
      await tx.vehicle.delete({ where: { id: vId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
