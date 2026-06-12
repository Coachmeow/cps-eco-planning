import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, verifySession, type UserRole } from '@/lib/auth-edge'

// page prefix → roles ที่เข้าได้ (coarse gate; สิทธิ์ละเอียดบังคับใน API)
const PAGE_ACCESS: { prefix: string; roles: UserRole[] }[] = [
  { prefix: '/dashboard', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/staff',     roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/equipment', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/access',    roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/admin',     roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
]

function landingFor(role: UserRole): string {
  return role === 'MAINTENANCE' ? '/admin' : '/dashboard'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // public / infra paths
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')           // static files (favicon, images, etc.)
  ) {
    return NextResponse.next()
  }

  const token   = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null

  // API (non-auth): require a valid session; per-route handler enforces role
  if (pathname.startsWith('/api')) {
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    return NextResponse.next()
  }

  // pages: must be logged in
  if (!session) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; return NextResponse.redirect(url)
  }

  // root → role landing page
  if (pathname === '/') {
    const url = req.nextUrl.clone(); url.pathname = landingFor(session.role); return NextResponse.redirect(url)
  }

  // page-level role gate
  const rule = PAGE_ACCESS.find((p) => pathname.startsWith(p.prefix))
  if (rule && !rule.roles.includes(session.role)) {
    const url = req.nextUrl.clone(); url.pathname = landingFor(session.role); return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
