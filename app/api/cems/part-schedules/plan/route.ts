import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'
import { occurrencesInYear } from '@/lib/cemsSchedule'

// ตารางปี×อะไหล่ ต่อไซต์ + สรุปพอ/ขาดสต็อก (รวมทุกไซต์) + รายการใกล้/เลยกำหนด
export async function GET(req: NextRequest) {
  if (!await requireCems()) return forbidden()
  const sp = req.nextUrl.searchParams
  const year   = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
  const siteId = sp.get('siteId') ? parseInt(sp.get('siteId')!) : null

  const [schedules, txns] = await Promise.all([
    prisma.cemsPartSchedule.findMany({
      where: { isActive: true },
      include: {
        part: { select: { id: true, code: true, name: true, unit: true } },
        analyzer: { select: { id: true, tag: true, currentSiteId: true, homeSiteId: true } },
        site: { select: { id: true, code: true } },
      },
    }),
    prisma.cemsPartTxn.groupBy({ by: ['partId', 'type'], _sum: { qty: true } }),
  ])

  // stock ปัจจุบันต่ออะไหล่
  const stockMap = new Map<number, number>()
  for (const t of txns) {
    const q = Number(t._sum.qty ?? 0)
    stockMap.set(t.partId, (stockMap.get(t.partId) ?? 0) + (t.type === 'OUT' ? -q : q))
  }

  // anchor = nextDueDate เท่านั้น (= วันเปลี่ยนล่าสุด + interval) → ไล่ไปข้างหน้า ไม่ลงแผนย้อนหลัง
  const anchorOf = (s: typeof schedules[number]) => s.nextDueDate ?? null
  const belongsToSite = (s: typeof schedules[number]) =>
    siteId != null && (s.siteId === siteId || (s.analyzer && (s.analyzer.currentSiteId === siteId || s.analyzer.homeSiteId === siteId)))
  const targetLabel = (s: typeof schedules[number]) => s.analyzer ? s.analyzer.tag : (s.site?.code ? `${s.site.code} (ใช้ร่วม)` : 'ไซต์')

  const todayMs = (() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) })()
  const monthEndMs = (() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth() + 1, 0) })()

  // ── ตารางปี (เฉพาะไซต์ที่เลือก) ──
  type Cell = { qty: number; state: 'plan' | 'overdue' | 'done' }
  const rows: { scheduleId: number; partId: number; partCode: string; partName: string; unit: string | null; target: string; intervalMonths: number | null; qtyPerReplace: number; months: Record<number, Cell>; total: number }[] = []
  const onCondition: { scheduleId: number; partCode: string; partName: string; target: string; qtyPerReplace: number }[] = []
  const upcoming: { scheduleId: number; partCode: string; partName: string; target: string; dueDate: string; overdue: boolean }[] = []

  // ── สรุปพอ/ขาด (รวมทุกไซต์) ──
  const needMap = new Map<number, number>()

  for (const s of schedules) {
    if (s.mode === 'TIME_BASE' && s.intervalMonths) {
      const occ = occurrencesInYear(year, s.intervalMonths, anchorOf(s))
      // สรุปพอ/ขาด รวมทุกไซต์
      needMap.set(s.partId, (needMap.get(s.partId) ?? 0) + occ.length * s.qtyPerReplace)

      if (belongsToSite(s)) {
        const months: Record<number, Cell> = {}
        for (const o of occ) {
          const m = o.getUTCMonth() + 1
          const overdue = o.getTime() < todayMs
          months[m] = { qty: s.qtyPerReplace, state: overdue ? 'overdue' : 'plan' }
        }
        // ทำเครื่องหมาย "เปลี่ยนแล้ว" เดือนที่เปลี่ยนล่าสุด (ถ้าอยู่ในปีนี้)
        if (s.lastReplacedDate) {
          const lr = new Date(s.lastReplacedDate)
          if (lr.getUTCFullYear() === year) months[lr.getUTCMonth() + 1] = { qty: s.qtyPerReplace, state: 'done' }
        }
        const total = Object.values(months).reduce((a, c) => a + c.qty, 0)
        rows.push({ scheduleId: s.id, partId: s.partId, partCode: s.part.code, partName: s.part.name, unit: s.part.unit, target: targetLabel(s), intervalMonths: s.intervalMonths, qtyPerReplace: s.qtyPerReplace, months, total })

        // ใกล้/เลยกำหนด
        if (s.nextDueDate) {
          const due = new Date(s.nextDueDate).getTime()
          if (due <= monthEndMs) upcoming.push({ scheduleId: s.id, partCode: s.part.code, partName: s.part.name, target: targetLabel(s), dueDate: s.nextDueDate.toISOString().slice(0, 10), overdue: due < todayMs })
        }
      }
    } else if (s.mode === 'ON_CONDITION' && belongsToSite(s)) {
      onCondition.push({ scheduleId: s.id, partCode: s.part.code, partName: s.part.name, target: targetLabel(s), qtyPerReplace: s.qtyPerReplace })
    }
  }

  rows.sort((a, b) => a.partCode.localeCompare(b.partCode))
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  // สรุปพอ/ขาด → เฉพาะอะไหล่ที่มีแผน
  const partIds = [...needMap.keys()]
  const partInfo = await prisma.cemsSparePart.findMany({ where: { id: { in: partIds } }, select: { id: true, code: true, name: true, unit: true } })
  const shortage = partInfo.map(p => {
    const need = needMap.get(p.id) ?? 0
    const stock = Math.round((stockMap.get(p.id) ?? 0) * 100) / 100
    return { partId: p.id, code: p.code, name: p.name, unit: p.unit, need, stock, diff: Math.round((stock - need) * 100) / 100 }
  }).sort((a, b) => a.diff - b.diff)

  return NextResponse.json({ year, siteId, rows, onCondition, upcoming, shortage })
}
