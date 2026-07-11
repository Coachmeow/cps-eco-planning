import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { duePartSchedules } from '@/lib/cemsSchedule'

// stock = Σ IN − Σ OUT ± ADJUST
async function stockOf(partId: number): Promise<number> {
  const grouped = await prisma.cemsPartTxn.groupBy({ by: ['type'], where: { partId }, _sum: { qty: true } })
  let s = 0
  for (const g of grouped) s += g.type === 'OUT' ? -Number(g._sum.qty ?? 0) : Number(g._sum.qty ?? 0)
  return Math.round(s * 100) / 100
}

// public (ไม่ล็อกอิน) — ข้อมูลอะไหล่ + รายชื่อพนักงาน/ไซต์/เครื่อง สำหรับหน้าขอเบิก QR
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const part = await prisma.cemsSparePart.findUnique({
    where: { qrToken: token },
    select: { id: true, code: true, name: true, unit: true, location: true },
  })
  if (!part) return NextResponse.json({ error: 'ไม่พบอะไหล่' }, { status: 404 })

  const [employees, sites, analyzers, stock, schedules] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true }, select: { id: true, nickname: true, fullName: true },
      orderBy: [{ primaryTeam: { sortOrder: 'asc' } }, { fullName: 'asc' }],
    }),
    prisma.cemsSite.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } }),
    prisma.cemsAnalyzer.findMany({ select: { id: true, tag: true, currentSiteId: true }, orderBy: { tag: 'asc' } }),
    stockOf(part.id),
    duePartSchedules(part.id),
  ])
  return NextResponse.json({ part: { ...part, stock }, employees, sites, analyzers, schedules })
}

// public — ส่งคำขอเบิก (PENDING) ; ไม่แตะ stock จนกว่า CEMS Admin อนุมัติ
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const part = await prisma.cemsSparePart.findUnique({ where: { qrToken: token }, select: { id: true } })
  if (!part) return NextResponse.json({ error: 'ไม่พบอะไหล่' }, { status: 404 })

  const body = await req.json()
  const requesterId = body.requesterId ? parseInt(String(body.requesterId)) : null
  const qty = parseInt(String(body.qty))
  if (!requesterId) return NextResponse.json({ error: 'เลือกผู้เบิก' }, { status: 400 })
  if (isNaN(qty) || qty <= 0) return NextResponse.json({ error: 'กรอกจำนวนให้ถูกต้อง' }, { status: 400 })

  // ผู้เบิกต้องเป็นพนักงาน active จริง
  const emp = await prisma.employee.findFirst({ where: { id: requesterId, isActive: true }, select: { id: true } })
  if (!emp) return NextResponse.json({ error: 'ผู้เบิกไม่ถูกต้อง' }, { status: 400 })

  const replaceType = ['PLANNED', 'BREAKDOWN', 'OTHER'].includes(body.replaceType) ? body.replaceType : null

  // scheduleId ต้องเป็นแผนของอะไหล่ชิ้นนี้จริง (กัน client ส่ง id แผนของอะไหล่อื่นมาสวม)
  let scheduleId: number | null = null
  if (body.scheduleId) {
    const sid = parseInt(String(body.scheduleId))
    const sched = await prisma.cemsPartSchedule.findFirst({ where: { id: sid, partId: part.id }, select: { id: true } })
    if (!sched) return NextResponse.json({ error: 'แผนที่เลือกไม่ถูกต้อง' }, { status: 400 })
    scheduleId = sched.id
  }

  const reqRow = await prisma.cemsPartRequest.create({
    data: {
      partId:     part.id,
      qty,
      requesterId,
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
