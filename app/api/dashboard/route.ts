/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { countWorkdays } from '@/lib/workdays'
import { getHolidaySet } from '@/lib/holidays'
import { toDateKey } from '@/lib/dateKey'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)
  const holidays  = await getHolidaySet()
  const workdays  = countWorkdays(year, month, holidays)

  // ── Equipment Utilization ──────────────────────────────────
  const eqTypesRaw = await prisma.equipmentType.findMany({
    include: {
      equipment: {
        // BROKEN/RETIRED ใช้งานไม่ได้ — ไม่นับเป็นฐานคำนวณ utilization
        where:   { status: { notIn: ['RETIRED', 'BROKEN'] } },
        include: { assignments: { where: { assignedDate: { gte: startDate, lte: endDate } } } },
      },
    },
  })

  const equipmentUtil = eqTypesRaw.map((t: any) => {
    const own    = t.equipment.filter((e: any) => !e.isRental)
    const rental = t.equipment.filter((e: any) => e.isRental)
    const ownAssigned    = own.reduce((s: number, e: any) => s + e.assignments.length, 0)
    const rentalAssigned = rental.reduce((s: number, e: any) => s + e.assignments.length, 0)
    const ownCapacity = workdays * own.length

    // Own Load = งานเครื่องซื้อ ÷ กำลังเครื่องซื้อ (≤100% — เครื่องเราถูกใช้เต็มแค่ไหน)
    const ownUtil = ownCapacity > 0 ? Math.round((ownAssigned / ownCapacity) * 100) : 0
    // Util เครื่องเช่า (รายฝูง — ไว้ดูประกอบ)
    const rentalUtil = rental.length > 0 && workdays > 0
      ? Math.round((rentalAssigned / (workdays * rental.length)) * 100) : 0
    // Demand Util = (งานซื้อ+เช่า) ÷ กำลังเครื่องซื้อ — เกิน 100% = ต้องพึ่งเครื่องเช่า
    const demandUtil = ownCapacity > 0
      ? Math.round(((ownAssigned + rentalAssigned) / ownCapacity) * 100)
      : null  // null = ไม่มีเครื่องซื้อ (เช่าล้วน) เทียบฐานไม่ได้

    return {
      typeId: t.id, typeCode: t.code, typeName: t.name,
      ownCount: own.length, rentalCount: rental.length,
      ownAssigned, rentalAssigned, ownUtil, rentalUtil, demandUtil,
    }
  }).filter((t: any) => t.ownCount + t.rentalCount > 0)

  // ── Team Workload ──────────────────────────────────────────
  const teams = await prisma.serviceTeam.findMany()

  const demandRaw = await prisma.staffAssignment.groupBy({
    by:    ['serviceTypeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null, siteId: { not: null } },
    _sum:  { estimatedDays: true },
  })

  // own-cap: assignments ที่ employee ทำงานให้ทีมตัวเอง (serviceTypeId === primaryTeamId)
  // ใช้ Prisma ORM แทน raw SQL เพื่อหลีกเลี่ยงปัญหา camelCase vs snake_case column name
  const ownCapAssignments = await prisma.staffAssignment.findMany({
    where: {
      assignedDate:  { gte: startDate, lte: endDate },
      status:        'FIELD',
      parentId:      null,
      serviceTypeId: { not: null },
      siteId:        { not: null },
    },
    select: {
      serviceTypeId: true,
      estimatedDays: true,
      employee:      { select: { primaryTeamId: true } },
    },
  })

  const ownCapMap = new Map<number, number>()
  for (const sa of ownCapAssignments) {
    if (sa.serviceTypeId != null && sa.serviceTypeId === sa.employee.primaryTeamId) {
      ownCapMap.set(sa.serviceTypeId, (ownCapMap.get(sa.serviceTypeId) ?? 0) + Number(sa.estimatedDays))
    }
  }

  const teamWorkload = teams.map((t) => {
    const demand  = Number(demandRaw.find((d) => d.serviceTypeId === t.id)?._sum.estimatedDays ?? 0)
    const ownCap  = ownCapMap.get(t.id) ?? 0
    const crossIn = Math.max(0, demand - ownCap)
    return { teamId: t.id, teamCode: t.code, teamName: t.name, demand, ownCap, crossIn }
  }).filter((t) => t.demand > 0)

  // ── Cross-team Contributors ────────────────────────────────
  const crossRaw = await prisma.staffAssignment.groupBy({
    by:    ['employeeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', isCrossTeam: true, parentId: null, siteId: { not: null } },
    _sum:  { estimatedDays: true },
    orderBy: { _sum: { estimatedDays: 'desc' } },
    take:  10,
  })

  const crossContrib = await Promise.all(
    crossRaw.map(async (row) => {
      const emp = await prisma.employee.findUnique({
        where: { id: row.employeeId }, select: { fullName: true, nickname: true, primaryTeam: { select: { code: true } } },
      })
      return {
        employeeId:    row.employeeId,
        fullName:      emp?.fullName ?? '',
        nickname:      emp?.nickname ?? '',
        primaryTeam:   emp?.primaryTeam.code ?? '',
        crossTeamDays: Number(row._sum.estimatedDays ?? 0),
      }
    })
  )

  // ── Per-person Utilization ─────────────────────────────────
  const personGroups = await prisma.staffAssignment.groupBy({
    by:    ['employeeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null, siteId: { not: null } },
    _sum:  { estimatedDays: true },
  })

  const personUtil = (await Promise.all(
    personGroups.map(async (g) => {
      const emp = await prisma.employee.findUnique({
        where: { id: g.employeeId },
        select: { fullName: true, nickname: true, primaryTeam: { select: { code: true, isFieldTeam: true } } },
      })
      // คนของทีมสนับสนุน/แอดมิน ไม่จัดอันดับ Utilization (งานที่ออกไปยังนับใน man-day ไซต์/ภาระงานทีมตามปกติ)
      if (emp?.primaryTeam.isFieldTeam === false) return null
      const fieldDays = Number(g._sum.estimatedDays ?? 0)
      const utilPct   = workdays > 0 ? Math.round((fieldDays / workdays) * 100) : 0
      return {
        employeeId:  g.employeeId,
        fullName:    emp?.fullName ?? '',
        nickname:    emp?.nickname ?? '',
        primaryTeam: emp?.primaryTeam.code ?? '',
        fieldDays,
        utilPct,
      }
    })
  )).filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.utilPct - a.utilPct)

  // ── Team Capacity คงเหลือ (เดือนที่เลือก) ───────────────────
  // capacity = จำนวนพนักงาน active ในทีม × วันทำงาน
  // booked   = วัน FIELD ที่คนในทีมถูกจองไปแล้ว (ไม่ว่าจะทำให้ทีมไหน — คนไม่ว่างคือไม่ว่าง)
  const activeEmployees = await prisma.employee.findMany({
    where:  { isActive: true, inPlanner: true },
    select: { id: true, primaryTeamId: true },
  })
  const bookedRaw = await prisma.staffAssignment.groupBy({
    by:    ['employeeId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null, siteId: { not: null } },
    _sum:  { estimatedDays: true },
  })
  const bookedByEmp = new Map<number, number>(
    bookedRaw.map((b) => [b.employeeId, Number(b._sum.estimatedDays ?? 0)] as [number, number])
  )

  const capMap = new Map<number, { count: number; booked: number }>()
  for (const e of activeEmployees) {
    const cur = capMap.get(e.primaryTeamId) ?? { count: 0, booked: 0 }
    cur.count  += 1
    cur.booked += bookedByEmp.get(e.id) ?? 0
    capMap.set(e.primaryTeamId, cur)
  }
  // ทีมสนับสนุน/แอดมิน (isFieldTeam=false เช่น LOG) ไม่ใช่กำลังคนภาคสนาม — ตัดออกจากฐาน Capacity
  const teamCapacity = teams.filter((t) => t.isFieldTeam !== false).map((t) => {
    const c         = capMap.get(t.id) ?? { count: 0, booked: 0 }
    const capacity  = c.count * workdays
    const remaining = capacity - c.booked
    const usedPct   = capacity > 0 ? Math.round((c.booked / capacity) * 100) : 0
    return {
      teamId: t.id, teamCode: t.code, headcount: c.count,
      capacity, booked: Math.round(c.booked * 10) / 10,
      remaining: Math.round(remaining * 10) / 10, usedPct,
    }
  }).filter((t) => t.headcount > 0).sort((a, b) => b.remaining - a.remaining)

  // ── แนวโน้มย้อนหลัง 6 เดือน ──────────────────────────────────
  // util เครื่องมือใช้จำนวนเครื่อง active ปัจจุบันเป็นตัวหาร (ประมาณการสำหรับ trend สั้น)
  const activeEqCount = await prisma.equipment.count({
    where: { status: { notIn: ['RETIRED', 'BROKEN'] } },
  })
  const trend: { year: number; month: number; manDays: number; eqUtil: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(year, month - 1 - i, 1)
    const ty = d.getFullYear()
    const tm = d.getMonth() + 1
    const s  = new Date(ty, tm - 1, 1)
    const e  = new Date(ty, tm, 0)
    const wd = countWorkdays(ty, tm, holidays)
    const md = await prisma.staffAssignment.aggregate({
      where: { assignedDate: { gte: s, lte: e }, status: 'FIELD', parentId: null, siteId: { not: null } },
      _sum:  { estimatedDays: true },
    })
    const eqAsg = await prisma.equipmentAssignment.count({
      where: { assignedDate: { gte: s, lte: e } },
    })
    trend.push({
      year: ty, month: tm,
      manDays: Number(md._sum.estimatedDays ?? 0),
      eqUtil:  activeEqCount > 0 && wd > 0 ? Math.round((eqAsg / (activeEqCount * wd)) * 100) : 0,
    })
  }

  // ── Man-days per Site ──────────────────────────────────────
  const siteGroups = await prisma.staffAssignment.groupBy({
    by:    ['siteId'],
    where: { assignedDate: { gte: startDate, lte: endDate }, status: 'FIELD', parentId: null, siteId: { not: null } },
    _sum:  { estimatedDays: true },
  })

  const siteMandays = (await Promise.all(
    siteGroups.map(async (g) => {
      const site = await prisma.site.findUnique({ where: { id: g.siteId! } })
      return {
        siteId:   g.siteId!,
        siteCode: site?.code ?? '?',
        siteName: site?.name ?? '',
        color:    site?.color ?? 'emerald',
        manDays:  Number(g._sum.estimatedDays ?? 0),
      }
    })
  )).sort((a, b) => b.manDays - a.manDays)

  // ── Alerts: Cal ใกล้ครบ/เกิน + ส่งซ่อมเกินกำหนด ──────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const in30 = new Date(todayStart); in30.setDate(in30.getDate() + 30)
  const calList = await prisma.equipment.findMany({
    where:  { calDueDate: { not: null }, status: { not: 'RETIRED' } },
    select: { id: true, internalNo: true, serialNo: true, calDueDate: true, type: { select: { code: true } } },
  })
  let calOverdue = 0, calSoon = 0
  for (const e of calList) {
    const d = e.calDueDate!
    if (d < todayStart) calOverdue++
    else if (d <= in30) calSoon++
  }
  // รายการที่ควรเปิดใบงานส่งแคล (ครบ/เกินภายใน 30 วัน และยังไม่มีใบงาน Cal เปิดค้าง) — เตือนล่วงหน้า 1 เดือน
  const openCalEqIds = new Set((await prisma.equipmentEvent.findMany({
    where: { type: 'CALIBRATION', returnedDate: null }, select: { equipmentId: true },
  })).map(e => e.equipmentId))
  const calDueSoonList = calList
    .filter(e => e.calDueDate! <= in30 && !openCalEqIds.has(e.id))
    .sort((a, b) => a.calDueDate!.getTime() - b.calDueDate!.getTime())
    .map(e => ({
      id: e.id,
      label: `${e.type.code} ${e.internalNo ?? e.serialNo ?? `#${e.id}`}`,
      calDueDate: e.calDueDate!.toISOString().slice(0, 10),
      overdue: e.calDueDate! < todayStart,
    }))
  const repairOverdue = await prisma.equipmentEvent.count({
    where: { returnedDate: null, expectedDate: { lt: todayStart } },
  })
  const stillOut = await prisma.equipmentEvent.count({ where: { returnedDate: null } })
  const [logMismatch, tripMismatch] = await Promise.all([
    prisma.vehicleLog.count({ where: { mismatch: true } }),
    prisma.vehicleTrip.count({ where: { mismatch: true } }),
  ])
  const mileageMismatch = logMismatch + tripMismatch

  // งานจองรอลูกค้ายืนยัน — ยอดรวมเดือนนี้ + รายการที่ใกล้ถึงวันงานภายใน 7 วัน (ไว้ไล่ตามลูกค้า)
  const in7 = new Date(todayStart); in7.setDate(in7.getDate() + 7)
  const tentativeRows = await prisma.staffAssignment.findMany({
    where: {
      isTentative: true, status: 'FIELD', siteId: { not: null },
      assignedDate: { gte: startDate, lte: endDate },
    },
    select: {
      assignedDate: true, estimatedDays: true, parentId: true, tentativeReason: true,
      employee: { select: { nickname: true, fullName: true } },
      site:     { select: { code: true } },
    },
    orderBy: { assignedDate: 'asc' },
  })
  // นับเป็นวัน-คน: วันแม่เก็บจำนวนวันรวมไว้แล้ว วันลูกเป็น 0 จึงไม่นับซ้ำ
  const tentativeDays = tentativeRows.reduce((s, r) => s + Number(r.estimatedDays), 0)
  const tentativeSoon = tentativeRows
    .filter(r => r.parentId == null && r.assignedDate >= todayStart && r.assignedDate <= in7)
    .slice(0, 15)
    .map(r => ({
      date:     toDateKey(r.assignedDate),
      employee: r.employee.nickname ?? r.employee.fullName,
      site:     r.site?.code ?? '—',
      days:     Number(r.estimatedDays),
      reason:   r.tentativeReason,
    }))

  const alerts = { calOverdue, calSoon, repairOverdue, stillOut, mileageMismatch, tentativeSoon: tentativeSoon.length }

  // ── Equipment Availability (% เครื่องพร้อมใช้) ───────────────
  // available = ACTIVE ; ฐาน = เครื่องที่ยังอยู่ในระบบ (ไม่ RETIRED) → หัก CALIBRATING/BROKEN ออก
  const [eqActive, eqInService] = await Promise.all([
    prisma.equipment.count({ where: { status: 'ACTIVE' } }),
    prisma.equipment.count({ where: { status: { not: 'RETIRED' } } }),
  ])
  const equipmentAvail = { available: eqActive, total: eqInService, pct: eqInService > 0 ? Math.round((eqActive / eqInService) * 100) : 0 }

  // ── Vehicle Utilization (% การจองต่อคัน) ────────────────────
  const activeVehicles = await prisma.vehicle.findMany({
    where: { status: { not: 'RETIRED' } }, select: { id: true, licensePlate: true, name: true },
  })
  const vbGroups = await prisma.vehicleBooking.groupBy({
    by: ['vehicleId'],
    where: { assignedDate: { gte: startDate, lte: endDate } },
    _count: { id: true },
  })
  const vbMap = new Map(vbGroups.map(g => [g.vehicleId, g._count.id]))
  const vehicleUtil = activeVehicles.map(v => {
    const bookedDays = vbMap.get(v.id) ?? 0
    return {
      vehicleId: v.id,
      label: v.licensePlate,
      bookedDays,
      util: workdays > 0 ? Math.round((bookedDays / workdays) * 100) : 0,
    }
  }).sort((a, b) => b.util - a.util)

  return NextResponse.json({ equipmentUtil, teamWorkload, crossContrib, personUtil, siteMandays, teamCapacity, trend, vehicleUtil, alerts, equipmentAvail, tentativeDays, tentativeSoon, calDueSoonList, workdays, year, month })
}
