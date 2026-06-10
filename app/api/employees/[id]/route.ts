import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const employee = await prisma.employee.update({
      where: { id: parseInt(id) },
      data: {
        fullName:      body.fullName,
        nickname:      body.nickname || null,
        primaryTeamId: parseInt(body.primaryTeamId),
        isActive:      body.isActive ?? true,
      },
      include: { primaryTeam: true, siteAccess: true },
    })
    return NextResponse.json(employee)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
