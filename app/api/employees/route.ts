import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const employees = await prisma.employee.findMany({
    where:   { isActive: true },
    include: { primaryTeam: true, siteAccess: true },
    orderBy: [{ primaryTeamId: 'asc' }, { fullName: 'asc' }],
  })
  return NextResponse.json(employees)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const employee = await prisma.employee.create({
      data: {
        fullName:      body.fullName,
        nickname:      body.nickname || null,
        primaryTeamId: parseInt(body.primaryTeamId),
        isActive:      true,
      },
      include: { primaryTeam: true, siteAccess: true },
    })
    return NextResponse.json(employee, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
