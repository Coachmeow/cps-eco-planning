import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// คืน qrToken ของรถ (สร้างใหม่ถ้ายังไม่มี) สำหรับทำ QR
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const vId = parseInt(id)
  let v = await prisma.vehicle.findUnique({ where: { id: vId }, select: { qrToken: true } })
  if (!v) return NextResponse.json({ error: 'ไม่พบรถ' }, { status: 404 })
  if (!v.qrToken) {
    const token = randomBytes(9).toString('base64url')
    v = await prisma.vehicle.update({ where: { id: vId }, data: { qrToken: token }, select: { qrToken: true } })
  }
  return NextResponse.json({ token: v.qrToken })
}
