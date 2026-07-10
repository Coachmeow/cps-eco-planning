import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// เครื่องมือ + รถ ของงาน (staffAssignment ตัวแม่) แบ่งเป็น 2 กลุ่ม:
//  - linked = แนบผ่าน popup แผนพนักงาน (ผูก staffAssignmentId ตรงกับงานนี้)
//  - site   = จองแยกในหน้าเครื่องมือ/รถ ไปที่ "ไซต์เดียวกัน + ช่วงวันเดียวกัน" แต่ไม่ผูกกับงานนี้
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sid = parseInt(id)
  const empty = { equipment: [], vehicles: [], siteEquipment: [], siteVehicles: [] }
  if (!sid) return NextResponse.json(empty)

  const sa = await prisma.staffAssignment.findUnique({
    where:  { id: sid },
    select: { siteId: true, assignedDate: true, estimatedDays: true },
  })
  if (!sa) return NextResponse.json(empty)

  // ── linked: ผูกกับงานนี้โดยตรง ──
  const [linkedEq, linkedVeh] = await Promise.all([
    prisma.equipmentAssignment.findMany({
      where:   { staffAssignmentId: sid, parentId: null },
      include: { equipment: { include: { type: { select: { code: true } } } } },
    }),
    prisma.vehicleBooking.findMany({
      where:   { staffAssignmentId: sid, parentId: null },
      include: { vehicle: { select: { licensePlate: true, name: true } } },
    }),
  ])
  const linkedEqIds  = new Set(linkedEq.map((e) => e.equipmentId))
  const linkedVehIds = new Set(linkedVeh.map((v) => v.vehicleId))

  const equipment = linkedEq.map((e) => ({ id: e.equipmentId, label: e.equipment.internalNo ?? e.equipment.serialNo ?? `#${e.equipmentId}`, type: e.equipment.type?.code ?? null }))
  const vehicles  = linkedVeh.map((v) => ({ id: v.vehicleId, plate: v.vehicle.licensePlate, name: v.vehicle.name ?? null }))

  // ── site: จองแยกที่ไซต์เดียวกัน ช่วงวันเดียวกัน (ไม่ผูกกับงานนี้) ──
  const siteEquipment: typeof equipment = []
  const siteVehicles:  typeof vehicles  = []
  if (sa.siteId) {
    const start = sa.assignedDate
    const end   = new Date(new Date(start).getTime() + (Math.max(Number(sa.estimatedDays), 1) - 1) * 86400000)

    const [eqRows, vehRows] = await Promise.all([
      prisma.equipmentAssignment.findMany({
        where:   { siteId: sa.siteId, assignedDate: { gte: start, lte: end } },
        include: { equipment: { include: { type: { select: { code: true } } } } },
      }),
      prisma.vehicleBooking.findMany({
        where:   { siteId: sa.siteId, assignedDate: { gte: start, lte: end } },
        include: { vehicle: { select: { licensePlate: true, name: true } } },
      }),
    ])
    const seenEq = new Set<number>(), seenVeh = new Set<number>()
    for (const r of eqRows) {
      if (linkedEqIds.has(r.equipmentId) || seenEq.has(r.equipmentId)) continue
      seenEq.add(r.equipmentId)
      siteEquipment.push({ id: r.equipmentId, label: r.equipment.internalNo ?? r.equipment.serialNo ?? `#${r.equipmentId}`, type: r.equipment.type?.code ?? null })
    }
    for (const r of vehRows) {
      if (linkedVehIds.has(r.vehicleId) || seenVeh.has(r.vehicleId)) continue
      seenVeh.add(r.vehicleId)
      siteVehicles.push({ id: r.vehicleId, plate: r.vehicle.licensePlate, name: r.vehicle.name ?? null })
    }
  }

  return NextResponse.json({ equipment, vehicles, siteEquipment, siteVehicles })
}
