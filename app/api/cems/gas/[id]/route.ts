import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

const STATUSES = ['ACTIVE', 'EMPTY', 'RETURNED'] as const
interface CompInput { gas?: string; concentration?: unknown; unit?: string }

// แก้ไขถัง + องค์ประกอบ + สถานะ (mark empty/returned)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  try {
    const { id } = await params
    const cid = parseInt(id)
    const exist = await prisma.cemsGasCylinder.findUnique({ where: { id: cid }, select: { id: true } })
    if (!exist) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.cylinderNo != null) data.cylinderNo = String(body.cylinderNo).trim()
    if ('brand'    in body) data.brand    = body.brand    || null
    if ('size'     in body) data.size     = body.size     || null
    if ('location' in body) data.location = body.location || null
    if ('notes'    in body) data.notes    = body.notes    || null
    if (body.initialPressure != null && body.initialPressure !== '') data.initialPressure = parseFloat(String(body.initialPressure))
    if (body.currentPressure != null && body.currentPressure !== '') data.currentPressure = parseFloat(String(body.currentPressure))
    if ('lowThreshold'  in body) data.lowThreshold  = body.lowThreshold  !== '' && body.lowThreshold  != null ? parseFloat(String(body.lowThreshold))  : null
    if ('initialWeight' in body) data.initialWeight = body.initialWeight !== '' && body.initialWeight != null ? parseFloat(String(body.initialWeight)) : null
    if ('receivedDate'  in body) data.receivedDate  = body.receivedDate  ? new Date(body.receivedDate)  : null
    if ('expiryDate'    in body) data.expiryDate    = body.expiryDate    ? new Date(body.expiryDate)    : null
    if ('dealerDate'    in body) data.dealerDate    = body.dealerDate    ? new Date(body.dealerDate)    : null
    if ('returnDueDate' in body) data.returnDueDate = body.returnDueDate ? new Date(body.returnDueDate) : null
    if (body.status && STATUSES.includes(body.status)) data.status = body.status

    const comps = Array.isArray(body.components) ? (body.components as CompInput[]) : null
    const compData = comps?.filter(c => c.gas && String(c.gas).trim() && c.concentration != null && c.concentration !== '')
      .map(c => ({ gas: String(c.gas).trim(), concentration: parseFloat(String(c.concentration)), unit: c.unit || 'ppm' }))

    const updated = await prisma.$transaction(async (tx) => {
      await tx.cemsGasCylinder.update({ where: { id: cid }, data })
      if (compData) { // ส่ง components มา = แทนที่ทั้งชุด
        await tx.cemsGasComponent.deleteMany({ where: { cylinderId: cid } })
        if (compData.length) await tx.cemsGasComponent.createMany({ data: compData.map(c => ({ ...c, cylinderId: cid })) })
      }
      return tx.cemsGasCylinder.findUnique({ where: { id: cid }, include: { components: { orderBy: { id: 'asc' } } } })
    })
    return NextResponse.json(updated)
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'เลขถังนี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// ลบถัง (องค์ประกอบ + การอ่านความดัน ลบตาม onDelete: Cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  const { id } = await params
  const cid = parseInt(id)
  const exist = await prisma.cemsGasCylinder.findUnique({ where: { id: cid }, select: { id: true } })
  if (!exist) return NextResponse.json({ error: 'ไม่พบถัง' }, { status: 404 })
  await prisma.cemsGasCylinder.delete({ where: { id: cid } })
  return NextResponse.json({ ok: true })
}
