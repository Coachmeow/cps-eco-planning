import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden, hashPassword, type UserRole } from '@/lib/auth'

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  if (!admin) return forbidden()

  const { id } = await params
  const uid    = parseInt(id)
  const body   = await req.json()

  const data: Record<string, unknown> = {}
  if (body.role && ROLES.includes(body.role))   data.role     = body.role
  if (typeof body.isActive === 'boolean')        data.isActive = body.isActive
  if (body.username)                             data.username = String(body.username).trim().toLowerCase()
  if (body.resetPassword)                        data.passwordHash = hashPassword(String(body.resetPassword))

  // กันแอดมินลดสิทธิ์/ปิดบัญชีตัวเอง จนไม่มีใครคุมระบบ
  if (uid === admin.uid && ((data.role && data.role !== 'ADMIN') || data.isActive === false)) {
    return NextResponse.json({ error: 'ห้ามลดสิทธิ์หรือปิดบัญชีตัวเอง' }, { status: 400 })
  }

  try {
    const u = await prisma.user.update({ where: { id: uid }, data })
    return NextResponse.json({ id: u.id, username: u.username, role: u.role, isActive: u.isActive })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
