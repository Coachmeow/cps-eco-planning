import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { computeNextDue } from '@/lib/cemsSchedule'

export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const sp = req.nextUrl.searchParams
  const where: Record<string, unknown> = {}
  if (sp.get('siteId'))     where.siteId     = parseInt(sp.get('siteId')!)
  if (sp.get('analyzerId')) where.analyzerId = parseInt(sp.get('analyzerId')!)
  if (sp.get('partId'))     where.partId     = parseInt(sp.get('partId')!)

  const rows = await prisma.cemsPartSchedule.findMany({
    where,
    include: { part: true, analyzer: { select: { id: true, tag: true } }, site: { select: { id: true, code: true } } },
    orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const b = await req.json()
    const partId = parseInt(String(b.partId))
    if (!partId) return NextResponse.json({ error: 'เลือกอะไหล่' }, { status: 400 })
    const analyzerId = b.analyzerId ? parseInt(String(b.analyzerId)) : null
    const siteId     = b.siteId ? parseInt(String(b.siteId)) : null
    if (!analyzerId && !siteId) return NextResponse.json({ error: 'เลือก analyzer หรือไซต์อย่างน้อย 1 อย่าง' }, { status: 400 })

    const mode = b.mode === 'ON_CONDITION' ? 'ON_CONDITION' : 'TIME_BASE'
    const intervalMonths = mode === 'TIME_BASE' && b.intervalMonths ? parseInt(String(b.intervalMonths)) : null
    if (mode === 'TIME_BASE' && !intervalMonths) return NextResponse.json({ error: 'กรอกรอบ (เดือน) สำหรับ Time-base' }, { status: 400 })
    const lastReplacedDate = b.lastReplacedDate ? new Date(b.lastReplacedDate) : null

    const created = await prisma.cemsPartSchedule.create({
      data: {
        partId, analyzerId, siteId, mode, intervalMonths,
        qtyPerReplace: b.qtyPerReplace != null && b.qtyPerReplace !== '' ? parseInt(String(b.qtyPerReplace)) : 1,
        lastReplacedDate,
        nextDueDate: computeNextDue(mode, intervalMonths, lastReplacedDate),
        notes: b.notes || null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
