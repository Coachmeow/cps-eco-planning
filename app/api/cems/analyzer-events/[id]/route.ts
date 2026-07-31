import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCemsAdmin, forbidden } from '@/lib/auth'

// ลบ event (ไม่ย้อนสถานะเครื่อง — แก้สถานะได้ที่ฟอร์มแก้ไขเครื่อง)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireCemsAdmin()) return forbidden()
  try {
    const { id } = await params
    await prisma.cemsAnalyzerEvent.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
