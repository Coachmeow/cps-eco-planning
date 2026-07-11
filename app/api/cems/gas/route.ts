import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'

// % คงเหลือ + kg คงเหลือ (psi ↔ kg แปรผันตรงสำหรับแก๊สอัด)
function withCalc<T extends { initialPressure: number; currentPressure: number; initialWeight: number | null }>(c: T) {
  const pct = c.initialPressure > 0 ? Math.max(0, Math.min(100, Math.round((c.currentPressure / c.initialPressure) * 100))) : 0
  const kgRemaining = c.initialWeight != null ? Math.round(c.initialWeight * (pct / 100) * 100) / 100 : null
  return { ...c, pct, kgRemaining }
}

// รายการถังแก๊สมาตรฐาน (พร้อมองค์ประกอบ + % คงเหลือ + การใช้งานล่าสุด)
export async function GET() {
  if (!await requireCems()) return forbidden()
  const cylinders = await prisma.cemsGasCylinder.findMany({
    include: {
      components: { orderBy: { id: 'asc' } },
      // reading ล่าสุดที่ระบุวัตถุประสงค์/สถานที่ใช้งาน → โชว์บนแถวตาราง
      readings: {
        where: { OR: [{ purpose: { not: null } }, { usageLocation: { not: null } }] },
        orderBy: [{ readingDate: 'desc' }, { id: 'desc' }], take: 1,
        select: { purpose: true, usageLocation: true, readingDate: true },
      },
    },
    orderBy: [{ status: 'asc' }, { cylinderNo: 'asc' }],
  })
  return NextResponse.json(cylinders.map(c => {
    const { readings, ...rest } = c
    return { ...withCalc(rest), lastUse: readings[0] ?? null }
  }))
}

interface CompInput { gas?: string; concentration?: unknown; unit?: string }

// สร้างถังใหม่ + องค์ประกอบ
export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const body = await req.json()
    const cylinderNo = String(body.cylinderNo ?? '').trim()
    if (!cylinderNo) return NextResponse.json({ error: 'กรอกเลขถัง' }, { status: 400 })
    const initialPressure = parseFloat(String(body.initialPressure))
    if (isNaN(initialPressure) || initialPressure <= 0) return NextResponse.json({ error: 'กรอกความดันเต็มถัง (psi)' }, { status: 400 })
    const currentPressure = body.currentPressure != null && body.currentPressure !== '' ? parseFloat(String(body.currentPressure)) : initialPressure

    const comps = Array.isArray(body.components) ? (body.components as CompInput[]) : []
    const compData = comps
      .filter(c => c.gas && String(c.gas).trim() && c.concentration != null && c.concentration !== '')
      .map(c => ({ gas: String(c.gas).trim(), concentration: parseFloat(String(c.concentration)), unit: c.unit || 'ppm' }))

    const created = await prisma.cemsGasCylinder.create({
      data: {
        cylinderNo,
        brand:           body.brand    || null,
        size:            body.size     || null,
        initialPressure, currentPressure,
        lowThreshold:    body.lowThreshold  != null && body.lowThreshold  !== '' ? parseFloat(String(body.lowThreshold))  : null,
        initialWeight:   body.initialWeight != null && body.initialWeight !== '' ? parseFloat(String(body.initialWeight)) : null,
        receivedDate:    body.receivedDate ? new Date(body.receivedDate) : null,
        expiryDate:      body.expiryDate   ? new Date(body.expiryDate)   : null,
        location:        body.location || null,
        notes:           body.notes    || null,
        components: { create: compData },
      },
      include: { components: true },
    })
    // บันทึกการอ่านความดันเริ่มต้นเป็น log แรก
    await prisma.cemsGasReading.create({
      data: { cylinderId: created.id, pressure: currentPressure, readingDate: new Date(toDateKey(new Date())), reader: body.person || null, notes: 'ตั้งต้น' },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'เลขถังนี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
