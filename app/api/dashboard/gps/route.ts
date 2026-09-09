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

  // เวลานำเข้าไฟล์ GPS ล่าสุด (ทั้งระบบ) — โชว์ข้าง ๆ ปุ่มอัปโหลด
  const latest = await prisma.vehicleGpsDay.findFirst({
    orderBy: { updatedAt: 'desc' }, select: { updatedAt: true, forDate: true },
  })
  const lastImportAt = latest?.updatedAt.toISOString() ?? null
  const lastImportForDate = latest ? latest.forDate.toISOString().slice(0, 10) : null

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

  // แผนใช้รถของวันนั้น (ปฏิทินใช้รถ) → ไซต์+คนขับที่ถูก assign (ไว้เทียบกับ GPS จริง)
  const bookings = await prisma.vehicleBooking.findMany({
    where: { assignedDate: forDate },
    include: {
      site:   { select: { code: true, name: true, color: true } },
      driver: { select: { fullName: true, nickname: true } },
    },
  })
  type AssignedSite = { code: string | null; name: string; color: string | null; tentative: boolean }
  const assignedByVeh = new Map<number, { sites: AssignedSite[]; drivers: string[] }>()
  for (const b of bookings) {
    const cur = assignedByVeh.get(b.vehicleId) ?? { sites: [], drivers: [] }
    // ไซต์ที่ assign — ในระบบ (site) หรือปลายทางพิมพ์อิสระ (งานนอก)
    const name = b.site?.name ?? b.destination ?? null
    if (name) {
      const code = b.site?.code ?? null
      const key = `${code ?? ''}|${name}`
      if (!cur.sites.some((s) => `${s.code ?? ''}|${s.name}` === key)) {
        cur.sites.push({ code, name, color: b.site?.color ?? null, tentative: b.isTentative })
      }
    }
    // คนขับที่ assign — ในระบบ (driver) หรือชื่อพิมพ์อิสระ
    const drv = b.driver ? (b.driver.nickname || b.driver.fullName) : (b.driverName || null)
    if (drv && !cur.drivers.includes(drv)) cur.drivers.push(drv)
    assignedByVeh.set(b.vehicleId, cur)
  }

  const vehicles = days.map((d) => {
    const manual = manualKm.get(d.vehicleId) ?? null
    const assigned = assignedByVeh.get(d.vehicleId) ?? null
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
      speed: (d.speedJson as [number, number, number, string][] | null) ?? null,
      overspeedPct: d.overspeedPct,
      manualKm: manual,
      mileageDelta: manual != null ? Math.round((d.distanceKm - manual) * 10) / 10 : null,
      assigned,
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

  return NextResponse.json({ date, availableDates, lastImportAt, lastImportForDate, vehicles, geofences })
}
