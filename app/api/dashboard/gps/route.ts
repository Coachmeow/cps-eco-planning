import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// สรุป GPS ต่อคันของ "วันที่เลือก" + geofence ไซต์ (สำหรับแผนที่) + เทียบเลขไมล์คนกรอก
// วันที่: forDate เก็บเป็น date (UTC midnight) · เวลาใน record เป็นไทย (UTC-naive) → client format ด้วย UTC
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dateParam = searchParams.get('date')

  // วันล่าสุดที่มีข้อมูล (ใช้เป็น default + ทำตัวเลือกวันที่)
  const distinctDays = await prisma.vehicleGpsDay.findMany({
    distinct: ['forDate'], select: { forDate: true }, orderBy: { forDate: 'desc' }, take: 120,
  })
  const availableDates = distinctDays.map((d) => d.forDate.toISOString().slice(0, 10))

  const date = dateParam || availableDates[0] || new Date().toISOString().slice(0, 10)
  const forDate = new Date(`${date}T00:00:00.000Z`)

  const days = await prisma.vehicleGpsDay.findMany({
    where: { forDate },
    include: {
      vehicle: { select: { id: true, licensePlate: true, name: true } },
      visits: {
        orderBy: { arriveAt: 'asc' },
        include: { site: { select: { id: true, code: true, name: true, color: true } } },
      },
    },
    orderBy: { distanceKm: 'desc' },
  })

  // เลขไมล์คนกรอก (ทริปปิดแล้วของวันนั้น) → เทียบกับ GPS
  const trips = await prisma.vehicleTrip.findMany({
    where: { forDate, mileageIn: { not: null } },
    select: { vehicleId: true, mileageOut: true, mileageIn: true },
  })
  const manualKm = new Map<number, number>()
  for (const t of trips) {
    if (t.mileageIn == null) continue
    const km = t.mileageIn - t.mileageOut
    if (km >= 0) manualKm.set(t.vehicleId, (manualKm.get(t.vehicleId) ?? 0) + km)
  }

  const vehicles = days.map((d) => {
    const manual = manualKm.get(d.vehicleId) ?? null
    return {
      vehicleId: d.vehicleId,
      plate: d.vehicle.licensePlate,
      name: d.vehicle.name,
      distanceKm: d.distanceKm,
      movingMin: d.movingMin,
      idleMin: d.idleMin,
      tripCount: d.tripCount,
      maxSpeed: d.maxSpeed,
      firstMoveAt: d.firstMoveAt,
      lastStopAt: d.lastStopAt,
      driverName: d.driverName,
      path: (d.pathJson as [number, number][] | null) ?? [],
      manualKm: manual,
      mileageDelta: manual != null ? Math.round((d.distanceKm - manual) * 10) / 10 : null,
      visits: d.visits.map((v) => ({
        siteId: v.siteId,
        siteCode: v.site?.code ?? null,
        siteName: v.site?.name ?? null,
        siteColor: v.site?.color ?? null,
        rawPlace: v.rawPlace,
        lat: v.lat, lng: v.lng,
        arriveAt: v.arriveAt, departAt: v.departAt, dwellMin: v.dwellMin,
      })),
    }
  })

  // geofence ทุกไซต์ (วาดบนแผนที่)
  const gf = await prisma.siteGeofence.findMany({
    include: { site: { select: { id: true, code: true, name: true, color: true } } },
  })
  const geofences = gf.map((g) => ({
    siteId: g.siteId,
    siteCode: g.site.code,
    siteName: g.site.name,
    color: g.site.color,
    kind: g.kind,
    centerLat: g.centerLat, centerLng: g.centerLng, radiusM: g.radiusM,
    points: g.points,
  }))

  return NextResponse.json({ date, availableDates, vehicles, geofences })
}
