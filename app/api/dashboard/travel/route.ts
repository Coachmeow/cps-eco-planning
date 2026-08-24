import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchProvince } from '@/lib/thailandGeo'
import { toDateKey } from '@/lib/dateKey'

// เส้นทางเดินทางของรถในวันที่กำหนด — ฐาน (สระบุรี) → จังหวัดไซต์
// ดึงจาก VehicleBooking (purpose FIELD) วันนั้น ; dedup ต่อคัน เก็บ estimatedDays สูงสุด
export async function GET(req: NextRequest) {
  const dk = req.nextUrl.searchParams.get('date') ?? toDateKey(new Date())
  const [y, m, d] = dk.split('-').map(Number)
  const day = new Date(y, m - 1, d)

  const bookings = await prisma.vehicleBooking.findMany({
    where: { assignedDate: { gte: day, lte: day }, siteId: { not: null }, purpose: 'FIELD' },
    select: {
      estimatedDays: true,
      vehicle: { select: { licensePlate: true, name: true } },
      driver: { select: { nickname: true, fullName: true, primaryTeam: { select: { code: true } } } },
      driverName: true,
      site: { select: { province: true, code: true, name: true } },
    },
  })

  interface Trip { plate: string; driver: string; team: string; site: string; prov: string; days: number }
  const byPlate = new Map<string, Trip>()
  for (const b of bookings) {
    const prov = matchProvince(b.site?.province)
    if (!prov) continue
    const plate = b.vehicle.licensePlate
    const days = Number(b.estimatedDays)
    const ex = byPlate.get(plate)
    if (ex) { if (days > ex.days) ex.days = days; continue }
    byPlate.set(plate, {
      plate,
      driver: b.driver?.nickname || b.driver?.fullName || b.driverName || '—',
      team: b.driver?.primaryTeam.code || 'LOG',
      site: b.site?.code || b.site?.name || '—',
      prov,
      days,
    })
  }

  const trips = [...byPlate.values()].sort((a, b) => a.prov.localeCompare(b.prov, 'th'))
  return NextResponse.json({ date: toDateKey(day), trips })
}
