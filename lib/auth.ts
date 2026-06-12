import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// ── Roles ──────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'MANAGER' | 'MAINTENANCE' | 'GENERAL'

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN:       'ผู้ดูแลระบบ',
  MANAGER:     'ผู้จัดการแผนงาน',
  MAINTENANCE: 'ช่างเครื่องมือ',
  GENERAL:     'พนักงานทั่วไป',
}

export const COOKIE_NAME = 'cps_session'

// ── Password hashing (scrypt, no external dep) ─────────────────
// format: scrypt$<saltHex>$<hashHex>
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

// ── Session token (JWT via jose, Edge-compatible) ──────────────
export interface SessionPayload {
  uid:      number
  role:     UserRole
  username: string
  name:     string
}

function secretKey() {
  const s = process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me-in-production'
  return new TextEncoder().encode(s)
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ role: p.role, username: p.username, name: p.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(p.uid))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    return {
      uid:      Number(payload.sub),
      role:     payload.role as UserRole,
      username: payload.username as string,
      name:     payload.name as string,
    }
  } catch {
    return null
  }
}

// ── Read session in server components / route handlers ─────────
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

// ── Permission helpers ─────────────────────────────────────────
export function hasRole(session: SessionPayload | null, ...allowed: UserRole[]): boolean {
  return !!session && allowed.includes(session.role)
}
