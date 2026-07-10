import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// เครื่องมือ + รถ ที่แนบกับงาน (staffAssignment ตัวแม่) — ใช้โชว์ในป๊อปอัพดูงานที่มีอยู่
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sid = parseInt(id)
  if (!sid) return NextResponse.json({ equipment: [], vehicles: [] })

  const [eq, veh] = await Promise.all([
    prisma.equipmentAssignment.findMany({
      where:   { staffAssignmentId: sid, parentId: null },
      include: { equipment: { include: { type: { select: { code: true } } } } },
    }),
    prisma.vehicleBooking.findMany({
      where:   { staffAssignmentId: sid, parentId: null },
      include: { vehicle: { select: { licensePlate: true, name: true } } },
    }),
  ])

  return NextResponse.json({
    equipment: eq.map((e) => ({
      id:    e.equipmentId,
      label: e.equipment.internalNo ?? e.equipment.serialNo ?? `#${e.equipmentId}`,
      type:  e.equipment.type?.code ?? null,
    })),
    vehicles: veh.map((v) => ({
      id:    v.vehicleId,
      plate: v.vehicle.licensePlate,
      name:  v.vehicle.name ?? null,
    })),
  })
}
