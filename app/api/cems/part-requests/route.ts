import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import type { CemsRequestStatus } from '@prisma/client'

// รายการคำขอเบิก (default = PENDING) สำหรับ CEMS Admin อนุมัติ
export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const statusParam = (req.nextUrl.searchParams.get('status') ?? 'PENDING').toUpperCase()
  const requests = await prisma.cemsPartRequest.findMany({
    where: statusParam === 'ALL' ? {} : { status: statusParam as CemsRequestStatus },
    include: {
      part:      { select: { code: true, name: true, unit: true } },
      requester: { select: { nickname: true, fullName: true } },
      site:      { select: { code: true } },
      analyzer:  { select: { tag: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })
  return NextResponse.json(requests)
}

// สร้างคำขอเบิกจากในระบบ (เช่น ปุ่ม "เบิกตามแผน" ในหน้าแผน) — PENDING เหมือนกับทาง QR สาธารณะ
export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const body = await req.json()
  const partId = body.partId ? parseInt(String(body.partId)) : null
  const requesterId = body.requesterId ? parseInt(String(body.requesterId)) : null
  const qty = parseInt(String(body.qty))
  if (!partId) return NextResponse.json({ error: 'ระบุอะไหล่' }, { status: 400 })
  if (!requesterId) return NextResponse.json({ error: 'เลือกผู้เบิก' }, { status: 400 })
  if (isNaN(qty) || qty <= 0) return NextResponse.json({ error: 'กรอกจำนวนให้ถูกต้อง' }, { status: 400 })

  const emp = await prisma.employee.findFirst({ where: { id: requesterId, isActive: true }, select: { id: true } })
  if (!emp) return NextResponse.json({ error: 'ผู้เบิกไม่ถูกต้อง' }, { status: 400 })

  const replaceType = ['PLANNED', 'BREAKDOWN', 'OTHER'].includes(body.replaceType) ? body.replaceType : null

  // scheduleId ต้องเป็นแผนของอะไหล่ชิ้นนี้จริง (กัน client ส่ง id แผนของอะไหล่อื่นมาสวม)
  let scheduleId: number | null = null
  if (body.scheduleId) {
    const sid = parseInt(String(body.scheduleId))
    const sched = await prisma.cemsPartSchedule.findFirst({ where: { id: sid, partId }, select: { id: true } })
    if (!sched) return NextResponse.json({ error: 'แผนที่เลือกไม่ถูกต้อง' }, { status: 400 })
    scheduleId = sched.id
  }

  const reqRow = await prisma.cemsPartRequest.create({
    data: {
      partId, qty, requesterId,
      siteId:     body.siteId     ? parseInt(String(body.siteId))     : null,
      manualSite: body.manualSite || null,
      analyzerId: body.analyzerId ? parseInt(String(body.analyzerId)) : null,
      quoteNo:    body.quoteNo    || null,
      note:       body.note       || null,
      scheduleId,
      replaceType,
    },
  })
  return NextResponse.json({ ok: true, id: reqRow.id }, { status: 201 })
}
