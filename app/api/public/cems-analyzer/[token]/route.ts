import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// รหัสรวม (common) กันคนสแกน QR มั่ว / ข้อมูลรั่ว — ตั้งค่าใน env CEMS_QR_PIN (แนะนำ 6 หลัก)
// ถ้าไม่ตั้งค่า = ไม่บังคับรหัส (เปิดหน้าได้เลย) เพื่อ backward-compat
const CEMS_QR_PIN = process.env.CEMS_QR_PIN || ''

// rate-limit กัน brute-force: ผิดเกิน MAX ครั้งต่อ IP ใน WINDOW → บล็อกชั่วคราว
// (Railway รัน container ถาวร → Map ระดับโมดูลอยู่ข้ามรีเควสต์ได้)
const MAX_FAIL = 5
const WINDOW_MS = 5 * 60_000
const fails = new Map<string, { count: number; first: number }>()
function clientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}
function isBlocked(ip: string) {
  const rec = fails.get(ip)
  if (!rec) return false
  if (Date.now() - rec.first > WINDOW_MS) { fails.delete(ip); return false }
  return rec.count >= MAX_FAIL
}
function noteFail(ip: string) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now - rec.first > WINDOW_MS) fails.set(ip, { count: 1, first: now })
  else rec.count++
  if (fails.size > 5000) fails.clear() // กัน map โตไม่จำกัด
}

// ตรวจสิทธิ์เข้าหน้า: ok / 401 (ยังไม่ใส่หรือใส่ผิด) / 429 (ยิงผิดถี่เกิน)
function checkAccess(req: NextRequest): { ok: true } | { ok: false; res: NextResponse } {
  if (!CEMS_QR_PIN) return { ok: true }
  const ip = clientIp(req)
  if (isBlocked(ip)) return { ok: false, res: NextResponse.json({ error: 'ลองผิดหลายครั้ง กรุณารอสักครู่' }, { status: 429 }) }
  const given = req.headers.get('x-cems-pin') || ''
  if (!given) return { ok: false, res: NextResponse.json({ error: 'ต้องใส่รหัส' }, { status: 401 }) } // probe แรก ไม่นับผิด
  if (given === CEMS_QR_PIN) { fails.delete(ip); return { ok: true } }
  noteFail(ip)
  return { ok: false, res: NextResponse.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 401 }) }
}

// public (ไม่ล็อกอิน แต่ต้องมีรหัสรวมถ้าตั้งค่าไว้) — ข้อมูลเครื่อง CEMS สำหรับหน้า QR แขวนเครื่อง
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = checkAccess(req); if (!gate.ok) return gate.res
  const { token } = await params
  const analyzer = await prisma.cemsAnalyzer.findUnique({
    where: { qrToken: token },
    include: {
      currentSite: { select: { id: true, code: true } },
      homeSite:    { select: { id: true, code: true } },
      events: {
        include: { site: { select: { code: true } } },
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }], take: 10,
      },
    },
  })
  if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })
  const sites = await prisma.cemsSite.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } })
  const { photoUrl, qrToken, ...a } = analyzer
  return NextResponse.json({ ...a, hasPhoto: !!photoUrl, sites })
}

// public — บันทึกกิจกรรมจากหน้างาน: แจ้งอาการ / PM / ย้ายที่อยู่ / ส่งซ่อม / รับคืน
// พร้อม sync สถานะ+ที่อยู่เครื่องให้ตรงกัน (mirror ของ /api/cems/analyzer-events)
const PUBLIC_TYPES = ['ISSUE', 'PM', 'MOVE', 'REPAIR', 'RETURN'] as const
type PublicType = typeof PUBLIC_TYPES[number]

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = checkAccess(req); if (!gate.ok) return gate.res
  const { token } = await params
  const analyzer = await prisma.cemsAnalyzer.findUnique({ where: { qrToken: token }, select: { id: true } })
  if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })

  const body = await req.json()
  const type = body.type as PublicType
  if (!PUBLIC_TYPES.includes(type)) return NextResponse.json({ error: 'ประเภทไม่ถูกต้อง' }, { status: 400 })

  // ตรวจความครบของแต่ละประเภท
  if (type === 'ISSUE'  && !body.symptom) return NextResponse.json({ error: 'กรอกอาการผิดปกติ' }, { status: 400 })
  if (type === 'PM'     && !body.action)  return NextResponse.json({ error: 'กรอกสิ่งที่ทำ' }, { status: 400 })
  if (type === 'REPAIR' && !body.vendor)  return NextResponse.json({ error: 'กรอกสถานที่ส่งซ่อม' }, { status: 400 })

  // MOVE: ต้องเป็นไซต์ที่มีจริง (หรือ null = กลับหน่วยงาน)
  let siteId: number | null = null
  if (body.siteId) {
    const sid = parseInt(String(body.siteId))
    const s = await prisma.cemsSite.findUnique({ where: { id: sid }, select: { id: true } })
    if (!s) return NextResponse.json({ error: 'ไซต์ไม่ถูกต้อง' }, { status: 400 })
    siteId = s.id
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.cemsAnalyzerEvent.create({
      data: {
        analyzerId: analyzer.id,
        type,
        eventDate: new Date(),
        symptom:  type === 'ISSUE' || type === 'REPAIR' ? (body.symptom || null) : null,
        action:   type === 'PM'    || type === 'RETURN' ? (body.action  || null) : null,
        siteId:   type === 'MOVE'   ? siteId : null,
        vendor:   type === 'REPAIR' || type === 'RETURN' ? (body.vendor   || null) : null,
        receiver: type === 'REPAIR' ? (body.receiver || null) : null,
        reporter: body.reporter || null,
        notes:    body.notes    || null,
      },
    })
    // sync สถานะ/ที่อยู่เครื่อง (ไม่แตะ RETIRED — ปลดระวางทำในระบบเท่านั้น)
    const upd: Record<string, unknown> = { statusUpdatedAt: new Date() }
    if (type === 'REPAIR') upd.status = 'REPAIR'
    if (type === 'RETURN') upd.status = 'READY'
    if (type === 'MOVE') { upd.currentSiteId = siteId; upd.status = siteId ? 'IN_USE' : 'READY' }
    await tx.cemsAnalyzer.update({ where: { id: analyzer.id }, data: upd })
    return created
  })
  return NextResponse.json({ ok: true, id: event.id }, { status: 201 })
}
