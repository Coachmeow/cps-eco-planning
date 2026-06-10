import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const typeId  = req.nextUrl.searchParams.get('typeId')
  const all     = req.nextUrl.searchParams.get('all') === 'true' // admin: show retired too
  const today   = new Date(); today.setHours(0, 0, 0, 0)

  const equipment = await prisma.equipment.findMany({
    where: all ? {} : {
      status: { not: 'RETIRED' },
      // ซ่อนเครื่องเช่าที่หมดสัญญาแล้วออกจาก active view
      OR: [
        { isRental: false },
        { rentalEndDate: null },
        { rentalEndDate: { gte: today } },
      ],
      ...(typeId ? { typeId: parseInt(typeId) } : {}),
    },
    include: { type: { include: { primaryTeam: true } } },
    orderBy: [{ typeId: 'asc' }, { internalNo: 'asc' }],
  })
  return NextResponse.json(equipment)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const equipment = await prisma.equipment.create({
      data: {
        typeId:         parseInt(body.typeId),
        internalNo:     body.internalNo || null,
        serialNo:       body.serialNo   || null,
        isRental:       body.isRental   ?? false,
        rentalVendor:   body.rentalVendor   || null,
        rentalStartDate: body.rentalStartDate ? new Date(body.rentalStartDate) : null,
        rentalEndDate:   body.rentalEndDate   ? new Date(body.rentalEndDate)   : null,
        status:         body.status ?? 'ACTIVE',
        notes:          body.notes  || null,
      },
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
