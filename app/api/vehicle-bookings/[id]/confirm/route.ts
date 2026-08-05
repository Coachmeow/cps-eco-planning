import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// POST → ยืนยันงานจองรถ (แม่ + วันลูกทั้งชุด) ; รับ id วันแม่หรือวันลูกก็ได้
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const target = await prisma.vehicleBooking.findUnique({
      where: { id: parseInt(id) }, select: { id: true, parentId: true },
    })
    if (!target) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })

    const rootId = target.parentId ?? target.id
    await prisma.vehicleBooking.updateMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      data:  { isTentative: false, tentativeReason: null },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
