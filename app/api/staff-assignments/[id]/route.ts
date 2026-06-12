import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  await prisma.staffAssignment.deleteMany({ where: { parentId: parseInt(id) } })
  await prisma.staffAssignment.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id } = await params
  const body    = await req.json()
  const current = await prisma.staffAssignment.findUnique({ where: { id: parseInt(id) } })
  if (!current) return NextResponse.json({ error: 'ไม่พบ' }, { status: 404 })
  if (current.isLocked) return NextResponse.json({ error: 'ถูก lock ไว้' }, { status: 403 })

  const updated = await prisma.staffAssignment.update({
    where: { id: parseInt(id) },
    data:  body,
    include: { employee: true, site: true, serviceType: true },
  })
  return NextResponse.json(updated)
}
