// Server-only auth helpers (node:crypto password hashing + cookie session read).
// Re-exports the Edge-safe pieces so existing `@/lib/auth` imports keep working.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySession, type SessionPayload } from './auth-edge'

export * from './auth-edge'

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
