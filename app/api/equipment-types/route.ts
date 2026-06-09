import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const types = await prisma.equipmentType.findMany({
    include: { primaryTeam: true },
    orderBy: { code: 'asc' },
  })
  return NextResponse.json(types)
}
