import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'

// ประวัติการอ่านความดันของถัง
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const readings = await prisma.cemsGasReading.findMany({
    where: { cylinderId: parseInt(id) },
    orderBy: [{ readingDate: 'desc' }, { id: 'desc' }],
  })
  return NextResponse.json(readings)
}

// บันทึกการอ่านความดันใหม่ → อัปเดต currentPressure (+ auto EMPTY ถ้าต่ำกว่า threshold)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const cid = parseInt(id)
  const cyl = await prisma.cemsGasCylinder.findUnique({ where: { id: cid }, select: { id: true, lowThreshold: true } })
  if (!cyl) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })

  const body = await req.json()
  const markReturned = body.markReturned === true
  const hasPressure = body.pressure != null && body.pressure !== ''
  // ต้องมีอย่างน้อย: กรอกความดัน หรือ ส่งคืนท่อ
  if (!hasPressure && !markReturned) return NextResponse.json({ error: 'กรอกความดัน หรือเลือกส่งคืนท่อ' }, { status: 400 })

  let pressure = NaN
  if (hasPressure) {
    pressure = parseFloat(String(body.pressure))
    if (isNaN(pressure) || pressure < 0) return NextResponse.json({ error: 'กรอกความดัน (psi) ให้ถูกต้อง' }, { status: 400 })
  }

  const readingDate = body.readingDate ? new Date(body.readingDate) : new Date(toDateKey(new Date()))
  const autoEmpty = hasPressure && cyl.lowThreshold != null && pressure <= cyl.lowThreshold
  await prisma.$transaction(async (tx) => {
    if (hasPressure) {
      await tx.cemsGasReading.create({
        data: {
          cylinderId: cid, pressure, readingDate,
          reader:        body.reader        || null,
          purpose:       body.purpose       || null,
          usageLocation: body.usageLocation || null,
          notes:         body.notes         || null,
        },
      })
    }
    const cylData: Record<string, unknown> = {}
    if (hasPressure) cylData.currentPressure = pressure
    if (autoEmpty) cylData.status = 'EMPTY'
    // ส่งคืนท่อ → สถานะ RETURNED + วันที่/ผู้ส่งคืน (ชนะ auto-empty)
    if (markReturned) {
      cylData.status = 'RETURNED'
      cylData.returnedDate = body.returnedDate ? new Date(body.returnedDate) : new Date(toDateKey(new Date()))
      cylData.returnedBy = body.returnedBy || null
    }
    if (Object.keys(cylData).length) await tx.cemsGasCylinder.update({ where: { id: cid }, data: cylData })
  })
  return NextResponse.json({ ok: true, emptied: autoEmpty, returned: markReturned })
}
