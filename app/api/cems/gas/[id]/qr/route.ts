import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// คืน qrToken ของถังแก๊ส (สร้างใหม่ถ้ายังไม่มี) สำหรับทำ QR แขวนที่ถัง → สแกนอัปเดตความดัน
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const cid = parseInt(id)
  let c = await prisma.cemsGasCylinder.findUnique({ where: { id: cid }, select: { qrToken: true } })
  if (!c) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })
  if (!c.qrToken) {
    const token = randomBytes(9).toString('base64url')
    c = await prisma.cemsGasCylinder.update({ where: { id: cid }, data: { qrToken: token }, select: { qrToken: true } })
  }
  return NextResponse.json({ token: c.qrToken })
}
