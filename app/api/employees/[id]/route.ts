import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    // อัปเดตเฉพาะ key ที่ถูกส่งมา (กัน toggleActive ทับ photoUrl/field อื่นเป็น null)
    const data: Record<string, unknown> = {}
    if (body.fullName      !== undefined) data.fullName      = body.fullName
    if (body.nickname      !== undefined) data.nickname      = body.nickname || null
    if (body.primaryTeamId !== undefined) data.primaryTeamId = parseInt(body.primaryTeamId)
    if (body.isActive      !== undefined) data.isActive      = body.isActive
    if (body.phone         !== undefined) data.phone         = body.phone || null
    if (body.photoUrl      !== undefined) data.photoUrl      = body.photoUrl || null
    if (body.birthDate     !== undefined) data.birthDate     = body.birthDate ? new Date(body.birthDate) : null
    if (body.startDate     !== undefined) data.startDate     = body.startDate ? new Date(body.startDate) : null
    if (body.eduField      !== undefined) data.eduField      = body.eduField || null
    if (body.eduInstitute  !== undefined) data.eduInstitute  = body.eduInstitute || null

    const employee = await prisma.employee.update({
      where: { id: parseInt(id) },
      data,
      include: { primaryTeam: true, siteAccess: true },
    })
    return NextResponse.json(employee)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const empId = parseInt(id)
    // ลบ assignments และ access ก่อน แล้วค่อยลบพนักงาน
    await prisma.staffAssignment.deleteMany({ where: { employeeId: empId } })
    await prisma.employeeSiteAccess.deleteMany({ where: { employeeId: empId } })
    await prisma.employee.delete({ where: { id: empId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
