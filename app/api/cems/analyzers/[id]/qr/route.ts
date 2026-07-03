import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// คืน qrToken ของเครื่อง (สร้างใหม่ถ้ายังไม่มี) สำหรับทำ QR แขวนเครื่อง
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const aId = parseInt(id)
  let a = await prisma.cemsAnalyzer.findUnique({ where: { id: aId }, select: { qrToken: true } })
  if (!a) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })
  if (!a.qrToken) {
    const token = randomBytes(9).toString('base64url')
    a = await prisma.cemsAnalyzer.update({ where: { id: aId }, data: { qrToken: token }, select: { qrToken: true } })
  }
  return NextResponse.json({ token: a.qrToken })
}
