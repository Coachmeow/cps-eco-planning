import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const equipment = await prisma.equipment.update({
      where: { id: parseInt(id) },
      data: {
        typeId:          parseInt(body.typeId),
        internalNo:      body.internalNo      || null,
        serialNo:        body.serialNo        || null,
        isRental:        body.isRental        ?? false,
        rentalVendor:    body.rentalVendor    || null,
        rentalStartDate: body.rentalStartDate ? new Date(body.rentalStartDate) : null,
        rentalEndDate:   body.rentalEndDate   ? new Date(body.rentalEndDate)   : null,
        status:          body.status          ?? 'ACTIVE',
        notes:           body.notes           || null,
      },
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const eqId = parseInt(id)
    await prisma.equipmentAssignment.deleteMany({ where: { equipmentId: eqId } })
    await prisma.equipment.delete({ where: { id: eqId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
