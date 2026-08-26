import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, requireCemsAdmin, forbidden } from '@/lib/auth'

// รายละเอียดเครื่อง + timeline ประวัติทั้งหมด
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const aId = parseInt(id)
  const analyzer = await prisma.cemsAnalyzer.findUnique({
    where: { id: aId },
    include: {
      currentSite: { select: { id: true, code: true } },
      homeSite:    { select: { id: true, code: true } },
      events: { include: { site: { select: { code: true } } }, orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }] },
      // ประวัติเปลี่ยนอะไหล่ของเครื่องนี้ (OUT ที่ stamp analyzerId ไว้) — ตรึงถาวร แม้ย้าย/ปลดระวางก็ไม่หลุด
      partTxns: {
        where: { type: 'OUT' },
        select: {
          id: true, qty: true, txnDate: true, quoteNo: true, person: true, notes: true,
          part: { select: { code: true, name: true, unit: true } },
          site: { select: { code: true } },
        },
        orderBy: [{ txnDate: 'desc' }, { id: 'desc' }],
      },
    },
  })
  if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })
  const { photoUrl, ...a } = analyzer
  return NextResponse.json({ ...a, hasPhoto: !!photoUrl })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCemsAdmin()) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    // partial update — อัปเดตเฉพาะ key ที่ส่งมา (กันทับรูป/ฟิลด์อื่นเป็น null)
    const data: Record<string, unknown> = {}
    if (body.tag           !== undefined) data.tag           = String(body.tag).trim()
    if (body.brand         !== undefined) data.brand         = body.brand     || null
    if (body.model         !== undefined) data.model         = body.model     || null
    if (body.serialNo      !== undefined) data.serialNo      = body.serialNo  || null
    if (body.parameter     !== undefined) data.parameter     = body.parameter || null
    if (body.ownership     !== undefined) data.ownership     = body.ownership
    if (body.homeSiteId    !== undefined) data.homeSiteId    = body.homeSiteId    ? parseInt(String(body.homeSiteId))    : null
    if (body.currentSiteId !== undefined) { data.currentSiteId = body.currentSiteId ? parseInt(String(body.currentSiteId)) : null; data.statusUpdatedAt = new Date() }
    if (body.status        !== undefined) { data.status = body.status; data.statusUpdatedAt = new Date() }
    if (body.receivedDate  !== undefined) data.receivedDate  = body.receivedDate ? new Date(body.receivedDate) : null
    if (body.photoUrl      !== undefined) data.photoUrl      = body.photoUrl || null
    if (body.notes         !== undefined) data.notes         = body.notes    || null

    const analyzer = await prisma.cemsAnalyzer.update({
      where: { id: parseInt(id) }, data,
      include: { currentSite: { select: { id: true, code: true } }, homeSite: { select: { id: true, code: true } } },
    })
    return NextResponse.json(analyzer)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCemsAdmin()
  if (!session) return forbidden()
  try {
    const { id } = await params
    const aId = parseInt(id)
    const a = await prisma.cemsAnalyzer.findUnique({ where: { id: aId } })
    if (!a) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })
    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }
    const events = await prisma.cemsAnalyzerEvent.count({ where: { analyzerId: aId } })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photoUrl, ...aNoPhoto } = a
    const snapshot = JSON.parse(JSON.stringify({ analyzer: aNoPhoto, events, hadPhoto: !!photoUrl }))
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({ data: { entityType: 'cems-analyzer', entityLabel: `Analyzer ${a.tag}`, reason, snapshot, deletedById: session.uid, deletedByName: session.name || session.username || '—' } })
      await tx.cemsAnalyzerEvent.deleteMany({ where: { analyzerId: aId } })
      await tx.cemsAnalyzer.delete({ where: { id: aId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
