import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, forbidden } from '@/lib/auth'

export async function GET() {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } })
  return NextResponse.json(holidays)
}

export async function POST(req: NextRequest) {
  if (!await requireRole('ADMIN', 'MANAGER')) return forbidden()
  try {
    const body = await req.json()
    if (!body.date || !body.name) {
      return NextResponse.json({ error: 'กรอกวันที่และชื่อวันหยุด' }, { status: 400 })
    }
    const date = new Date(body.date)
    const holiday = await prisma.holiday.upsert({
      where:  { date },
      update: { name: body.name },
      create: { date, name: body.name },
    })
    return NextResponse.json(holiday, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
