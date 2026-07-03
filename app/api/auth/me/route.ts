import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ user: null })
  // แนบสิทธิ์ CEMS จาก DB (มีผลทันทีเมื่อแอดมินติ๊กให้ ไม่ต้อง re-login)
  const user = await prisma.user.findUnique({ where: { id: session.uid }, select: { cemsAccess: true } })
  return NextResponse.json({ user: { ...session, cemsAccess: session.role === 'ADMIN' || !!user?.cemsAccess } })
}
