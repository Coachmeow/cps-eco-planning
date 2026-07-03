import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET() {
  const types = await prisma.equipmentType.findMany({
    include: { primaryTeam: true },
    orderBy: { code: 'asc' },
  })
  return NextResponse.json(types)
}

// สร้างประเภทเครื่องมือใหม่ (ADMIN/MANAGER)
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    if (!body.code || !body.name || !body.primaryTeamId) {
      return NextResponse.json({ error: 'กรอกโค้ด ชื่อ และทีมหลัก' }, { status: 400 })
    }
    const type = await prisma.equipmentType.create({
      data: {
        code:          String(body.code).trim(),
        name:          String(body.name).trim(),
        primaryTeamId: parseInt(String(body.primaryTeamId)),
      },
      include: { primaryTeam: true },
    })
    return NextResponse.json(type, { status: 201 })
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'โค้ดประเภทนี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
