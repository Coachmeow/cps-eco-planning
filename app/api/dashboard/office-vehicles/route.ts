import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// รถที่อยู่ออฟฟิศ พร้อมใช้งาน = รถ ACTIVE ที่ไม่มีการจอง (VehicleBooking) ในวันที่กำหนด
export async function GET(req: NextRequest) {
  const dk = req.nextUrl.searchParams.get('date') ?? toDateKey(new Date())
  const [y, m, d] = dk.split('-').map(Number)
  const day = new Date(y, m - 1, d)

  const booked = await prisma.vehicleBooking.findMany({
    where: { assignedDate: { gte: day, lte: day } },
    select: { vehicleId: true },
  })
  const bookedSet = new Set(booked.map((b) => b.vehicleId))

  const all = await prisma.vehicle.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, licensePlate: true, name: true, vehicleType: true },
    orderBy: { licensePlate: 'asc' },
  })
  const vehicles = all
    .filter((v) => !bookedSet.has(v.id))
    .map((v) => ({ id: v.id, plate: v.licensePlate, name: v.name, type: v.vehicleType }))

  return NextResponse.json({ date: dk, vehicles, booked: bookedSet.size, total: all.length })
}
