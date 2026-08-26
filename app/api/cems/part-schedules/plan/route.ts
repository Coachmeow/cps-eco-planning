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

  const [schedules, txns, allSites] = await Promise.all([
    prisma.cemsPartSchedule.findMany({
      where: { isActive: true },
      include: {
        part: { select: { id: true, code: true, name: true, unit: true } },
        analyzer: { select: { id: true, tag: true, currentSiteId: true, homeSiteId: true } },
        site: { select: { id: true, code: true } },
      },
    }),
    prisma.cemsPartTxn.groupBy({ by: ['partId', 'type'], _sum: { qty: true } }),
    prisma.cemsSite.findMany({ select: { id: true, code: true } }),
  ])
  const siteCode = new Map(allSites.map(s => [s.id, s.code]))

  // stock ปัจจุบันต่ออะไหล่
  const stockMap = new Map<number, number>()
  for (const t of txns) {
    const q = Number(t._sum.qty ?? 0)
    stockMap.set(t.partId, (stockMap.get(t.partId) ?? 0) + (t.type === 'OUT' ? -q : q))
  }

  // ── การเปลี่ยนจริง (OUT ตามแผน/ชำรุด) ในปีนี้ ต่อแผน → ใช้มาร์กจุดเขียว + นับรอบ ──
  const schedIds = schedules.map(s => s.id)
  const yStart = new Date(Date.UTC(year, 0, 1))
  const yEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const actualTxns = schedIds.length ? await prisma.cemsPartTxn.findMany({
    where: { type: 'OUT', scheduleId: { in: schedIds }, txnDate: { gte: yStart, lte: yEnd } },
    select: { scheduleId: true, txnDate: true, analyzerId: true },
  }) : []
  // ป้ายเครื่อง (tag + S/N) สำหรับ hover จุดเขียว
  const anIds = [...new Set(actualTxns.map(t => t.analyzerId).filter((x): x is number => x != null))]
  const anMap = new Map<number, string>()
  if (anIds.length) {
    const ans = await prisma.cemsAnalyzer.findMany({ where: { id: { in: anIds } }, select: { id: true, tag: true, serialNo: true } })
    for (const a of ans) anMap.set(a.id, a.serialNo ? `${a.tag} · S/N ${a.serialNo}` : a.tag)
  }
  // group: scheduleId → เดือน → { count, labels }
  const actualBySched = new Map<number, Map<number, { count: number; labels: Set<string> }>>()
  for (const t of actualTxns) {
    if (t.scheduleId == null) continue
    const m = new Date(t.txnDate).getUTCMonth() + 1
    if (!actualBySched.has(t.scheduleId)) actualBySched.set(t.scheduleId, new Map())
    const mm = actualBySched.get(t.scheduleId)!
    if (!mm.has(m)) mm.set(m, { count: 0, labels: new Set() })
    const cell = mm.get(m)!
    cell.count += 1
    if (t.analyzerId != null) { const lb = anMap.get(t.analyzerId); if (lb) cell.labels.add(lb) }
  }

  // anchor = nextDueDate เท่านั้น (= วันเปลี่ยนล่าสุด + interval) → ไล่ไปข้างหน้า ไม่ลงแผนย้อนหลัง
  const anchorOf = (s: typeof schedules[number]) => s.nextDueDate ?? null
  // siteId = null → โหมดทุกไซต์ (รวมทุกแผน)
  const belongsToSite = (s: typeof schedules[number]) =>
    siteId == null || s.siteId === siteId || (s.analyzer != null && (s.analyzer.currentSiteId === siteId || s.analyzer.homeSiteId === siteId))
  const schedSiteCode = (s: typeof schedules[number]) =>
    s.site?.code ?? (s.analyzer ? (siteCode.get(s.analyzer.currentSiteId ?? -1) ?? siteCode.get(s.analyzer.homeSiteId ?? -1) ?? null) : null)
  // แผนผูกไซต์อย่างเดียว → ป้าย = รหัสไซต์ (เผื่อแผนเก่ายังไม่ backfill ใช้ tag เครื่องเป็น fallback)
  const targetLabel = (s: typeof schedules[number]) =>
    s.site?.code ?? schedSiteCode(s) ?? (s.analyzer ? s.analyzer.tag : 'ไซต์')

  const todayMs = (() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) })()
  const monthEndMs = (() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth() + 1, 0) })()

  // ── ตารางปี (เฉพาะไซต์ที่เลือก) ──
  // แต่ละเดือนมีได้ทั้งมาร์ก "แผน" (plan/overdue) และ "เปลี่ยนจริง" (actual) ซ้อนกัน
  type Cell = { plan?: 'plan' | 'overdue'; actual?: number; actualLabel?: string }
  const rows: { scheduleId: number; partId: number; partCode: string; partName: string; unit: string | null; target: string; intervalMonths: number | null; qtyPerReplace: number; months: Record<number, Cell>; total: number; rounds: number }[] = []
  const onCondition: { scheduleId: number; partCode: string; partName: string; target: string; qtyPerReplace: number }[] = []
  const upcoming: { scheduleId: number; partId: number; partCode: string; partName: string; target: string; dueDate: string; overdue: boolean }[] = []

  // ── สรุปพอ/ขาด (รวมทุกไซต์) ──
  const needMap = new Map<number, number>()

  for (const s of schedules) {
    if (s.mode === 'TIME_BASE' && s.intervalMonths) {
      const occ = occurrencesInYear(year, s.intervalMonths, anchorOf(s))
      // สรุปพอ/ขาด รวมทุกไซต์
      needMap.set(s.partId, (needMap.get(s.partId) ?? 0) + occ.length * s.qtyPerReplace)

      if (belongsToSite(s)) {
        const months: Record<number, Cell> = {}
        // มาร์กแผน
        for (const o of occ) {
          const m = o.getUTCMonth() + 1
          const overdue = o.getTime() < todayMs
          months[m] = { ...(months[m] ?? {}), plan: overdue ? 'overdue' : 'plan' }
        }
        // มาร์กเปลี่ยนจริง (จาก OUT txn ที่ผูกแผนนี้) — โชว์ทุกครั้งในปี
        const am = actualBySched.get(s.id)
        let rounds = 0
        if (am) {
          for (const [m, info] of am) {
            months[m] = { ...(months[m] ?? {}), actual: info.count, actualLabel: [...info.labels].join(', ') || undefined }
            rounds += info.count
          }
        }
        // เผื่อการเปลี่ยนเก่าที่ยังไม่มี txn ผูกแผน (ก่อนมีระบบนี้) — ใช้ lastReplacedDate เป็น fallback
        if (s.lastReplacedDate) {
          const lr = new Date(s.lastReplacedDate)
          const lm = lr.getUTCMonth() + 1
          if (lr.getUTCFullYear() === year && !(months[lm]?.actual)) {
            months[lm] = { ...(months[lm] ?? {}), actual: 1 }
            rounds += 1
          }
        }
        const total = occ.length * s.qtyPerReplace   // ยอดวางแผน (ชิ้น) ปีนี้
        rows.push({ scheduleId: s.id, partId: s.partId, partCode: s.part.code, partName: s.part.name, unit: s.part.unit, target: targetLabel(s), intervalMonths: s.intervalMonths, qtyPerReplace: s.qtyPerReplace, months, total, rounds })

        // ใกล้/เลยกำหนด
        if (s.nextDueDate) {
          const due = new Date(s.nextDueDate).getTime()
          if (due <= monthEndMs) upcoming.push({ scheduleId: s.id, partId: s.partId, partCode: s.part.code, partName: s.part.name, target: targetLabel(s), dueDate: s.nextDueDate.toISOString().slice(0, 10), overdue: due < todayMs })
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
