import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// สร้าง event + sync สถานะเครื่องอัตโนมัติ
// REPAIR→REPAIR · RETURN→READY · MOVE→ย้าย currentSite (มีไซต์=IN_USE, กลับหน่วยงาน=READY)
export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const body = await req.json()
    const { analyzerId, type } = body
    if (!analyzerId || !type) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })

    const aId = parseInt(String(analyzerId))
    const analyzer = await prisma.cemsAnalyzer.findUnique({ where: { id: aId }, select: { id: true } })
    if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })

    const siteId = body.siteId ? parseInt(String(body.siteId)) : null
    const event = await prisma.cemsAnalyzerEvent.create({
      data: {
        analyzerId: aId,
        type,
        eventDate: body.eventDate ? new Date(body.eventDate) : new Date(),
        symptom:  body.symptom  || null,
        action:   body.action   || null,
        siteId,
        vendor:   body.vendor   || null,
        receiver: body.receiver || null,
        reporter: body.reporter || null,
        notes:    body.notes    || null,
      },
      include: { site: { select: { code: true } } },
    })

    // sync สถานะ/ที่อยู่เครื่อง
    const upd: Record<string, unknown> = { statusUpdatedAt: new Date() }
    if (type === 'REPAIR') upd.status = 'REPAIR'
    if (type === 'RETURN') upd.status = 'READY'
    if (type === 'MOVE') { upd.currentSiteId = siteId; upd.status = siteId ? 'IN_USE' : 'READY' }
    await prisma.cemsAnalyzer.update({ where: { id: aId }, data: upd })

    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
