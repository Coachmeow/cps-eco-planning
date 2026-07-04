import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// ลบรายการ txn (กรณีคีย์ผิด) — stock คำนวณใหม่อัตโนมัติเพราะไม่เก็บเลขนิ่ง
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCems()) return forbidden()
  try {
    const { id } = await params
    await prisma.cemsPartTxn.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
