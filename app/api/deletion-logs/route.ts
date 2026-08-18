import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// ประวัติการลบข้อมูล — ADMIN เท่านั้น
export async function GET(req: NextRequest) {
  if (!await requireRole('ADMIN')) return forbidden()
  const type = req.nextUrl.searchParams.get('type') // เช่น 'equipment'
  const logs = await prisma.deletionLog.findMany({
    where: type ? { entityType: type } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}
