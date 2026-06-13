import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === 'true' // admin: รวมคนที่ปิดการใช้งานด้วย
  const employees = await prisma.employee.findMany({
    where:   all ? {} : { isActive: true },
    include: { primaryTeam: true, siteAccess: true },
    orderBy: [{ primaryTeamId: 'asc' }, { fullName: 'asc' }],
  })
  // strip base64 photoUrl ออกจาก payload (รูปโหลดผ่าน /photo) แต่ส่ง hasPhoto บอกว่ามีรูปไหม
  const out = employees.map(({ photoUrl, ...e }) => ({ ...e, hasPhoto: !!photoUrl }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    const employee = await prisma.employee.create({
      data: {
        fullName:      body.fullName,
        nickname:      body.nickname || null,
        primaryTeamId: parseInt(body.primaryTeamId),
        isActive:      true,
        photoUrl:      body.photoUrl     || null,
        birthDate:     body.birthDate     ? new Date(body.birthDate) : null,
        startDate:     body.startDate     ? new Date(body.startDate) : null,
        eduField:      body.eduField     || null,
        eduInstitute:  body.eduInstitute || null,
      },
      include: { primaryTeam: true, siteAccess: true },
    })
    return NextResponse.json(employee, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
