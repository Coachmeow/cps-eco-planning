import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') // 'open' | 'all'
  const type   = searchParams.get('type')   // 'REPAIR' | 'CALIBRATION'

  const events = await prisma.equipmentEvent.findMany({
    where: {
      ...(status === 'open' ? { returnedDate: null } : {}),
      ...(type ? { type: type as 'REPAIR' | 'CALIBRATION' } : {}),
    },
    include: { equipment: { include: { type: true } } },
    orderBy: [{ returnedDate: 'asc' }, { sentDate: 'desc' }],
  })
  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER', 'MAINTENANCE')) return forbidden()
  try {
    const body = await req.json()
    if (!body.equipmentId || !body.type || !body.sentDate) {
      return NextResponse.json({ error: 'กรอกเครื่องมือ ประเภท และวันส่ง' }, { status: 400 })
    }
    const event = await prisma.equipmentEvent.create({
      data: {
        equipmentId:  parseInt(body.equipmentId),
        type:         body.type,
        sentDate:     new Date(body.sentDate),
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
        nextDueDate:  body.nextDueDate  ? new Date(body.nextDueDate)  : null,
        vendor:       body.vendor || null,
        cost:         body.cost != null && body.cost !== '' ? parseInt(body.cost) : null,
        notes:        body.notes || null,
      },
    })
    // อัปเดตสถานะเครื่องอัตโนมัติ: ซ่อม → BROKEN, Cal → CALIBRATING
    await prisma.equipment.update({
      where: { id: parseInt(body.equipmentId) },
      data:  { status: body.type === 'REPAIR' ? 'BROKEN' : 'CALIBRATING' },
    })
    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
