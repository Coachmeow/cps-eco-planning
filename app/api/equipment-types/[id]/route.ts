import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

// แก้ไขประเภท (โค้ด/ชื่อ/ทีมหลัก) — ADMIN/MANAGER
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.code          !== undefined) data.code          = String(body.code).trim()
    if (body.name          !== undefined) data.name          = String(body.name).trim()
    if (body.primaryTeamId !== undefined) data.primaryTeamId = parseInt(String(body.primaryTeamId))
    if (body.requiresCal   !== undefined) data.requiresCal   = !!body.requiresCal
    const type = await prisma.equipmentType.update({
      where: { id: parseInt(id) }, data, include: { primaryTeam: true },
    })
    return NextResponse.json(type)
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'โค้ดประเภทนี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// ลบประเภท — ได้เฉพาะที่ไม่มีเครื่องมืออยู่ (ต้องย้ายออกก่อน)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const typeId = parseInt(id)
    const count = await prisma.equipment.count({ where: { typeId } })
    if (count > 0) {
      return NextResponse.json({ error: `ลบไม่ได้ — ยังมีเครื่องมือ ${count} รายการในประเภทนี้ (ย้ายออกก่อน)` }, { status: 400 })
    }
    await prisma.equipmentType.delete({ where: { id: typeId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
