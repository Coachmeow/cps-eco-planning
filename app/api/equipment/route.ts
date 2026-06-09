import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const typeId = req.nextUrl.searchParams.get('typeId')
  const equipment = await prisma.equipment.findMany({
    where: {
      status: { not: 'RETIRED' },
      ...(typeId ? { typeId: parseInt(typeId) } : {}),
    },
    include: { type: { include: { primaryTeam: true } } },
    orderBy: [{ typeId: 'asc' }, { internalNo: 'asc' }],
  })
  return NextResponse.json(equipment)
}
