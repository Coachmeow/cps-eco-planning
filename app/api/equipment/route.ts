import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

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

  // สถานะตามวันที่ (D6): CALIBRATING/BROKEN ขึ้นเฉพาะเมื่อมีใบงานเปิดที่ "ถึงวันส่งแล้ว"
  //   ใบงานที่วันส่งยังเป็นอนาคต (แผนจะส่ง) = เครื่องยังใช้งานได้ → ACTIVE ; RETIRED คงเดิม
  //   คิดตอนอ่าน เพราะไม่มี cron มาพลิกสถานะตอนถึงวัน (ให้เปลี่ยนเองเมื่อถึงวันส่ง)
  const openEvents = await prisma.equipmentEvent.findMany({
    where:  { returnedDate: null, sentDate: { lte: today }, equipmentId: { in: equipment.map(e => e.id) } },
    select: { equipmentId: true, type: true },
  })
  const startedByEq = new Map() // equipmentId → 'REPAIR' | 'CALIBRATION' (REPAIR สำคัญกว่า)
  for (const ev of openEvents) {
    if (startedByEq.get(ev.equipmentId) !== 'REPAIR') startedByEq.set(ev.equipmentId, ev.type)
  }
  const effectiveStatus = (e: { id: number; status: string }): string => {
    if (e.status === 'RETIRED') return 'RETIRED'
    const started = startedByEq.get(e.id)
    return started === 'REPAIR' ? 'BROKEN' : started === 'CALIBRATION' ? 'CALIBRATING' : 'ACTIVE'
  }

  // strip base64 photoUrl ออกจาก list (โหลดผ่าน /photo) ส่งแค่ hasPhoto
  const out = equipment.map(({ photoUrl, ...e }) => ({ ...e, status: effectiveStatus(e), hasPhoto: !!photoUrl }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
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
        photoUrl:       body.photoUrl || null,
        brand:          body.brand  || null,
        model:          body.model  || null,
        vendor:         body.vendor || null,
        purchaseDate:   body.purchaseDate ? new Date(body.purchaseDate) : null,
        purchasePrice:  body.purchasePrice != null && body.purchasePrice !== '' ? parseInt(body.purchasePrice) : null,
        lifespanYears:  body.lifespanYears != null && body.lifespanYears !== '' ? parseInt(body.lifespanYears) : null,
      },
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
