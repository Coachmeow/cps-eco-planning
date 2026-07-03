import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

export async function GET() {
  if (!await requireCems()) return forbidden()
  const analyzers = await prisma.cemsAnalyzer.findMany({
    include: {
      currentSite: { select: { id: true, code: true } },
      homeSite:    { select: { id: true, code: true } },
      _count:      { select: { events: true } },
    },
    orderBy: [{ ownership: 'asc' }, { tag: 'asc' }],
  })
  // strip base64 photoUrl (โหลดผ่าน /photo)
  const out = analyzers.map(({ photoUrl, ...a }) => ({ ...a, hasPhoto: !!photoUrl }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const body = await req.json()
    if (!body.tag) return NextResponse.json({ error: 'กรอกชื่อ/รหัสเครื่อง' }, { status: 400 })
    const analyzer = await prisma.cemsAnalyzer.create({
      data: {
        tag:           String(body.tag).trim(),
        brand:         body.brand     || null,
        model:         body.model     || null,
        serialNo:      body.serialNo  || null,
        parameter:     body.parameter || null,
        ownership:     body.ownership ?? 'POOL_OWN',
        homeSiteId:    body.homeSiteId    ? parseInt(String(body.homeSiteId))    : null,
        currentSiteId: body.currentSiteId ? parseInt(String(body.currentSiteId)) : null,
        status:        body.status ?? 'READY',
        receivedDate:  body.receivedDate ? new Date(body.receivedDate) : null,
        photoUrl:      body.photoUrl || null,
        notes:         body.notes    || null,
      },
      include: { currentSite: { select: { id: true, code: true } }, homeSite: { select: { id: true, code: true } } },
    })
    return NextResponse.json(analyzer, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
