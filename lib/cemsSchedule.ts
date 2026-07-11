import { prisma } from './prisma'

// ตัวช่วยคำนวณรอบเปลี่ยนอะไหล่ (Time-base) — ทำงานระดับวัน (UTC) เพราะ field เป็น @db.Date
export function addMonths(d: Date, n: number): Date {
  const t = new Date(d)
  const day = t.getUTCDate()
  const base = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1))
  // clamp วันสิ้นเดือน (เช่น 31 → เดือนที่ไม่มี 31)
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(day, lastDay))
  return base
}

/** วันถึงกำหนดถัดไป = lastReplacedDate + intervalMonths (คืน null ถ้าไม่ใช่ TIME_BASE หรือไม่มีข้อมูลพอ) */
export function computeNextDue(mode: string, intervalMonths: number | null, lastReplacedDate: Date | null): Date | null {
  if (mode !== 'TIME_BASE' || !intervalMonths || !lastReplacedDate) return null
  return addMonths(lastReplacedDate, intervalMonths)
}

/** รายการวันถึงกำหนดของแผนหนึ่ง ที่ตกอยู่ในปี year (ค.ศ.)
 *  ไล่ "ไปข้างหน้าเท่านั้น" จาก anchor (= nextDueDate) — ไม่นับย้อนหลัง/ไม่ลงแผนก่อนวันเปลี่ยน
 *  anchor ควรเป็น nextDueDate (= วันเปลี่ยนล่าสุด + interval) ; ถ้าไม่มี anchor = ยังคำนวณแผนไม่ได้ */
export function occurrencesInYear(
  year: number,
  intervalMonths: number | null,
  anchor: Date | null,
): Date[] {
  if (!intervalMonths || intervalMonths <= 0 || !anchor) return []
  const yStart = Date.UTC(year, 0, 1)
  const yEnd = Date.UTC(year, 11, 31)
  let cur = new Date(anchor)
  let guard = 0
  // เดินไปข้างหน้าจนถึงต้นปีที่ขอ (ไม่ถอยหลังต่ำกว่า anchor)
  while (cur.getTime() < yStart && guard++ < 600) cur = addMonths(cur, intervalMonths)
  const out: Date[] = []
  guard = 0
  while (cur.getTime() <= yEnd && guard++ < 600) {
    out.push(new Date(cur))
    cur = addMonths(cur, intervalMonths)
  }
  return out
}

export interface DueSchedule {
  id: number
  analyzerId: number | null
  siteId: number | null
  mode: string
  intervalMonths: number | null
  nextDueDate: Date | null
  analyzer: { id: number; tag: string } | null
  site: { id: number; code: string } | null
  overdue: boolean
  dueThisMonth: boolean
}

/** แผนที่ active ทั้งหมดของอะไหล่ชิ้นหนึ่ง พร้อม flag overdue/dueThisMonth
 *  ใช้เป็นตัวเลือกในฟอร์มเบิก — "ตามแผน" กรอง dueThisMonth||overdue ; "ชำรุด" ใช้ทั้งหมดหา schedule ของ analyzer/ไซต์ที่เลือก */
export async function duePartSchedules(partId: number): Promise<DueSchedule[]> {
  const rows = await prisma.cemsPartSchedule.findMany({
    where: { partId, isActive: true },
    include: {
      analyzer: { select: { id: true, tag: true } },
      site: { select: { id: true, code: true } },
    },
    orderBy: [{ nextDueDate: 'asc' }],
  })
  const now = new Date()
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const monthEndMs = Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)
  return rows.map(s => {
    const due = s.nextDueDate ? new Date(s.nextDueDate).getTime() : null
    return {
      id: s.id, analyzerId: s.analyzerId, siteId: s.siteId, mode: s.mode,
      intervalMonths: s.intervalMonths, nextDueDate: s.nextDueDate,
      analyzer: s.analyzer, site: s.site,
      overdue: due != null && due < todayMs,
      dueThisMonth: due != null && due <= monthEndMs,
    }
  })
}
