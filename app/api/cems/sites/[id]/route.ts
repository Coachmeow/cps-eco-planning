import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCemsAdmin, forbidden } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCemsAdmin()) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.code !== undefined) data.code = String(body.code).trim()
    if (body.name !== undefined) data.name = body.name || null
    const site = await prisma.cemsSite.update({ where: { id: parseInt(id) }, data })
    return NextResponse.json(site)
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'โค้ดไซต์นี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// ลบได้เฉพาะไซต์ที่ไม่มีเครื่อง/ประวัติอ้างอยู่
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCemsAdmin()
  if (!session) return forbidden()
  try {
    const { id } = await params
    const siteId = parseInt(id)
    const site = await prisma.cemsSite.findUnique({ where: { id: siteId } })
    if (!site) return NextResponse.json({ error: 'ไม่พบไซต์' }, { status: 404 })
    const [anCur, anHome, evts] = await Promise.all([
      prisma.cemsAnalyzer.count({ where: { currentSiteId: siteId } }),
      prisma.cemsAnalyzer.count({ where: { homeSiteId: siteId } }),
      prisma.cemsAnalyzerEvent.count({ where: { siteId } }),
    ])
    if (anCur + anHome + evts > 0) {
      return NextResponse.json({ error: `ลบไม่ได้ — มีเครื่อง/ประวัติอ้างถึงไซต์นี้ (${anCur + anHome} เครื่อง, ${evts} ประวัติ)` }, { status: 400 })
    }
    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }
    const snapshot = JSON.parse(JSON.stringify({ site }))
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({ data: { entityType: 'cems-site', entityLabel: `CEMS ไซต์ ${site.code}`, reason, snapshot, deletedById: session.uid, deletedByName: session.name || session.username || '—' } })
      await tx.cemsSite.delete({ where: { id: siteId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
