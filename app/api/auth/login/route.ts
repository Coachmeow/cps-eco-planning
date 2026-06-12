import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signSession, COOKIE_NAME, type UserRole } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  if (!username || !password) {
    return NextResponse.json({ error: 'กรอกชื่อผู้ใช้และรหัสผ่าน' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where:   { username: String(username).trim().toLowerCase() },
    include: { employee: true },
  })

  if (!user || !user.isActive || !verifyPassword(String(password), user.passwordHash)) {
    return NextResponse.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  const name  = user.employee?.nickname ?? user.employee?.fullName ?? user.username
  const token = await signSession({ uid: user.id, role: user.role as UserRole, username: user.username, name })

  const res = NextResponse.json({ role: user.role, name, username: user.username })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7, // 7 วัน
  })
  return res
}
