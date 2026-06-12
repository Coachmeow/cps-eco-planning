import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  const { id }       = await params
  const { expiryDate } = await req.json()
  const updated = await prisma.employeeSiteAccess.update({
    where: { id: parseInt(id) },
    data:  { expiryDate: new Date(expiryDate) },
  })
  return NextResponse.json(updated)
}
