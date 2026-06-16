import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// รายการ log ไมล์ (admin) — กรองช่วงวัน + รถ
export async function GET(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const vehicleId = searchParams.get('vehicleId')

  const logs = await prisma.vehicleLog.findMany({
    where: {
      ...(vehicleId ? { vehicleId: parseInt(vehicleId) } : {}),
      ...(from || to ? { forDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { vehicle: { select: { id: true, licensePlate: true, name: true } }, site: { select: { code: true } }, driver: { select: { nickname: true, fullName: true } } },
    orderBy: [{ vehicleId: 'asc' }, { mileage: 'asc' }],
  })
  return NextResponse.json(logs)
}
