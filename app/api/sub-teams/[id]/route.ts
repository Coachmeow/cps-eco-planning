import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.name      !== undefined) data.name      = String(body.name).trim()
    if (body.sortOrder !== undefined) data.sortOrder = parseInt(String(body.sortOrder))
    if (body.teamId    !== undefined) data.teamId    = parseInt(String(body.teamId))
    const sub = await prisma.subTeam.update({ where: { id: parseInt(id) }, data })
    return NextResponse.json(sub)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// ลบทีมย่อย → ปลดสมาชิกออกก่อน (subTeamId=null, ไม่เป็นหัวหน้าแล้ว) กันข้อมูลกำพร้า/FK
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const { id } = await params
    const subId = parseInt(id)
    await prisma.employee.updateMany({ where: { subTeamId: subId }, data: { subTeamId: null, isSubLeader: false } })
    await prisma.subTeam.delete({ where: { id: subId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
