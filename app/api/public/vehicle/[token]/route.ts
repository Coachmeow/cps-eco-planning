import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// public (ไม่ล็อกอิน) — ข้อมูลรถสำหรับหน้า logbook QR
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where:  { qrToken: token },
    select: { id: true, licensePlate: true, name: true, vehicleType: true, brand: true, model: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })

  // ทริปที่ยังเปิดอยู่ (ยังไม่ปิด = mileageIn null) — ถ้ามีต้องปิดก่อนเริ่มใหม่
  const openTrip = await prisma.vehicleTrip.findFirst({
    where: { vehicleId: vehicle.id, mileageIn: null },
    orderBy: { startedAt: 'desc' },
    include: { driver: { select: { nickname: true, fullName: true } }, site: { select: { code: true, name: true } } },
  })

  // ไมล์ล่าสุดในระบบ = ค่าสูงสุดจากทั้งทริป (out/in) และ refuel log
  const [lastTrip, lastRefuel] = await Promise.all([
    prisma.vehicleTrip.findFirst({
      where: { vehicleId: vehicle.id }, orderBy: { startedAt: 'desc' },
      include: { driver: { select: { nickname: true, fullName: true } } },
    }),
    prisma.vehicleLog.findFirst({
      where: { vehicleId: vehicle.id, type: 'REFUEL' }, orderBy: { mileage: 'desc' },
      include: { driver: { select: { nickname: true, fullName: true } } },
    }),
  ])
  const tripMileage = lastTrip ? (lastTrip.mileageIn ?? lastTrip.mileageOut) : null
  const refuelMileage = lastRefuel?.mileage ?? null
  const lastMileage = [tripMileage, refuelMileage].filter((v): v is number => v != null).reduce<number | null>((a, b) => (a == null ? b : Math.max(a, b)), null)
  const lastDriverFrom = (tripMileage != null && (refuelMileage == null || tripMileage >= refuelMileage)) ? lastTrip : lastRefuel
  const lastDriver = lastDriverFrom ? (lastDriverFrom.driver?.nickname ?? lastDriverFrom.driver?.fullName ?? lastDriverFrom.driverName) : null

  // การจองของวันนี้ (prefill)
  const today = new Date(toDateKey(new Date()))
  const booking = await prisma.vehicleBooking.findFirst({
    where: { vehicleId: vehicle.id, assignedDate: today },
    include: { site: { select: { id: true, code: true, name: true } }, driver: { select: { id: true, nickname: true, fullName: true } } },
  })

  const employees = await prisma.employee.findMany({
    where: { isActive: true }, select: { id: true, nickname: true, fullName: true },
    orderBy: [{ primaryTeam: { sortOrder: 'asc' } }, { fullName: 'asc' }],
  })
  const sites = await prisma.site.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } })

  return NextResponse.json({
    vehicle,
    lastMileage,
    lastDriver,
    openTrip: openTrip ? {
      id: openTrip.id,
      origin: openTrip.origin,
      mileageOut: openTrip.mileageOut,
      startedAt: openTrip.startedAt,
      purpose: openTrip.purpose,
      siteCode: openTrip.site?.code ?? null,
      driver: openTrip.driver?.nickname ?? openTrip.driver?.fullName ?? openTrip.driverName ?? null,
    } : null,
    todayBooking: booking ? {
      purpose: booking.purpose, siteId: booking.siteId, siteCode: booking.site?.code ?? null,
      destination: booking.destination, driverId: booking.driverId,
    } : null,
    employees, sites,
  })
}
