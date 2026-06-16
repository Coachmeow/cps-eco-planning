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

  // ไมล์ล่าสุด + คนขับคนก่อน
  const lastLog = await prisma.vehicleLog.findFirst({
    where: { vehicleId: vehicle.id }, orderBy: { mileage: 'desc' },
    include: { driver: { select: { nickname: true, fullName: true } } },
  })

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
    lastMileage: lastLog?.mileage ?? null,
    lastDriver:  lastLog ? (lastLog.driver?.nickname ?? lastLog.driver?.fullName ?? lastLog.driverName) : null,
    todayBooking: booking ? {
      purpose: booking.purpose, siteId: booking.siteId, siteCode: booking.site?.code ?? null,
      destination: booking.destination, driverId: booking.driverId,
    } : null,
    employees, sites,
  })
}
