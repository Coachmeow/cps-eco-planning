import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, requireCemsAdmin, forbidden } from '@/lib/auth'

// stock ต่อรายการ = Σ IN − Σ OUT ± ADJUST (คำนวณจาก txn เสมอ ไม่เก็บเลขนิ่ง)
export async function GET() {
  if (!await requireCems()) return forbidden()
  const [parts, txns] = await Promise.all([
    prisma.cemsSparePart.findMany({ orderBy: { code: 'asc' } }),
    prisma.cemsPartTxn.groupBy({ by: ['partId', 'type'], _sum: { qty: true } }),
  ])
  const stockMap = new Map<number, number>()
  for (const t of txns) {
    const cur = stockMap.get(t.partId) ?? 0
    const q = Number(t._sum.qty ?? 0)
    stockMap.set(t.partId, cur + (t.type === 'OUT' ? -q : q)) // IN/ADJUST บวก (ADJUST เก็บ qty แบบมีเครื่องหมาย)
  }
  const out = parts.map(p => {
    const stock = Math.round((stockMap.get(p.id) ?? 0) * 100) / 100
    return { ...p, stock, value: p.refCost != null ? Math.round(stock * p.refCost * 100) / 100 : 0 }
  })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  if (!await requireCemsAdmin()) return forbidden()
  try {
    const body = await req.json()
    if (!body.code || !body.name) return NextResponse.json({ error: 'กรอกรหัสและชื่อรายการ' }, { status: 400 })
    const part = await prisma.cemsSparePart.create({
      data: {
        code:     String(body.code).trim(),
        name:     String(body.name).trim(),
        brand:    body.brand    || null,
        unit:     body.unit     || null,
        minStock: body.minStock != null && body.minStock !== '' ? parseInt(String(body.minStock)) : 0,
        location: body.location || null,
        refCost:  body.refCost != null && body.refCost !== '' ? parseFloat(String(body.refCost)) : null,
        notes:    body.notes    || null,
      },
    })
    return NextResponse.json(part, { status: 201 })
  } catch (err) {
    const msg = String(err).includes('Unique') ? 'รหัสอะไหล่นี้มีอยู่แล้ว' : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
