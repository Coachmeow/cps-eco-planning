import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

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
