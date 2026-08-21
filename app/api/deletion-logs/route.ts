import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, requireCemsAdmin, forbidden } from '@/lib/auth'

// ประวัติการลบข้อมูล — group=cems: CEMS Admin ; อื่นๆ: ADMIN
export async function GET(req: NextRequest) {
  const type  = req.nextUrl.searchParams.get('type')  // เช่น 'equipment'
  const group = req.nextUrl.searchParams.get('group') // 'cems' = เฉพาะ cems-* / 'planning' = ที่เหลือ
  if (group === 'cems') { if (!await requireCemsAdmin()) return forbidden() }
  else                  { if (!await requireRole('ADMIN')) return forbidden() }
  const where =
    type  ? { entityType: type }
    : group === 'cems'     ? { entityType: { startsWith: 'cems-' } }
    : group === 'planning' ? { NOT: { entityType: { startsWith: 'cems-' } } }
    : {}
  const logs = await prisma.deletionLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}
