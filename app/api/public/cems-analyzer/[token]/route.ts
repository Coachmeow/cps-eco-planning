import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// public (ไม่ล็อกอิน) — ข้อมูลเครื่อง CEMS สำหรับหน้า QR แขวนเครื่อง
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const analyzer = await prisma.cemsAnalyzer.findUnique({
    where: { qrToken: token },
    include: {
      currentSite: { select: { code: true } },
      homeSite:    { select: { code: true } },
      events: {
        include: { site: { select: { code: true } } },
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }], take: 10,
      },
    },
  })
  if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })
  const { photoUrl, qrToken, ...a } = analyzer
  return NextResponse.json({ ...a, hasPhoto: !!photoUrl })
}

// public — แจ้งอาการผิดปกติ (ISSUE) หรือบันทึกเข้า PM จากหน้างาน
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const analyzer = await prisma.cemsAnalyzer.findUnique({ where: { qrToken: token }, select: { id: true } })
  if (!analyzer) return NextResponse.json({ error: 'ไม่พบเครื่อง' }, { status: 404 })

  const body = await req.json()
  const type = body.type === 'PM' ? 'PM' : 'ISSUE'   // public อนุญาตแค่ 2 ชนิดนี้
  if (type === 'ISSUE' && !body.symptom) return NextResponse.json({ error: 'กรอกอาการผิดปกติ' }, { status: 400 })
  if (type === 'PM' && !body.action)     return NextResponse.json({ error: 'กรอกสิ่งที่ทำ' }, { status: 400 })

  const event = await prisma.cemsAnalyzerEvent.create({
    data: {
      analyzerId: analyzer.id,
      type,
      eventDate: new Date(),
      symptom:  body.symptom  || null,
      action:   body.action   || null,
      reporter: body.reporter || null,
      notes:    body.notes    || null,
    },
  })
  await prisma.cemsAnalyzer.update({ where: { id: analyzer.id }, data: { statusUpdatedAt: new Date() } })
  return NextResponse.json({ ok: true, id: event.id }, { status: 201 })
}
