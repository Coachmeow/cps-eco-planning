import { NextRequest, NextResponse } from 'next/server'
import { requireCems, forbidden } from '@/lib/auth'
import { duePartSchedules } from '@/lib/cemsSchedule'

// แผน active ทั้งหมดของอะไหล่ (พร้อม overdue/dueThisMonth) — สำหรับฟอร์มเบิก (ตามแผน/ชำรุด)
export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const partId = parseInt(req.nextUrl.searchParams.get('partId') ?? '')
  if (!partId) return NextResponse.json({ error: 'ระบุ partId' }, { status: 400 })
  const schedules = await duePartSchedules(partId)
  return NextResponse.json(schedules)
}
