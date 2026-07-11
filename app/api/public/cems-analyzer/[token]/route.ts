import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkQrAccess } from '@/lib/cemsQrPin'

// public (ไม่ล็อกอิน แต่ต้องมีรหัสรวมถ้าตั้งค่าไว้) — ข้อมูลเครื่อง CEMS สำหรับหน้า QR แขวนเครื่อง
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = checkQrAccess(req); if (!gate.ok) return gate.res
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
  const gate = checkQrAccess(req); if (!gate.ok) return gate.res
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
