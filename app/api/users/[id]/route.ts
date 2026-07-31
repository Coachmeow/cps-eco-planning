import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden, hashPassword, type UserRole } from '@/lib/auth'

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL']
const CEMS_ROLES = ['NONE', 'USER', 'ADMIN'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  if (!admin) return forbidden()

  const { id } = await params
  const uid    = parseInt(id)
  const body   = await req.json()

  const data: Record<string, unknown> = {}
  if (body.role && ROLES.includes(body.role))   data.role     = body.role
  if (typeof body.isActive === 'boolean')        data.isActive = body.isActive
  if (body.cemsRole && CEMS_ROLES.includes(body.cemsRole)) {
    data.cemsRole   = body.cemsRole
    data.cemsAccess = body.cemsRole !== 'NONE'   // sync legacy flag ไว้ให้ตรงกัน
  }
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
    const s = String(err)
    return NextResponse.json({ error: s.includes('Unique') ? 'username นี้มีอยู่แล้ว' : s }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  if (!admin) return forbidden()
  const { id } = await params
  const uid = parseInt(id)
  if (uid === admin.uid) return NextResponse.json({ error: 'ห้ามลบบัญชีตัวเอง' }, { status: 400 })
  try {
    await prisma.user.delete({ where: { id: uid } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
