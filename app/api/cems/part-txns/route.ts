import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'

// ประวัติรับเข้า/เบิกออกของอะไหล่ (?partId= จำเป็น หรือ ?recent=true เอาล่าสุดทุกตัว)
export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const partId = req.nextUrl.searchParams.get('partId')
  const txns = await prisma.cemsPartTxn.findMany({
    where: partId ? { partId: parseInt(partId) } : {},
    include: {
      part:     { select: { code: true, name: true, unit: true } },
      site:     { select: { code: true } },
      analyzer: { select: { tag: true } },
    },
    orderBy: [{ txnDate: 'desc' }, { id: 'desc' }],
    take: partId ? undefined : 100,
  })
  return NextResponse.json(txns)
}

// สร้างรายการรับเข้า (IN) / เบิกออก (OUT) / ปรับยอด (ADJUST)
export async function POST(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  try {
    const body = await req.json()
    const { partId, type } = body
    if (!partId || !type) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
    const qty = parseFloat(String(body.qty))
    if (isNaN(qty) || (type !== 'ADJUST' && qty <= 0)) {
      return NextResponse.json({ error: 'จำนวนไม่ถูกต้อง' }, { status: 400 })
    }

    // เบิกออกห้ามเกิน stock คงเหลือ
    if (type === 'OUT') {
      const grouped = await prisma.cemsPartTxn.groupBy({ by: ['type'], where: { partId: parseInt(String(partId)) }, _sum: { qty: true } })
      let stock = 0
      for (const g of grouped) stock += g.type === 'OUT' ? -Number(g._sum.qty ?? 0) : Number(g._sum.qty ?? 0)
      if (qty > stock) return NextResponse.json({ error: `เบิกเกิน stock คงเหลือ (${stock})` }, { status: 400 })
    }

    const txn = await prisma.cemsPartTxn.create({
      data: {
        partId:     parseInt(String(partId)),
        type,
        qty,
        unitCost:   type === 'IN' && body.unitCost != null && body.unitCost !== '' ? parseFloat(String(body.unitCost)) : null,
        txnDate:    body.txnDate ? new Date(body.txnDate) : new Date(toDateKey(new Date())),
        siteId:     body.siteId     ? parseInt(String(body.siteId))     : null,
        manualSite: body.manualSite || null,
        analyzerId: body.analyzerId ? parseInt(String(body.analyzerId)) : null,
        quoteNo:    body.quoteNo    || null,
        person:     body.person     || null,
        notes:      body.notes      || null,
      },
    })

    // รับเข้า → อัปเดตราคาอ้างอิงล่าสุดของอะไหล่
    if (type === 'IN' && txn.unitCost != null) {
      await prisma.cemsSparePart.update({ where: { id: txn.partId }, data: { refCost: txn.unitCost } })
    }
    return NextResponse.json(txn, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
