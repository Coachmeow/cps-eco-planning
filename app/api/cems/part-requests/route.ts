import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import type { CemsRequestStatus } from '@prisma/client'

// รายการคำขอเบิก (default = PENDING) สำหรับ CEMS Admin อนุมัติ
export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const statusParam = (req.nextUrl.searchParams.get('status') ?? 'PENDING').toUpperCase()
  const requests = await prisma.cemsPartRequest.findMany({
    where: statusParam === 'ALL' ? {} : { status: statusParam as CemsRequestStatus },
    include: {
      part:      { select: { code: true, name: true, unit: true } },
      requester: { select: { nickname: true, fullName: true } },
      site:      { select: { code: true } },
      analyzer:  { select: { tag: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })
  return NextResponse.json(requests)
}
