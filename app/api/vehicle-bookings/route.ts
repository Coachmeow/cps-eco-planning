import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)

  const bookings = await prisma.vehicleBooking.findMany({
    where:   { assignedDate: { gte: startDate, lte: endDate } },
    include: {
      vehicle: true, site: true,
      // ทีมที่ใช้รถ → ลงสีช่องปฏิทินตามทีม (งานจากแผนพนักงาน = ทีมของงาน ; จองตรง = ทีมคนขับ)
      driver: { include: { primaryTeam: true } },
      staffAssignment: { select: { serviceType: true } },
    },
    orderBy: [{ vehicleId: 'asc' }, { assignedDate: 'asc' }],
  })
  return NextResponse.json(bookings)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const body = await req.json()
  const { vehicleId, assignedDate, purpose = 'FIELD', siteId, destination, driverId, driverName, notes, estimatedDays = 1 } = body
  if (!vehicleId || !assignedDate) {
    return NextResponse.json({ error: 'เลือกรถและวันที่' }, { status: 400 })
  }

  const date = new Date(assignedDate)
  const days = Math.min(Math.floor(Number(estimatedDays)) || 1, 20)
  const shared = {
    vehicleId: parseInt(vehicleId), purpose,
    siteId:      siteId   ? parseInt(siteId) : null,
    destination: destination || null,
    driverId:    driverId ? parseInt(driverId) : null,
    driverName:  driverName || null,
    notes:       notes || null,
  }

  const created = await prisma.vehicleBooking.create({
    data: { ...shared, assignedDate: date, estimatedDays: days },
  })
  const extraDays = []
  for (let i = 1; i < days; i++) {
    const nd = new Date(date); nd.setDate(nd.getDate() + i)
    const extra = await prisma.vehicleBooking.create({
      data: { ...shared, assignedDate: nd, estimatedDays: 0, parentId: created.id },
    })
    extraDays.push(extra)
  }
  return NextResponse.json({ created, extraDays }, { status: 201 })
}
