import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hasRole, forbidden } from '@/lib/auth'

// รายละเอียดเครื่อง + ปริมาณใช้งานสะสม (วันออกงาน) + ประวัติซ่อม/Cal
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eqId = parseInt(id)
  const equipment = await prisma.equipment.findUnique({
    where: { id: eqId }, include: { type: { include: { primaryTeam: true } } },
  })
  if (!equipment) return NextResponse.json({ error: 'ไม่พบเครื่องมือ' }, { status: 404 })
  const usageDays = await prisma.equipmentAssignment.count({ where: { equipmentId: eqId } })
  const events = await prisma.equipmentEvent.findMany({
    where: { equipmentId: eqId }, orderBy: { sentDate: 'desc' },
  })
  return NextResponse.json({ ...equipment, usageDays, events })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER', 'MAINTENANCE')) return forbidden()
  try {
    const { id } = await params
    const body   = await req.json()

    // MAINTENANCE: แก้ได้เฉพาะสถานะเครื่องมือเท่านั้น
    if (session!.role === 'MAINTENANCE') {
      const equipment = await prisma.equipment.update({
        where: { id: parseInt(id) },
        data:  { status: body.status ?? 'ACTIVE' },
        include: { type: { include: { primaryTeam: true } } },
      })
      return NextResponse.json(equipment)
    }

    // ADMIN / MANAGER: แก้ได้ทุกฟิลด์
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
        brand:           body.brand           || null,
        model:           body.model           || null,
        vendor:          body.vendor          || null,
        purchaseDate:    body.purchaseDate    ? new Date(body.purchaseDate) : null,
        purchasePrice:   body.purchasePrice != null && body.purchasePrice !== '' ? parseInt(body.purchasePrice) : null,
        lifespanYears:   body.lifespanYears != null && body.lifespanYears !== '' ? parseInt(body.lifespanYears) : null,
      },
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const eqId = parseInt(id)
    const eq = await prisma.equipment.findUnique({ where: { id: eqId }, select: { isRental: true } })
    if (!eq) return NextResponse.json({ error: 'ไม่พบเครื่องมือ' }, { status: 404 })

    // เครื่องมือที่ซื้อ ลบได้เฉพาะ ADMIN — เครื่องเช่า ADMIN/MANAGER ลบได้
    if (!eq.isRental && session!.role !== 'ADMIN') {
      return NextResponse.json({ error: 'เครื่องมือที่ซื้อ ลบได้เฉพาะผู้ดูแลระบบ' }, { status: 403 })
    }

    await prisma.equipmentAssignment.deleteMany({ where: { equipmentId: eqId } })
    await prisma.equipment.delete({ where: { id: eqId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
