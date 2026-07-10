import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { maintStateForWindow, overlappingEventWhere, type MaintEvent } from '@/lib/equipmentAvailability'

// เครื่องมือที่ "ไม่ว่าง/เผื่อเลื่อน" จากการส่งซ่อม/Cal ในช่วงวันที่เลือก (start + days)
// → ใช้ในตัวเลือกเครื่องของแผนคน เพื่อบล็อกเฉพาะช่วงที่อยู่ศูนย์ (จองหลังวันรับกลับได้)
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start')
  const days  = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '1') || 1, 1), 31)
  if (!start) return NextResponse.json([])

  const bStart = new Date(start)
  const bEnd   = new Date(start)
  bEnd.setDate(bEnd.getDate() + days - 1)

  const events = await prisma.equipmentEvent.findMany({
    where: overlappingEventWhere(bStart, bEnd),
    select: { equipmentId: true, sentDate: true, expectedDate: true, returnedDate: true, type: true },
    orderBy: { sentDate: 'asc' },
  })

  // จัดกลุ่มตามเครื่อง แล้วคำนวณสถานะต่อเครื่อง
  const byEq = new Map<number, MaintEvent[]>()
  for (const e of events) {
    if (!byEq.has(e.equipmentId)) byEq.set(e.equipmentId, [])
    byEq.get(e.equipmentId)!.push({ sentDate: e.sentDate, expectedDate: e.expectedDate, returnedDate: e.returnedDate, type: e.type })
  }

  const out: { equipmentId: number; state: string; type?: string; sentDate?: Date | string; expectedDate?: Date | string | null; returnedDate?: Date | string | null }[] = []
  for (const [equipmentId, evs] of byEq) {
    const { state, ref } = maintStateForWindow(evs, bStart, bEnd)
    if (state === 'ok') continue
    out.push({ equipmentId, state, type: ref?.type, sentDate: ref?.sentDate, expectedDate: ref?.expectedDate, returnedDate: ref?.returnedDate })
  }
  return NextResponse.json(out)
}
