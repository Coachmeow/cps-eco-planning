import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCemsAdmin, forbidden } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCemsAdmin()) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.code     !== undefined) data.code     = String(body.code).trim()
    if (body.name     !== undefined) data.name     = String(body.name).trim()
    if (body.brand    !== undefined) data.brand    = body.brand    || null
    if (body.unit     !== undefined) data.unit     = body.unit     || null
    if (body.minStock !== undefined) data.minStock = body.minStock !== '' ? parseInt(String(body.minStock)) : 0
    if (body.location !== undefined) data.location = body.location || null
    if (body.refCost  !== undefined) data.refCost  = body.refCost !== '' && body.refCost != null ? parseFloat(String(body.refCost)) : null
    if (body.isActive !== undefined) data.isActive = !!body.isActive
    if (body.notes    !== undefined) data.notes    = body.notes    || null
    const part = await prisma.cemsSparePart.update({ where: { id: parseInt(id) }, data })
    return NextResponse.json(part)
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'รหัสอะไหล่นี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// ลบอะไหล่ — ลบประวัติ txn ทั้งหมดด้วย (client ต้อง confirm ก่อน)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCemsAdmin()
  if (!session) return forbidden()
  try {
    const { id } = await params
    const partId = parseInt(id)
    const part = await prisma.cemsSparePart.findUnique({ where: { id: partId } })
    if (!part) return NextResponse.json({ error: 'ไม่พบอะไหล่' }, { status: 404 })
    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }
    const txns = await prisma.cemsPartTxn.count({ where: { partId } })
    const snapshot = JSON.parse(JSON.stringify({ part, txns }))
    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({ data: { entityType: 'cems-part', entityLabel: `${part.code} — ${part.name}`, reason, snapshot, deletedById: session.uid, deletedByName: session.name || session.username || '—' } })
      await tx.cemsPartTxn.deleteMany({ where: { partId } })
      await tx.cemsSparePart.delete({ where: { id: partId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
