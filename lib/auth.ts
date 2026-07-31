// Server-only auth helpers (node:crypto password hashing + cookie session read).
// Re-exports the Edge-safe pieces so existing `@/lib/auth` imports keep working.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession, hasRole, type SessionPayload, type UserRole } from './auth-edge'

export * from './auth-edge'

// 403 response helper for API routes
export function forbidden() {
  return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, { status: 403 })
}

// คืน session ถ้ามีสิทธิ์ตาม role ที่อนุญาต — ไม่งั้นคืน null (ให้ route ตอบ forbidden())
export async function requireRole(...roles: UserRole[]): Promise<SessionPayload | null> {
  const session = await getSession()
  return hasRole(session, ...roles) ? session : null
}

// ── สิทธิ์โมดูล CEMS (เช็ค DB → มีผลทันทีไม่ต้อง re-login) ──────────
// ADMIN ของระบบ = CEMS Admin เสมอ
async function cemsRoleOf(session: SessionPayload): Promise<'NONE' | 'USER' | 'ADMIN'> {
  if (session.role === 'ADMIN') return 'ADMIN'
  const { prisma } = await import('./prisma')
  const user = await prisma.user.findUnique({
    where: { id: session.uid }, select: { cemsRole: true, cemsAccess: true, isActive: true },
  })
  if (!user?.isActive) return 'NONE'
  // cemsAccess (legacy) ให้ได้แค่ระดับ USER — กัน lockout ถ้า migration ยังไม่ได้รัน ไม่เคยให้สิทธิ์ admin
  if (user.cemsRole === 'NONE' && user.cemsAccess) return 'USER'
  return user.cemsRole
}

/** เข้าโมดูล CEMS ได้ (USER ขึ้นไป) — ดูข้อมูล + บันทึกงานประจำวัน */
export async function requireCems(): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  return (await cemsRoleOf(session)) !== 'NONE' ? session : null
}

/** สิทธิ์จัดการ CEMS (ADMIN เท่านั้น) — อนุมัติคำขอ, ลบข้อมูล, จัดการทะเบียน/แผน, ตัดสต็อกตรง */
export async function requireCemsAdmin(): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  return (await cemsRoleOf(session)) === 'ADMIN' ? session : null
}

/** ระดับสิทธิ์ CEMS ของ session ปัจจุบัน (ใช้ตอบ /api/auth/me ให้ UI ซ่อนปุ่ม) */
export async function getCemsRole(): Promise<'NONE' | 'USER' | 'ADMIN'> {
  const session = await getSession()
  return session ? cemsRoleOf(session) : 'NONE'
}

// ── Password hashing (scrypt) — format: scrypt$<saltHex>$<hashHex> ──
export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const hash = Buffer.from(parts[2], 'hex')
  const test = scryptSync(pw, salt, hash.length)
  return hash.length === test.length && timingSafeEqual(hash, test)
}

// ── Read session in server components / route handlers ──────────
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}
