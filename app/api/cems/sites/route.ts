import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// ไซต์ CEMS เริ่มต้น (seed ครั้งแรก)
const DEFAULT_SITES = ['SKK3', 'SKK4', 'SKK5', 'SKK6', 'STL5', 'STL6', 'SKW', 'SLP', 'STS4', 'STS5', 'STS6', 'CFB', 'MEEP', 'SWCC1', 'SWCC2']

export async function GET() {
  if (!await requireCems()) return forbidden()
  const sites = await prisma.cemsSite.findMany({ orderBy: { code: 'asc' } })
  return NextResponse.json(sites)
}

export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const body = await req.json()

    // seed ชุดไซต์เริ่มต้น (ข้ามตัวที่มีแล้ว)
    if (body.seed === true) {
      let created = 0
      for (const code of DEFAULT_SITES) {
        const exists = await prisma.cemsSite.findUnique({ where: { code } })
        if (!exists) { await prisma.cemsSite.create({ data: { code } }); created++ }
      }
      return NextResponse.json({ ok: true, created })
    }

    if (!body.code) return NextResponse.json({ error: 'กรอกโค้ดไซต์' }, { status: 400 })
    const site = await prisma.cemsSite.create({
      data: { code: String(body.code).trim(), name: body.name || null, isManual: !!body.isManual },
    })
    return NextResponse.json(site, { status: 201 })
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'โค้ดไซต์นี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
