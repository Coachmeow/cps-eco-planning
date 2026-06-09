import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const employees = await prisma.employee.findMany({
    where:   { isActive: true },
    include: {
      primaryTeam: true,
      siteAccess:  { orderBy: { expiryDate: 'asc' } },
    },
    orderBy: [{ primaryTeamId: 'asc' }, { fullName: 'asc' }],
  })
  return NextResponse.json(employees)
}
