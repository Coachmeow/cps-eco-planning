import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCemsAdmin, forbidden } from '@/lib/auth'
import { computeNextDue } from '@/lib/cemsSchedule'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCemsAdmin()) return forbidden()
  const { id } = await params
  const sid = parseInt(id)
  try {
    const b = await req.json()
    const cur = await prisma.cemsPartSchedule.findUnique({ where: { id: sid } })
    if (!cur) return NextResponse.json({ error: 'ไม่พบแผน' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (b.analyzerId !== undefined) data.analyzerId = b.analyzerId ? parseInt(String(b.analyzerId)) : null
    if (b.siteId !== undefined)     data.siteId     = b.siteId ? parseInt(String(b.siteId)) : null
    if (b.mode !== undefined)       data.mode       = b.mode === 'ON_CONDITION' ? 'ON_CONDITION' : 'TIME_BASE'
    if (b.intervalMonths !== undefined) data.intervalMonths = b.intervalMonths ? parseInt(String(b.intervalMonths)) : null
    if (b.qtyPerReplace !== undefined)  data.qtyPerReplace  = b.qtyPerReplace ? parseInt(String(b.qtyPerReplace)) : 1
    if (b.lastReplacedDate !== undefined) data.lastReplacedDate = b.lastReplacedDate ? new Date(b.lastReplacedDate) : null
    if (b.isActive !== undefined)   data.isActive   = !!b.isActive
    if (b.notes !== undefined)      data.notes      = b.notes || null

    // recompute nextDueDate จากค่าล่าสุด (ผสมของเดิม)
    const mode = (data.mode ?? cur.mode) as string
    const interval = (data.intervalMonths !== undefined ? data.intervalMonths : cur.intervalMonths) as number | null
    const last = (data.lastReplacedDate !== undefined ? data.lastReplacedDate : cur.lastReplacedDate) as Date | null
    data.nextDueDate = computeNextDue(mode, interval, last)

    const updated = await prisma.cemsPartSchedule.update({ where: { id: sid }, data })
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCemsAdmin()
  if (!session) return forbidden()
  const { id } = await params
  try {
    const sid = parseInt(id)
    const sched = await prisma.cemsPartSchedule.findUnique({ where: { id: sid }, include: { part: true, analyzer: true, site: true } })
    if (!sched) return NextResponse.json({ error: 'ไม่พบแผน' }, { status: 404 })
    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }
    const label = `แผน ${sched.part.code} (${sched.analyzer?.tag ?? sched.site?.code ?? '—'})`
    const snapshot = JSON.parse(JSON.stringify({ schedule: sched }))
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({ data: { entityType: 'cems-schedule', entityLabel: label, reason, snapshot, deletedById: session.uid, deletedByName: session.name || session.username || '—' } })
      await tx.cemsPartSchedule.delete({ where: { id: sid } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
