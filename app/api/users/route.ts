import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden, hashPassword, type UserRole } from '@/lib/auth'

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL']

export async function GET() {
  if (!await requireRole('ADMIN')) return forbidden()
  const users = await prisma.user.findMany({
    include: { employee: { include: { primaryTeam: true } } },
    orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
  })
  // ไม่ส่ง passwordHash ออกไป
  return NextResponse.json(users.map((u) => ({
    id:           u.id,
    username:     u.username,
    role:         u.role,
    isActive:     u.isActive,
    cemsAccess:   u.cemsAccess,
    employeeId:   u.employeeId,
    employeeName: u.employee?.nickname ?? u.employee?.fullName ?? null,
    fullName:     u.employee?.fullName ?? null,
    team:         u.employee?.primaryTeam.code ?? null,
  })))
}

// สร้างบัญชีผู้ใช้ใหม่ (ADMIN) — ผูกพนักงานได้ (ไม่บังคับ)
export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN')) return forbidden()
  const body = await req.json()
  const username = String(body.username ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!username || !password) return NextResponse.json({ error: 'กรอก username และรหัสผ่าน' }, { status: 400 })
  if (password.length < 4)     return NextResponse.json({ error: 'รหัสผ่านอย่างน้อย 4 ตัวอักษร' }, { status: 400 })
  const role: UserRole = ROLES.includes(body.role) ? body.role : 'GENERAL'
  const employeeId = body.employeeId != null && body.employeeId !== '' ? parseInt(String(body.employeeId)) : null

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        role,
        cemsAccess: !!body.cemsAccess,
        employeeId,
      },
    })
    return NextResponse.json({ id: user.id, username: user.username }, { status: 201 })
  } catch (err) {
    const s = String(err)
    const msg = s.includes('Unique') && s.includes('employeeId') ? 'พนักงานคนนี้มีบัญชีอยู่แล้ว'
      : s.includes('Unique') ? 'username นี้มีอยู่แล้ว' : s
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
