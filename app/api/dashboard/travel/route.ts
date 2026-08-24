import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchProvince } from '@/lib/thailandGeo'
import { toDateKey } from '@/lib/dateKey'

const BASE_PROV = 'สระบุรี' // ที่ตั้งหน่วยงาน (ฐาน)

// รถที่ "ออกเดินทางไปไซต์ใหม่" ในวันที่กำหนด = ไซต์วันนี้ ≠ ไซต์เมื่อวาน (หรือเมื่อวานว่าง = ออกจากฐาน)
//  ต้นทาง = ไซต์เมื่อวาน (ถ้าว่าง = ฐานสระบุรี) · ปลายทาง = ไซต์วันนี้
//  cross = ย้ายข้ามจังหวัด (วาดเส้นบนแผนที่ได้) ; ในจังหวัดเดียวกัน/ไม่ระบุจังหวัด = โชว์เฉพาะในรายการ
export async function GET(req: NextRequest) {
  const dk = req.nextUrl.searchParams.get('date') ?? toDateKey(new Date())
  const [y, m, d] = dk.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const prevDay = new Date(day); prevDay.setDate(day.getDate() - 1)

  const sel = {
    estimatedDays: true,
    vehicleId: true,
    siteId: true,
    vehicle: { select: { licensePlate: true, name: true, vehicleType: true } },
    driver: { select: { nickname: true, fullName: true, phone: true, primaryTeam: { select: { code: true } } } },
    driverName: true,
    site: { select: { province: true, code: true, name: true } },
  }
  const [onDay, onPrev] = await Promise.all([
    prisma.vehicleBooking.findMany({ where: { assignedDate: { gte: day, lte: day }, siteId: { not: null }, purpose: 'FIELD' }, select: sel }),
    prisma.vehicleBooking.findMany({ where: { assignedDate: { gte: prevDay, lte: prevDay }, siteId: { not: null }, purpose: 'FIELD' }, select: { vehicleId: true, siteId: true, site: { select: { province: true, code: true } } } }),
  ])

  // ตำแหน่งเมื่อวานต่อคัน
  const prevByVeh = new Map<number, { siteId: number | null; prov: string | null; code: string | null }>()
  for (const b of onPrev) {
    if (!prevByVeh.has(b.vehicleId)) prevByVeh.set(b.vehicleId, { siteId: b.siteId, prov: matchProvince(b.site?.province), code: b.site?.code ?? null })
  }

  // งานวันนี้ต่อคัน (คันละ 1 ปลายทาง)
  const dayByVeh = new Map<number, (typeof onDay)[number]>()
  for (const b of onDay) if (!dayByVeh.has(b.vehicleId)) dayByVeh.set(b.vehicleId, b)

  interface Trip {
    plate: string; vtype: string | null; driver: string; tel: string | null; team: string
    fromProv: string | null; fromSite: string | null; fromBase: boolean
    toProv: string | null; toSite: string; days: number; cross: boolean
  }
  const trips: Trip[] = []
  for (const [vid, b] of dayByVeh) {
    const prev = prevByVeh.get(vid)
    // อยู่ไซต์เดิมต่อ (siteId เดียวกับเมื่อวาน) = ไม่ใช่การเดินทางใหม่
    if (prev && prev.siteId === b.siteId) continue
    const toProv = matchProvince(b.site?.province)
    const fromProv = prev ? prev.prov : BASE_PROV
    const cross = !!(fromProv && toProv && fromProv !== toProv)
    trips.push({
      plate: b.vehicle.licensePlate,
      vtype: b.vehicle.vehicleType ?? null,
      driver: b.driver?.nickname || b.driver?.fullName || b.driverName || '—',
      tel: b.driver?.phone ?? null,
      team: b.driver?.primaryTeam.code || 'LOG',
      fromProv,
      fromSite: prev ? prev.code : null,
      fromBase: !prev,
      toProv,
      toSite: b.site?.code || b.site?.name || '—',
      days: Number(b.estimatedDays),
      cross,
    })
  }

  // เรียง: ข้ามจังหวัดก่อน แล้วตามชื่อปลายทาง
  trips.sort((a, b) => Number(b.cross) - Number(a.cross) || (a.toProv ?? a.toSite).localeCompare(b.toProv ?? b.toSite, 'th'))
  return NextResponse.json({ date: toDateKey(day), trips })
}
