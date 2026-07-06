import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// คืน qrToken ของอะไหล่ (สร้างใหม่ถ้ายังไม่มี) สำหรับทำ QR แขวนที่ชั้นเก็บ
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const pId = parseInt(id)
  let p = await prisma.cemsSparePart.findUnique({ where: { id: pId }, select: { qrToken: true } })
  if (!p) return NextResponse.json({ error: 'ไม่พบอะไหล่' }, { status: 404 })
  if (!p.qrToken) {
    const token = randomBytes(9).toString('base64url')
    p = await prisma.cemsSparePart.update({ where: { id: pId }, data: { qrToken: token }, select: { qrToken: true } })
  }
  return NextResponse.json({ token: p.qrToken })
}
