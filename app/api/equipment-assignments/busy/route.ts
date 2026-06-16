import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// เครื่องมือที่ถูกจองแล้วในช่วงวันที่เลือก (start + days) → ใช้เตือนตอนแนบเครื่องในแผนคน
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start')
  const days  = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '1') || 1, 1), 31)
  if (!start) return NextResponse.json([])

  const startDate = new Date(start)
  const endDate   = new Date(start)
  endDate.setDate(endDate.getDate() + days - 1)

  const rows = await prisma.equipmentAssignment.findMany({
    where:  { assignedDate: { gte: startDate, lte: endDate } },
    include: { site: true },
    orderBy: { assignedDate: 'asc' },
  })
  return NextResponse.json(rows.map(r => ({
    equipmentId: r.equipmentId,
    assignedDate: r.assignedDate,
    siteCode:  r.site?.code  ?? null,
    siteColor: r.site?.color ?? 'emerald',
  })))
}
