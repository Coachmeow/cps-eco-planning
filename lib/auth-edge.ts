// Edge-safe auth helpers (jose only — no node:crypto / next/headers).
// Imported by middleware.ts (Edge runtime) and re-exported from lib/auth.ts.
import { SignJWT, jwtVerify } from 'jose'
import type { UserRole } from './roles'

export type { UserRole } from './roles'
export { ROLE_LABEL } from './roles'

export const COOKIE_NAME = 'cps_session'

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

export function hasRole(session: SessionPayload | null, ...allowed: UserRole[]): boolean {
  return !!session && allowed.includes(session.role)
}
