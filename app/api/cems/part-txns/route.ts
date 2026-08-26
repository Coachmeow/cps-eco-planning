import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, requireCemsAdmin, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'
import { computeNextDue } from '@/lib/cemsSchedule'

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
  if (!await requireCemsAdmin()) return forbidden()   // เบิก/รับเข้าตรง = ตัดสต็อกไม่ผ่านอนุมัติ
  try {
    const body = await req.json()
    const { partId, type } = body
    if (!partId || !type) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
    const qty = parseFloat(String(body.qty))
    if (isNaN(qty) || (type !== 'ADJUST' && qty <= 0)) {
      return NextResponse.json({ error: 'จำนวนไม่ถูกต้อง' }, { status: 400 })
    }

    const pid = parseInt(String(partId))

    // เบิกออกห้ามเกิน stock คงเหลือ
    if (type === 'OUT') {
      const grouped = await prisma.cemsPartTxn.groupBy({ by: ['type'], where: { partId: pid }, _sum: { qty: true } })
      let stock = 0
      for (const g of grouped) stock += g.type === 'OUT' ? -Number(g._sum.qty ?? 0) : Number(g._sum.qty ?? 0)
      if (qty > stock) return NextResponse.json({ error: `เบิกเกิน stock คงเหลือ (${stock})` }, { status: 400 })
    }

    // เบิกตามแผน/ชำรุด → ผูก schedule (validate ว่าเป็นแผนของอะไหล่นี้จริง) เพื่อเลื่อนรอบตอนบันทึก
    const replaceType = ['PLANNED', 'BREAKDOWN', 'OTHER'].includes(body.replaceType) ? body.replaceType : null
    let advanceSchedId: number | null = null
    if (type === 'OUT' && body.scheduleId && (replaceType === 'PLANNED' || replaceType === 'BREAKDOWN')) {
      const sid = parseInt(String(body.scheduleId))
      const sched = await prisma.cemsPartSchedule.findFirst({ where: { id: sid, partId: pid }, select: { id: true } })
      if (!sched) return NextResponse.json({ error: 'แผนที่เลือกไม่ถูกต้อง' }, { status: 400 })
      advanceSchedId = sched.id
    }

    const txnDate = body.txnDate ? new Date(body.txnDate) : new Date(toDateKey(new Date()))
    const txn = await prisma.$transaction(async (tx) => {
      const created = await tx.cemsPartTxn.create({
        data: {
          partId: pid, type, qty,
          unitCost:   type === 'IN' && body.unitCost != null && body.unitCost !== '' ? parseFloat(String(body.unitCost)) : null,
          txnDate,
          siteId:     body.siteId     ? parseInt(String(body.siteId))     : null,
          manualSite: body.manualSite || null,
          analyzerId: body.analyzerId ? parseInt(String(body.analyzerId)) : null,
          quoteNo:    body.quoteNo    || null,
          person:     body.person     || null,
          notes:      body.notes      || null,
          scheduleId: advanceSchedId,   // ตรึงว่าเป็นการเปลี่ยนของแผนไหน (นับรอบ/มาร์กในตารางปี)
        },
      })
      // รับเข้า → อัปเดตราคาอ้างอิงล่าสุด
      if (type === 'IN' && created.unitCost != null) {
        await tx.cemsSparePart.update({ where: { id: pid }, data: { refCost: created.unitCost } })
      }
      // เบิกตามแผน/ชำรุด → เลื่อนรอบทันที (ตัดสต็อกตรง ไม่มีขั้นอนุมัติ)
      if (advanceSchedId) {
        const s = await tx.cemsPartSchedule.findUnique({ where: { id: advanceSchedId } })
        if (s) await tx.cemsPartSchedule.update({
          where: { id: s.id },
          data: { lastReplacedDate: txnDate, nextDueDate: computeNextDue(s.mode, s.intervalMonths, txnDate) },
        })
      }
      return created
    })
    return NextResponse.json(txn, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
