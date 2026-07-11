import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, verifySession, type UserRole } from '@/lib/auth-edge'

// page prefix → roles ที่เข้าได้ (coarse gate; สิทธิ์ละเอียดบังคับใน API)
const PAGE_ACCESS: { prefix: string; roles: UserRole[] }[] = [
  { prefix: '/dashboard', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/staff',     roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/equipment', roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/vehicles',  roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/access',    roles: ['ADMIN', 'MANAGER', 'GENERAL'] },
  { prefix: '/admin',     roles: ['ADMIN', 'MANAGER', 'MAINTENANCE'] },
  // /cems: coarse gate = ล็อกอินทุก role — สิทธิ์ CEMS จริงเช็คใน API (requireCems) + หน้า /cems
  { prefix: '/cems',      roles: ['ADMIN', 'MANAGER', 'MAINTENANCE', 'GENERAL'] },
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
    pathname.startsWith('/m/') ||         // หน้า logbook QR (ไม่ล็อกอิน)
    pathname.startsWith('/a/') ||         // หน้า QR เครื่อง CEMS (ไม่ล็อกอิน)
    pathname.startsWith('/p/') ||         // หน้า QR ขอเบิกอะไหล่ CEMS (ไม่ล็อกอิน)
    pathname.startsWith('/g/') ||         // หน้า QR ถังแก๊สมาตรฐาน CEMS (ไม่ล็อกอิน)
    pathname.startsWith('/api/public') || // public API
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
