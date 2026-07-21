import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkQrAccess } from '@/lib/cemsQrPin'
import { toDateKey } from '@/lib/dateKey'

// public (มีรหัสรวมถ้าตั้ง CEMS_QR_PIN) — ข้อมูลถังแก๊ส สำหรับ QR แขวนที่ถัง
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = checkQrAccess(req); if (!gate.ok) return gate.res
  const { token } = await params
  const c = await prisma.cemsGasCylinder.findUnique({
    where: { qrToken: token },
    include: {
      components: { orderBy: { id: 'asc' } },
      readings:   { orderBy: [{ readingDate: 'desc' }, { id: 'desc' }], take: 8 },
    },
  })
  if (!c) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })
  const pct = c.initialPressure > 0 ? Math.max(0, Math.min(100, Math.round((c.currentPressure / c.initialPressure) * 100))) : 0
  const kgRemaining = c.initialWeight != null ? Math.round(c.initialWeight * (pct / 100) * 100) / 100 : null
  const { qrToken, ...rest } = c
  return NextResponse.json({ ...rest, pct, kgRemaining })
}

// public — อัปเดตความดันปัจจุบัน และ/หรือ มาร์คถังหมด
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = checkQrAccess(req); if (!gate.ok) return gate.res
  const { token } = await params
  const c = await prisma.cemsGasCylinder.findUnique({ where: { qrToken: token }, select: { id: true, lowThreshold: true } })
  if (!c) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })

  const body = await req.json()
  const markEmpty = body.markEmpty === true
  const markReturned = body.markReturned === true
  const hasPressure = body.pressure != null && body.pressure !== ''
  if (!markEmpty && !markReturned && !hasPressure) return NextResponse.json({ error: 'กรอกความดัน / มาร์คถังหมด / ส่งคืนท่อ' }, { status: 400 })

  let pressure = NaN
  if (hasPressure) {
    pressure = parseFloat(String(body.pressure))
    if (isNaN(pressure) || pressure < 0) return NextResponse.json({ error: 'กรอกความดัน (psi) ให้ถูกต้อง' }, { status: 400 })
  }

  const readingDate = new Date(toDateKey(new Date()))
  const autoEmpty = hasPressure && c.lowThreshold != null && pressure <= c.lowThreshold
  await prisma.$transaction(async (tx) => {
    if (hasPressure) {
      await tx.cemsGasReading.create({
        data: {
          cylinderId: c.id, pressure, readingDate,
          reader:        body.reader        || null,
          purpose:       body.purpose       || null,
          usageLocation: body.usageLocation || null,
          notes:         body.notes         || null,
        },
      })
    }
    const cylData: Record<string, unknown> = {}
    if (hasPressure) cylData.currentPressure = pressure
    if (markEmpty || autoEmpty) cylData.status = 'EMPTY'
    // ส่งคืนท่อ → RETURNED + วันที่/ผู้ส่งคืน (ชนะ empty)
    if (markReturned) {
      cylData.status = 'RETURNED'
      cylData.returnedDate = body.returnedDate ? new Date(body.returnedDate) : readingDate
      cylData.returnedBy = body.returnedBy || null
    }
    if (Object.keys(cylData).length) await tx.cemsGasCylinder.update({ where: { id: c.id }, data: cylData })
  })

  return NextResponse.json({ ok: true, emptied: markEmpty || autoEmpty, returned: markReturned })
}
