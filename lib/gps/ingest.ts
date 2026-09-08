import { prisma } from '@/lib/prisma'
import { parseCartrack, normalizePlate, type GpsPing } from '@/lib/gps/parseCartrack'
import { processDay } from '@/lib/gps/processDay'
import type { GeofenceShape } from '@/lib/geofence'

export interface IngestReport {
  ok: boolean
  totalPings: number
  days: string[]
  savedDays: number
  savedVisits: number
  matchedVehicles: number
  skipped: { plate: string; day: string; pings: number }[]
}

// ประมวลผลไฟล์ Cartrack (.xls buffer) → คำนวณ + upsert สรุปต่อคัน/ต่อวัน
// ใช้ร่วมทั้งอัปโหลดเอง (/api/gps/upload) และดึงอัตโนมัติจาก Gmail (/api/gps/ingest)
export async function processGpsBuffer(buf: Buffer, sourceName: string): Promise<IngestReport> {
  const pings = parseCartrack(buf)
  if (pings.length === 0) throw new Error('อ่านไฟล์ไม่สำเร็จ หรือไม่มีข้อมูล GPS')

  // แผนที่ทะเบียน → รถในระบบ
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, licensePlate: true } })
  const plateToId = new Map<string, number>()
  for (const v of vehicles) plateToId.set(normalizePlate(v.licensePlate), v.id)

  // geofence ทุกไซต์ (โหลดครั้งเดียว)
  const gfRows = await prisma.siteGeofence.findMany({
    select: { siteId: true, kind: true, centerLat: true, centerLng: true, radiusM: true, points: true },
  })
  const geofences: GeofenceShape[] = gfRows.map((g) => ({
    siteId: g.siteId, kind: g.kind, centerLat: g.centerLat, centerLng: g.centerLng, radiusM: g.radiusM, points: g.points,
  }))

  // group ตาม (ทะเบียน, วัน)
  const groups = new Map<string, GpsPing[]>()
  for (const p of pings) {
    const key = `${p.plate}|${p.dayKey}`
    const arr = groups.get(key); if (arr) arr.push(p); else groups.set(key, [p])
  }

  let savedDays = 0, savedVisits = 0
  const matchedPlates = new Set<string>()
  const skipped: { plate: string; day: string; pings: number }[] = []
  const days = new Set<string>()

  for (const [key, groupPings] of groups) {
    const [plate, day] = key.split('|')
    days.add(day)
    const vehicleId = plateToId.get(plate)
    if (!vehicleId) { skipped.push({ plate, day, pings: groupPings.length }); continue }
    matchedPlates.add(plate)

    const s = processDay(groupPings, geofences)
    const forDate = new Date(`${day}T00:00:00.000Z`)
    const data = {
      distanceKm: s.distanceKm, movingMin: s.movingMin, idleMin: s.idleMin,
      tripCount: s.tripCount, maxSpeed: s.maxSpeed,
      firstMoveAt: s.firstMoveAt, lastStopAt: s.lastStopAt,
      matchedPlate: plate, driverName: s.driverName,
      pathJson: s.path, speedJson: s.speedSeries, overspeedPct: s.overspeedPct,
      sourceRef: sourceName,
    }
    const gpsDay = await prisma.vehicleGpsDay.upsert({
      where: { vehicleId_forDate: { vehicleId, forDate } },
      create: { vehicleId, forDate, ...data },
      update: data,
    })

    // แทนที่จุดจอดทั้งชุด
    await prisma.vehicleGpsVisit.deleteMany({ where: { gpsDayId: gpsDay.id } })
    if (s.stops.length > 0) {
      await prisma.vehicleGpsVisit.createMany({
        data: s.stops.map((v) => ({
          gpsDayId: gpsDay.id, siteId: v.siteId, rawPlace: v.place || null,
          lat: v.lat, lng: v.lng, arriveAt: v.arriveAt, departAt: v.departAt, dwellMin: v.dwellMin,
        })),
      })
      savedVisits += s.stops.length
    }
    savedDays++
  }

  return {
    ok: true,
    totalPings: pings.length,
    days: [...days].sort(),
    savedDays,
    savedVisits,
    matchedVehicles: matchedPlates.size,
    skipped: skipped.sort((a, b) => b.pings - a.pings),
  }
}
