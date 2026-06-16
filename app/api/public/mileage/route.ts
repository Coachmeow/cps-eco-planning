import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// public (ไม่ล็อกอิน) — บันทึก log ไมล์รถจากหน้า QR
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, type } = body
  if (!token || !type || body.mileage == null || body.mileage === '') {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }
  const vehicle = await prisma.vehicle.findUnique({ where: { qrToken: token }, select: { id: true } })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })

  const forDate = body.forDate ? new Date(body.forDate) : new Date(toDateKey(new Date()))

  // หา booking ของวันนั้นเพื่อ auto-link
  const booking = await prisma.vehicleBooking.findFirst({
    where: { vehicleId: vehicle.id, assignedDate: forDate },
    select: { id: true },
  })

  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : null)
  const log = await prisma.vehicleLog.create({
    data: {
      vehicleId:  vehicle.id,
      type,
      mileage:    parseInt(String(body.mileage)),
      forDate,
      driverId:   body.driverId ? parseInt(String(body.driverId)) : null,
      driverName: body.driverName || null,
      purpose:    body.purpose || null,
      siteId:     body.siteId ? parseInt(String(body.siteId)) : null,
      bookingId:  booking?.id ?? null,
      origin:      body.origin || null,
      destination: body.destination || null,
      nonField:    !!body.nonField,
      reason:      body.reason || null,
      fuelLiters:        num(body.fuelLiters),
      fuelPricePerLiter: num(body.fuelPricePerLiter),
      fuelCost:          num(body.fuelCost),
      mismatch:        !!body.mismatch,
      expectedMileage: body.expectedMileage != null && body.expectedMileage !== '' ? parseInt(String(body.expectedMileage)) : null,
      notes:       body.notes || null,
    },
  })
  return NextResponse.json({ ok: true, id: log.id }, { status: 201 })
}
