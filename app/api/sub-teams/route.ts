import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET() {
  const subTeams = await prisma.subTeam.findMany({
    include: { team: true, _count: { select: { members: true } } },
    orderBy: [{ team: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  })
  return NextResponse.json(subTeams)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    if (!body.teamId || !body.name) {
      return NextResponse.json({ error: 'กรอกทีมหลักและชื่อทีมย่อย' }, { status: 400 })
    }
    const sub = await prisma.subTeam.create({
      data: {
        teamId:    parseInt(String(body.teamId)),
        name:      String(body.name).trim(),
        sortOrder: body.sortOrder != null && body.sortOrder !== '' ? parseInt(String(body.sortOrder)) : 1,
      },
    })
    return NextResponse.json(sub, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
