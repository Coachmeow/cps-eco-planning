import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// รายการทริปการใช้รถ (admin) — กรองช่วงวัน + รถ
export async function GET(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const vehicleId = searchParams.get('vehicleId')

  const trips = await prisma.vehicleTrip.findMany({
    where: {
      ...(vehicleId ? { vehicleId: parseInt(vehicleId) } : {}),
      ...(from || to ? { forDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: {
      vehicle: { select: { id: true, licensePlate: true, name: true } },
      driver:  { select: { nickname: true, fullName: true } },
      site:    { select: { code: true, name: true } },
      booking: { select: { site: { select: { code: true, name: true } } } },
    },
    orderBy: [{ vehicleId: 'asc' }, { startedAt: 'asc' }],
  })

  // ทำให้ frontend ใช้ง่าย: planSite = ไซต์ตามแผน (booking) ถ้าไม่มีใช้ไซต์ที่กรอกตอนสแกน
  const rows = trips.map(t => ({
    id: t.id,
    vehicleId: t.vehicleId,
    plate: t.vehicle.licensePlate,
    vehicleName: t.vehicle.name,
    forDate: t.forDate,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    origin: t.origin,
    destination: t.destination,
    mileageOut: t.mileageOut,
    mileageIn: t.mileageIn,
    distance: t.mileageIn != null ? t.mileageIn - t.mileageOut : null,
    purpose: t.purpose,
    siteCode: t.booking?.site?.code ?? t.site?.code ?? null,
    siteName: t.booking?.site?.name ?? t.site?.name ?? null,
    driver: t.driver?.nickname ?? t.driver?.fullName ?? t.driverName ?? null,
    nonField: t.nonField,
    reason: t.reason,
    mismatch: t.mismatch,
    expectedMileage: t.expectedMileage,
    notes: t.notes,
    open: t.mileageIn == null,
  }))
  return NextResponse.json(rows)
}
