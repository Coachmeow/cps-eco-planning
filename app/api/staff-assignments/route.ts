import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStaffConflict } from '@/lib/conflicts'
import { requireRole, forbidden } from '@/lib/auth'
import { maintStateForWindow, overlappingEventWhere, type MaintEvent } from '@/lib/equipmentAvailability'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)

  const assignments = await prisma.staffAssignment.findMany({
    where: { assignedDate: { gte: startDate, lte: endDate } },
    include: {
      employee:    { include: { primaryTeam: true }, omit: { photoUrl: true } },
      site:        true,
      serviceType: true,
    },
    orderBy: [{ employeeId: 'asc' }, { assignedDate: 'asc' }],
  })

  return NextResponse.json(assignments)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const {
    employeeId, assignedDate, siteId, serviceTypeId,
    estimatedDays = 1, status = 'FIELD', notes, isLocked = false,
    equipmentIds = [],   // เครื่องมือที่แนบไปกับงานคนนี้ (ผูก staffAssignmentId)
    vehicleIds = [],     // รถที่แนบไปกับงานคนนี้
  } = body

  if (!employeeId || !assignedDate) {
    return NextResponse.json({ error: 'employeeId และ assignedDate จำเป็น' }, { status: 400 })
  }
  // งานภาคสนามต้องมีไซต์ — กัน record FIELD ไร้ไซต์ (โชว์เป็น "FIELD" + ไปโป่ง utilization)
  if ((status ?? 'FIELD') === 'FIELD' && !siteId) {
    return NextResponse.json({ error: 'งานภาคสนามต้องเลือกไซต์งาน' }, { status: 400 })
  }

  const date = new Date(assignedDate)

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { primaryTeamId: true },
  })
  if (!employee) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

  const isCrossTeam = serviceTypeId != null && serviceTypeId !== employee.primaryTeamId
  const { hasConflict, conflictingIds } = await getStaffConflict(employeeId, date, siteId ?? null)

  const created = await prisma.staffAssignment.create({
    data: {
      employeeId, assignedDate: date,
      siteId: siteId ?? null, serviceTypeId: serviceTypeId ?? null,
      isCrossTeam, estimatedDays, status, notes, isLocked,
    },
    include: { employee: true, site: true, serviceType: true },
  })

  const extraDays = []
  if (estimatedDays > 1) {
    for (let i = 1; i < estimatedDays; i++) {
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + i)
      const extra = await prisma.staffAssignment.create({
        data: {
          employeeId, assignedDate: nextDate,
          siteId: siteId ?? null, serviceTypeId: serviceTypeId ?? null,
          isCrossTeam, estimatedDays: 0, status, notes, isLocked,
          parentId: created.id,
        },
        include: { employee: true, site: true, serviceType: true },
      })
      extraDays.push(extra)
    }
  }

  // แนบเครื่องมือ → สร้างจองเครื่อง (ไซต์/วันเดียวกัน) ผูกกับงานคนนี้
  if (status === 'FIELD' && siteId && Array.isArray(equipmentIds) && equipmentIds.length > 0) {
    const days = Math.min(Math.floor(Number(estimatedDays)) || 1, 20)
    // แนบได้ถ้าเครื่องว่างในช่วงวันที่จอง — บล็อกเฉพาะช่วงส่งซ่อม/Cal ที่ทับ (จองหลังวันรับกลับได้)
    const wantIds = equipmentIds.map((v: unknown) => parseInt(String(v))).filter(Boolean)
    const bEnd = new Date(date); bEnd.setDate(bEnd.getDate() + days - 1)
    const [eqRows, evRows] = await Promise.all([
      prisma.equipment.findMany({ where: { id: { in: wantIds } }, select: { id: true, status: true } }),
      prisma.equipmentEvent.findMany({
        where: { equipmentId: { in: wantIds }, ...overlappingEventWhere(date, bEnd) },
        select: { equipmentId: true, sentDate: true, expectedDate: true, returnedDate: true },
      }),
    ])
    const evByEq = new Map<number, MaintEvent[]>()
    for (const e of evRows) {
      if (!evByEq.has(e.equipmentId)) evByEq.set(e.equipmentId, [])
      evByEq.get(e.equipmentId)!.push({ sentDate: e.sentDate, expectedDate: e.expectedDate, returnedDate: e.returnedDate })
    }
    const activeSet = new Set(
      eqRows
        .filter(e => e.status !== 'RETIRED' && maintStateForWindow(evByEq.get(e.id) ?? [], date, bEnd).state !== 'blocked')
        .map(e => e.id)
    )
    for (const rawEqId of equipmentIds) {
      const eqId = parseInt(String(rawEqId))
      if (!eqId || !activeSet.has(eqId)) continue
      const eqParent = await prisma.equipmentAssignment.create({
        data: { equipmentId: eqId, assignedDate: date, siteId, staffAssignmentId: created.id, estimatedDays: days },
      })
      for (let i = 1; i < days; i++) {
        const nd = new Date(date); nd.setDate(nd.getDate() + i)
        await prisma.equipmentAssignment.create({
          data: { equipmentId: eqId, assignedDate: nd, siteId, staffAssignmentId: created.id, estimatedDays: 0, parentId: eqParent.id },
        })
      }
    }
  }

  // แนบรถ → สร้างจองรถ (ไซต์/วันเดียวกัน) ผูกกับงานคนนี้ คนขับ = คนหลัก
  if (status === 'FIELD' && siteId && Array.isArray(vehicleIds) && vehicleIds.length > 0) {
    const days = Math.min(Math.floor(Number(estimatedDays)) || 1, 20)
    for (const rawVId of vehicleIds) {
      const vId = parseInt(String(rawVId))
      if (!vId) continue
      const vParent = await prisma.vehicleBooking.create({
        data: { vehicleId: vId, assignedDate: date, purpose: 'FIELD', siteId, staffAssignmentId: created.id, driverId: employeeId, estimatedDays: days },
      })
      for (let i = 1; i < days; i++) {
        const nd = new Date(date); nd.setDate(nd.getDate() + i)
        await prisma.vehicleBooking.create({
          data: { vehicleId: vId, assignedDate: nd, purpose: 'FIELD', siteId, staffAssignmentId: created.id, driverId: employeeId, estimatedDays: 0, parentId: vParent.id },
        })
      }
    }
  }

  return NextResponse.json(
    { created, extraDays, conflict: { hasConflict, conflictingIds } },
    { status: 201 }
  )
}
