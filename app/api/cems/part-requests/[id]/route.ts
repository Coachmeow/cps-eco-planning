import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCemsAdmin, forbidden } from '@/lib/auth'
import { toDateKey } from '@/lib/dateKey'
import { computeNextDue } from '@/lib/cemsSchedule'

// อนุมัติ (สร้าง OUT txn → ตัด stock) หรือ ปฏิเสธ คำขอเบิก
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCemsAdmin()   // อนุมัติ/ปฏิเสธ = CEMS Admin เท่านั้น
  if (!session) return forbidden()
  const { id } = await params
  const reqId = parseInt(id)
  const body = await req.json()
  const action = body.action as 'approve' | 'reject'
  const decidedBy = session.username ?? String(session.uid)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const r = await tx.cemsPartRequest.findUnique({
        where: { id: reqId },
        include: { requester: { select: { nickname: true, fullName: true } } },
      })
      if (!r) return { status: 404, error: 'ไม่พบคำขอ' }
      if (r.status !== 'PENDING') return { status: 409, error: 'คำขอนี้ถูกดำเนินการไปแล้ว' }

      if (action === 'reject') {
        await tx.cemsPartRequest.update({
          where: { id: reqId },
          data: { status: 'REJECTED', rejectReason: body.rejectReason || null, decidedBy, decidedAt: new Date() },
        })
        return { status: 200, ok: true }
      }

      // approve → เช็ค stock (จุดเดียวกับ OUT txn ปกติ) แล้วสร้าง OUT
      const grouped = await tx.cemsPartTxn.groupBy({ by: ['type'], where: { partId: r.partId }, _sum: { qty: true } })
      let stock = 0
      for (const g of grouped) stock += g.type === 'OUT' ? -Number(g._sum.qty ?? 0) : Number(g._sum.qty ?? 0)
      if (r.qty > stock) return { status: 400, error: `เบิกเกิน stock คงเหลือ (${stock})` }

      const person = r.requester.nickname ?? r.requester.fullName
      const txnDate = new Date(toDateKey(new Date()))
      const txn = await tx.cemsPartTxn.create({
        data: {
          partId: r.partId, type: 'OUT', qty: r.qty,
          txnDate,
          siteId: r.siteId, manualSite: r.manualSite, analyzerId: r.analyzerId,
          quoteNo: r.quoteNo, person, notes: r.note,
          scheduleId: r.scheduleId,   // ตรึงว่าเป็นการเปลี่ยนของแผนไหน (นับรอบ/มาร์กในตารางปี)
        },
      })
      await tx.cemsPartRequest.update({
        where: { id: reqId },
        data: { status: 'APPROVED', txnId: txn.id, decidedBy, decidedAt: new Date() },
      })

      // เบิกตามแผน/ชำรุดก่อนกำหนด → รีเซ็ตรอบ (nextDue = วันเปลี่ยนนี้ + interval) ; นอกแผนไม่แตะแผน
      if (r.scheduleId && (r.replaceType === 'PLANNED' || r.replaceType === 'BREAKDOWN')) {
        const sched = await tx.cemsPartSchedule.findUnique({ where: { id: r.scheduleId } })
        if (sched) {
          await tx.cemsPartSchedule.update({
            where: { id: sched.id },
            data: {
              lastReplacedDate: txnDate,
              nextDueDate: computeNextDue(sched.mode, sched.intervalMonths, txnDate),
            },
          })
        }
      }
      return { status: 200, ok: true }
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
