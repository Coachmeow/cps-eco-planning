import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }       = await params
  const { expiryDate } = await req.json()
  const updated = await prisma.employeeSiteAccess.update({
    where: { id: parseInt(id) },
    data:  { expiryDate: new Date(expiryDate) },
  })
  return NextResponse.json(updated)
}
