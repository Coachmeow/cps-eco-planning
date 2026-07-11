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

/** รายการวันถึงกำหนดของแผนหนึ่ง ที่ตกอยู่ในปี year (ค.ศ.) — ไล่จาก anchor ทั้งไปข้างหน้า/ถอยหลังทีละ interval */
export function occurrencesInYear(
  year: number,
  intervalMonths: number | null,
  anchor: Date | null,
): Date[] {
  if (!intervalMonths || intervalMonths <= 0) return []
  const yStart = Date.UTC(year, 0, 1)
  const yEnd = Date.UTC(year, 11, 31)
  // ถ้าไม่มี anchor → สมมติถึงกำหนดครั้งแรกต้นปี
  let cur = anchor ? new Date(anchor) : new Date(Date.UTC(year, 0, 1))
  // ถอยหลังให้ไม่เกินต้นปี
  let guard = 0
  while (cur.getTime() > yStart && guard++ < 240) cur = addMonths(cur, -intervalMonths)
  // เดินไปข้างหน้าเก็บที่อยู่ในปี
  const out: Date[] = []
  guard = 0
  while (cur.getTime() <= yEnd && guard++ < 240) {
    if (cur.getTime() >= yStart) out.push(new Date(cur))
    cur = addMonths(cur, intervalMonths)
  }
  return out
}
