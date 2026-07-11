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
  const pressure = parseFloat(String(body.pressure))
  if (isNaN(pressure) || pressure < 0) return NextResponse.json({ error: 'กรอกความดัน (psi) ให้ถูกต้อง' }, { status: 400 })

  const readingDate = body.readingDate ? new Date(body.readingDate) : new Date(toDateKey(new Date()))
  const autoEmpty = cyl.lowThreshold != null && pressure <= cyl.lowThreshold
  await prisma.$transaction(async (tx) => {
    await tx.cemsGasReading.create({
      data: { cylinderId: cid, pressure, readingDate, reader: body.reader || null, notes: body.notes || null },
    })
    await tx.cemsGasCylinder.update({
      where: { id: cid },
      // ต่ำกว่าเกณฑ์เตือน (หรือ =0) → มาร์คหมดอัตโนมัติ
      data: { currentPressure: pressure, ...(autoEmpty ? { status: 'EMPTY' as const } : {}) },
    })
  })
  return NextResponse.json({ ok: true, emptied: autoEmpty })
}
