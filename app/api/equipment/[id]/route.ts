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
  const { photoUrl, ...eq } = equipment
  return NextResponse.json({ ...eq, hasPhoto: !!photoUrl, usageDays, events })
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
        // อัปเดตรูปเฉพาะตอนส่งมา (กันทับรูปเดิมเป็น null)
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl || null } : {}),
      },
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// PATCH = แก้ไขบางฟิลด์ — ตอนนี้ใช้ตั้ง/แก้/ลบ "แผน Cal" (calDueDate) รายเครื่อง
// calDueDate = null → ลบออกจากแผน ; ADMIN/MANAGER (ทีมจัดแผน)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.calDueDate !== undefined) data.calDueDate = body.calDueDate ? new Date(body.calDueDate) : null
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'ไม่มีข้อมูลให้แก้' }, { status: 400 })
    const equipment = await prisma.equipment.update({
      where: { id: parseInt(id) }, data,
      include: { type: { include: { primaryTeam: true } } },
    })
    return NextResponse.json(equipment)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!hasRole(session, 'ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const eqId = parseInt(id)
    const eq = await prisma.equipment.findUnique({ where: { id: eqId }, include: { type: true } })
    if (!eq) return NextResponse.json({ error: 'ไม่พบเครื่องมือ' }, { status: 404 })

    // เครื่องมือที่ซื้อ ลบได้เฉพาะ ADMIN — เครื่องเช่า ADMIN/MANAGER ลบได้
    if (!eq.isRental && session!.role !== 'ADMIN') {
      return NextResponse.json({ error: 'เครื่องมือที่ซื้อ ลบได้เฉพาะผู้ดูแลระบบ' }, { status: 403 })
    }

    let reason: string | null = null
    try { const b = await req.json(); reason = b?.reason ? String(b.reason) : null } catch { /* no body */ }

    // ประวัติ + การจอง ที่จะถูกลบไปด้วย — เก็บลง snapshot ก่อน
    const events = await prisma.equipmentEvent.findMany({ where: { equipmentId: eqId } })
    const assignmentCount = await prisma.equipmentAssignment.count({ where: { equipmentId: eqId } })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photoUrl, ...eqNoPhoto } = eq   // ตัดรูป base64 ออกจาก snapshot กัน log บวม
    const label = `${eq.type.code} ${eq.internalNo ?? eq.serialNo ?? `#${eq.id}`}${eq.serialNo ? ` (serial ${eq.serialNo})` : ''}`
    // แปลงเป็น plain JSON (Date → string) ให้ Prisma Json รับได้
    const snapshot = JSON.parse(JSON.stringify({ equipment: eqNoPhoto, events, assignmentCount, hadPhoto: !!photoUrl }))

    await prisma.$transaction(async (tx) => {
      await tx.deletionLog.create({
        data: {
          entityType:    'equipment',
          entityLabel:   label,
          reason,
          snapshot,
          deletedById:   session!.uid,
          deletedByName: session!.name || session!.username || '—',
        },
      })
      await tx.equipmentEvent.deleteMany({ where: { equipmentId: eqId } })
      await tx.equipmentAssignment.deleteMany({ where: { equipmentId: eqId } })
      await tx.equipment.delete({ where: { id: eqId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
