import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.equipmentAssignment.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body    = await req.json()
  const current = await prisma.equipmentAssignment.findUnique({ where: { id: parseInt(id) } })
  if (!current) return NextResponse.json({ error: 'ไม่พบ' }, { status: 404 })
  if (current.isLocked) return NextResponse.json({ error: 'ถูก lock ไว้' }, { status: 403 })

  const updated = await prisma.equipmentAssignment.update({
    where: { id: parseInt(id) },
    data:  body,
    include: { equipment: { include: { type: true } }, site: true },
  })
  return NextResponse.json(updated)
}
