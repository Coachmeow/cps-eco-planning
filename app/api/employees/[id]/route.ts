import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, getSession, hasRole, forbidden } from '@/lib/auth'

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
    if (body.eduLevel      !== undefined) data.eduLevel      = body.eduLevel || null
    if (body.eduField      !== undefined) data.eduField      = body.eduField || null
    if (body.eduInstitute  !== undefined) data.eduInstitute  = body.eduInstitute || null
    if (body.subTeamId     !== undefined) data.subTeamId     = body.subTeamId != null && body.subTeamId !== '' ? parseInt(String(body.subTeamId)) : null
    if (body.subTeamOrder  !== undefined) data.subTeamOrder  = body.subTeamOrder != null && body.subTeamOrder !== '' ? parseInt(String(body.subTeamOrder)) : 999
    if (body.isSubLeader   !== undefined) data.isSubLeader   = !!body.isSubLeader
    if (body.inPlanner     !== undefined) data.inPlanner     = !!body.inPlanner

    const employee = await prisma.employee.update({
      where: { id: parseInt(id) },
      data,
      include: { primaryTeam: true, siteAccess: true, subTeam: true },
    })
    return NextResponse.json(employee)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const empId = parseInt(id)
    const emp = await prisma.employee.findUnique({ where: { id: empId }, include: { primaryTeam: true } })
    if (!emp) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }

    const assignmentCount = await prisma.staffAssignment.count({ where: { employeeId: empId } })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photoUrl, ...empNoPhoto } = emp
    const snapshot = JSON.parse(JSON.stringify({ employee: empNoPhoto, assignmentCount, hadPhoto: !!photoUrl }))

    // ลบ assignments และ access ก่อน แล้วค่อยลบพนักงาน
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({
        data: {
          entityType: 'employee', entityLabel: `${emp.fullName}${emp.nickname ? ` (${emp.nickname})` : ''}`,
          reason, snapshot, deletedById: session!.uid, deletedByName: session!.name || session!.username || '—',
        },
      })
      await tx.staffAssignment.deleteMany({ where: { employeeId: empId } })
      await tx.employeeSiteAccess.deleteMany({ where: { employeeId: empId } })
      await tx.employee.delete({ where: { id: empId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
