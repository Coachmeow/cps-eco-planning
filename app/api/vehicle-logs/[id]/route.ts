import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// แก้ไข log (เช่น เคลียร์ mismatch หลังตรวจสอบ) / ลบ
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (typeof body.mismatch === 'boolean') data.mismatch = body.mismatch
  if (body.mileage != null && body.mileage !== '') data.mileage = parseInt(String(body.mileage))
  if (body.notes !== undefined) data.notes = body.notes || null
  const log = await prisma.vehicleLog.update({ where: { id: parseInt(id) }, data })
  return NextResponse.json(log)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  await prisma.vehicleLog.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ ok: true })
}
