import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// public (ไม่ล็อกอิน) — เริ่ม/ปิดทริปการใช้รถจากหน้า QR
// action: 'start' → สร้างทริปใหม่ (ต้นทาง + ไมล์ออก)
// action: 'close' → ปิดทริปที่เปิดอยู่ (ปลายทาง + ไมล์จอด)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action } = body
  if (!token || !action) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })

  const vehicle = await prisma.vehicle.findUnique({ where: { qrToken: token }, select: { id: true } })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })

  const num = (v: unknown) => (v != null && v !== '' ? parseInt(String(v)) : null)

  if (action === 'start') {
    if (body.mileageOut == null || body.mileageOut === '') {
      return NextResponse.json({ error: 'กรอกเลขไมล์ตอนออกรถ' }, { status: 400 })
    }
    // กันเปิดซ้ำ — ถ้ายังมีทริปค้างให้ปิดก่อน
    const existing = await prisma.vehicleTrip.findFirst({ where: { vehicleId: vehicle.id, mileageIn: null } })
    if (existing) return NextResponse.json({ error: 'มีทริปที่ยังไม่ปิดอยู่ กรุณาปิดทริปก่อน' }, { status: 409 })

    const forDate = body.forDate ? new Date(body.forDate) : new Date(toDateKey(new Date()))
    // auto-link booking ของวันนั้น
    const booking = await prisma.vehicleBooking.findFirst({
      where: { vehicleId: vehicle.id, assignedDate: forDate }, select: { id: true },
    })
    const trip = await prisma.vehicleTrip.create({
      data: {
        vehicleId:  vehicle.id,
        driverId:   num(body.driverId),
        driverName: body.driverName || null,
        purpose:    body.purpose || null,
        siteId:     num(body.siteId),
        bookingId:  booking?.id ?? null,
        forDate,
        origin:     body.origin || null,
        mileageOut: parseInt(String(body.mileageOut)),
        nonField:   !!body.nonField,
        reason:     body.reason || null,
        mismatch:        !!body.mismatch,
        expectedMileage: num(body.expectedMileage),
        notes:      body.notes || null,
      },
    })
    return NextResponse.json({ ok: true, id: trip.id, action: 'start' }, { status: 201 })
  }

  if (action === 'close') {
    if (body.mileageIn == null || body.mileageIn === '') {
      return NextResponse.json({ error: 'กรอกเลขไมล์ตอนจอดรถ' }, { status: 400 })
    }
    const open = await prisma.vehicleTrip.findFirst({
      where: { vehicleId: vehicle.id, mileageIn: null }, orderBy: { startedAt: 'desc' },
    })
    if (!open) return NextResponse.json({ error: 'ไม่พบทริปที่เปิดอยู่' }, { status: 404 })

    const mileageIn = parseInt(String(body.mileageIn))
    const trip = await prisma.vehicleTrip.update({
      where: { id: open.id },
      data: {
        mileageIn,
        endedAt:     new Date(),
        destination: body.destination || null,
        notes:       body.notes ? (open.notes ? `${open.notes} | ${body.notes}` : body.notes) : open.notes,
      },
    })
    return NextResponse.json({ ok: true, id: trip.id, action: 'close', distance: mileageIn - open.mileageOut }, { status: 200 })
  }

  return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
}
