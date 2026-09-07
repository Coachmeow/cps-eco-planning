import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'
import { parseCartrack, normalizePlate } from '@/lib/gps/parseCartrack'
import { processDay } from '@/lib/gps/processDay'
import type { GeofenceShape } from '@/lib/geofence'
import type { GpsPing } from '@/lib/gps/parseCartrack'

// อัปโหลดไฟล์ Cartrack (.xls) รายวัน → คำนวณ+บันทึกสรุปต่อคัน/ต่อวัน (bootstrap ของ auto Gmail)
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const pings = parseCartrack(buf)
    if (pings.length === 0) return NextResponse.json({ error: 'อ่านไฟล์ไม่สำเร็จ หรือไม่มีข้อมูล GPS' }, { status: 400 })

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

      const gpsDay = await prisma.vehicleGpsDay.upsert({
        where: { vehicleId_forDate: { vehicleId, forDate } },
        create: {
          vehicleId, forDate,
          distanceKm: s.distanceKm, movingMin: s.movingMin, idleMin: s.idleMin,
          tripCount: s.tripCount, maxSpeed: s.maxSpeed,
          firstMoveAt: s.firstMoveAt, lastStopAt: s.lastStopAt,
          matchedPlate: plate, driverName: s.driverName,
          pathJson: s.path, sourceRef: `upload:${file.name}`,
        },
        update: {
          distanceKm: s.distanceKm, movingMin: s.movingMin, idleMin: s.idleMin,
          tripCount: s.tripCount, maxSpeed: s.maxSpeed,
          firstMoveAt: s.firstMoveAt, lastStopAt: s.lastStopAt,
          matchedPlate: plate, driverName: s.driverName,
          pathJson: s.path, sourceRef: `upload:${file.name}`,
        },
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

    return NextResponse.json({
      ok: true,
      totalPings: pings.length,
      days: [...days].sort(),
      savedDays,
      savedVisits,
      matchedVehicles: matchedPlates.size,
      skipped: skipped.sort((a, b) => b.pings - a.pings),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
