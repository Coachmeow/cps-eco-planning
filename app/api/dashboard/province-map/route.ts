import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchProvince } from '@/lib/thailandGeo'
import { toDateKey } from '@/lib/dateKey'

// แผนที่กระจายงานรายจังหวัด
//  scope=month → รวมทั้งเดือน (year, month) · ตัวชี้วัด = คน-วัน (sum estimatedDays, parentId:null)
//  scope=date  → สแนปช็อตวันเดียว (date=YYYY-MM-DD) · ตัวชี้วัด = จำนวนคนที่อยู่พื้นที่วันนั้น
//               (รวมวันลูกของงานหลายวันด้วย เพื่อจับ "คนที่ยังอยู่ไซต์" ไม่ใช่แค่วันเริ่มงาน)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const scope = sp.get('scope') === 'date' ? 'date' : 'month'

  let start: Date, end: Date
  if (scope === 'date') {
    const dk = sp.get('date') ?? toDateKey(new Date())
    const [y, m, d] = dk.split('-').map(Number)
    start = new Date(y, m - 1, d)
    end = new Date(y, m - 1, d)
  } else {
    const y = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
    const m = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1))
    start = new Date(y, m - 1, 1)
    end = new Date(y, m, 0)
  }

  const assignWhere = {
    assignedDate: { gte: start, lte: end },
    status: 'FIELD' as const,
    siteId: { not: null },
    // เดือน: นับวันแม่เท่านั้นกันซ้ำ · รายวัน: รวมวันลูกเพื่อจับคนที่ยังอยู่ไซต์
    ...(scope === 'month' ? { parentId: null } : {}),
  }

  const assigns = await prisma.staffAssignment.findMany({
    where: assignWhere,
    select: {
      estimatedDays: true,
      employeeId: true,
      employee: { select: { nickname: true, fullName: true, phone: true, primaryTeam: { select: { code: true } } } },
      serviceType: { select: { code: true } },
      site: { select: { id: true, province: true } },
    },
  })

  const vbookings = await prisma.vehicleBooking.findMany({
    where: {
      assignedDate: { gte: start, lte: end },
      siteId: { not: null },
      ...(scope === 'month' ? { parentId: null } : {}),
    },
    select: {
      vehicle: { select: { licensePlate: true, name: true } },
      driver: { select: { nickname: true, fullName: true } },
      driverName: true,
      site: { select: { province: true, code: true } },
    },
  })

  interface StaffAgg { id: number; nick: string; team: string; tel: string | null; days: number }
  interface VehAgg { plate: string; name: string | null; driver: string | null; site: string | null }
  interface ProvAgg { manDays: number; siteIds: Set<number>; staff: Map<number, StaffAgg>; vehicles: Map<string, VehAgg> }

  const map = new Map<string, ProvAgg>()
  const bucket = (name: string): ProvAgg => {
    let p = map.get(name)
    if (!p) { p = { manDays: 0, siteIds: new Set(), staff: new Map(), vehicles: new Map() }; map.set(name, p) }
    return p
  }
  const unmatchedSites = new Set<number>()
  let unmatchedDays = 0

  for (const a of assigns) {
    const prov = matchProvince(a.site?.province)
    const days = Number(a.estimatedDays)
    if (!prov) { if (a.site) unmatchedSites.add(a.site.id); unmatchedDays += days; continue }
    const p = bucket(prov)
    p.manDays += days
    if (a.site) p.siteIds.add(a.site.id)
    const ex = p.staff.get(a.employeeId)
    if (ex) { ex.days += days }
    else {
      p.staff.set(a.employeeId, {
        id: a.employeeId,
        nick: a.employee.nickname || a.employee.fullName,
        team: a.serviceType?.code || a.employee.primaryTeam.code,
        tel: a.employee.phone,
        days,
      })
    }
  }

  for (const v of vbookings) {
    const prov = matchProvince(v.site?.province)
    if (!prov) continue
    const p = bucket(prov)
    const plate = v.vehicle.licensePlate
    if (!p.vehicles.has(plate)) {
      p.vehicles.set(plate, {
        plate,
        name: v.vehicle.name,
        driver: v.driver?.nickname || v.driver?.fullName || v.driverName || null,
        site: v.site?.code || null,
      })
    }
  }

  const provinces = [...map.entries()].map(([name, p]) => ({
    name,
    manDays: Math.round(p.manDays * 10) / 10,
    head: p.staff.size,
    sites: p.siteIds.size,
    vehicles: [...p.vehicles.values()],
    staff: [...p.staff.values()].sort((x, y) => y.days - x.days),
  }))

  return NextResponse.json({
    scope,
    date: scope === 'date' ? toDateKey(start) : undefined,
    provinces,
    unmatched: { sites: unmatchedSites.size, days: Math.round(unmatchedDays * 10) / 10 },
  })
}
