import { NextResponse } from 'next/server'
import { getSession, getCemsRole } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ user: null })
  // แนบสิทธิ์ CEMS จาก DB (มีผลทันทีเมื่อแอดมินเปลี่ยนให้ ไม่ต้อง re-login)
  const cemsRole = await getCemsRole()
  return NextResponse.json({ user: { ...session, cemsRole, cemsAccess: cemsRole !== 'NONE' } })
}
