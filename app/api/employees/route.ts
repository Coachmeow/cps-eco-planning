import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === 'true' // admin: รวมคนที่ปิดการใช้งานด้วย
  const employees = await prisma.employee.findMany({
    where:   all ? {} : { isActive: true, inPlanner: true },
    include: { primaryTeam: true, siteAccess: true, subTeam: true },
  })
  // เรียง: ทีม → ทีมย่อย (ไม่มีทีมย่อย=ท้าย) → หัวหน้าอยู่บน → ลำดับในทีมย่อย → ชื่อ
  employees.sort((a, b) => {
    if (a.primaryTeam.sortOrder !== b.primaryTeam.sortOrder) return a.primaryTeam.sortOrder - b.primaryTeam.sortOrder
    if (a.primaryTeamId !== b.primaryTeamId) return a.primaryTeamId - b.primaryTeamId
    const sa = a.subTeam?.sortOrder ?? 9999, sb = b.subTeam?.sortOrder ?? 9999
    if (sa !== sb) return sa - sb
    const ha = a.isSubLeader ? 0 : 1, hb = b.isSubLeader ? 0 : 1
    if (ha !== hb) return ha - hb
    if (a.subTeamOrder !== b.subTeamOrder) return a.subTeamOrder - b.subTeamOrder
    return a.fullName.localeCompare(b.fullName, 'th')
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
        inPlanner:     body.inPlanner !== undefined ? !!body.inPlanner : true,
        phone:         body.phone     || null,
        photoUrl:      body.photoUrl     || null,
        birthDate:     body.birthDate     ? new Date(body.birthDate) : null,
        startDate:     body.startDate     ? new Date(body.startDate) : null,
        eduField:      body.eduField     || null,
        eduInstitute:  body.eduInstitute || null,
        subTeamId:     body.subTeamId != null && body.subTeamId !== '' ? parseInt(String(body.subTeamId)) : null,
        subTeamOrder:  body.subTeamOrder != null && body.subTeamOrder !== '' ? parseInt(String(body.subTeamOrder)) : 999,
        isSubLeader:   !!body.isSubLeader,
      },
      include: { primaryTeam: true, siteAccess: true, subTeam: true },
    })
    return NextResponse.json(employee, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
