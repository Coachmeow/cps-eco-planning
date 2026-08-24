import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchProvince } from '@/lib/thailandGeo'
import { toDateKey } from '@/lib/dateKey'

const BASE_PROV = 'สระบุรี' // ที่ตั้งหน่วยงาน (ฐาน) — origin เมื่อเมื่อวานไม่มีงาน

// เส้นทางเดินทาง "เฉพาะวันที่มีการย้ายข้ามจังหวัดจริง" ในวันที่กำหนด
//  ต้นทาง = จังหวัดไซต์ของ "เมื่อวาน" (ถ้าเมื่อวานไม่มีงาน = ฐานสระบุรี)
//  ปลายทาง = จังหวัดไซต์ของ "วันนี้"
//  แสดงเฉพาะรถที่ จังหวัดปลายทาง ≠ จังหวัดต้นทาง (อยู่ไซต์เดิมต่อ = ไม่นับเป็นเดินทาง)
export async function GET(req: NextRequest) {
  const dk = req.nextUrl.searchParams.get('date') ?? toDateKey(new Date())
  const [y, m, d] = dk.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const prevDay = new Date(day); prevDay.setDate(day.getDate() - 1)

  const sel = {
    estimatedDays: true,
    vehicleId: true,
    vehicle: { select: { licensePlate: true, name: true } },
    driver: { select: { nickname: true, fullName: true, primaryTeam: { select: { code: true } } } },
    driverName: true,
    site: { select: { province: true, code: true, name: true } },
  }
  const [onDay, onPrev] = await Promise.all([
    prisma.vehicleBooking.findMany({ where: { assignedDate: { gte: day, lte: day }, siteId: { not: null }, purpose: 'FIELD' }, select: sel }),
    prisma.vehicleBooking.findMany({ where: { assignedDate: { gte: prevDay, lte: prevDay }, siteId: { not: null }, purpose: 'FIELD' }, select: { vehicleId: true, site: { select: { province: true, code: true } } } }),
  ])

  // ตำแหน่งเมื่อวานต่อคัน
  const prevByVeh = new Map<number, { prov: string; code: string | null }>()
  for (const b of onPrev) {
    const prov = matchProvince(b.site?.province)
    if (prov && !prevByVeh.has(b.vehicleId)) prevByVeh.set(b.vehicleId, { prov, code: b.site?.code ?? null })
  }

  // งานวันนี้ต่อคัน (คันละ 1 ปลายทาง — ถ้ามีหลายอันเก็บอันแรก)
  const dayByVeh = new Map<number, (typeof onDay)[number]>()
  for (const b of onDay) if (!dayByVeh.has(b.vehicleId)) dayByVeh.set(b.vehicleId, b)

  interface Trip {
    plate: string; driver: string; team: string
    fromProv: string; fromSite: string | null; fromBase: boolean
    toProv: string; toSite: string; days: number
  }
  const trips: Trip[] = []
  for (const [vid, b] of dayByVeh) {
    const toProv = matchProvince(b.site?.province)
    if (!toProv) continue
    const prev = prevByVeh.get(vid)
    const fromProv = prev ? prev.prov : BASE_PROV
    if (fromProv === toProv) continue // อยู่จังหวัดเดิม → ไม่ใช่การเดินทางข้ามจังหวัด
    trips.push({
      plate: b.vehicle.licensePlate,
      driver: b.driver?.nickname || b.driver?.fullName || b.driverName || '—',
      team: b.driver?.primaryTeam.code || 'LOG',
      fromProv,
      fromSite: prev ? prev.code : null,
      fromBase: !prev,
      toProv,
      toSite: b.site?.code || b.site?.name || '—',
      days: Number(b.estimatedDays),
    })
  }

  trips.sort((a, b) => a.toProv.localeCompare(b.toProv, 'th'))
  return NextResponse.json({ date: toDateKey(day), trips })
}
