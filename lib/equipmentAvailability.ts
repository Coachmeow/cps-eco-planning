// ตัดสินว่าเครื่องมือ "ว่างให้จอง" ในช่วงวันที่เลือกไหม โดยดูช่วงส่งซ่อม/Cal จาก EquipmentEvent
// (แทนการเช็ค status flag แบบไม่ดูวันที่) — ใช้ร่วมกันทั้ง API availability และ guard ตอนบันทึกงาน
//
// นิยาม:
//  - blocked  = ช่วงส่งซ่อม/Cal ทับกับช่วงที่จอง → จองไม่ได้
//  - tentative= จองหลังวัน "กำหนดรับกลับ" (expectedDate) แต่ยังไม่ยืนยันรับกลับจริง → จองได้แต่เผื่อเลื่อน
//  - ok       = ว่างปกติ
// เครื่อง RETIRED = ผู้เรียกจัดการเอง (endpoint คัดออกแล้ว / guard เช็ค status)

export type MaintState = 'ok' | 'tentative' | 'blocked'

export interface MaintEvent {
  sentDate:     string | Date
  expectedDate: string | Date | null
  returnedDate: string | Date | null
  type?:        string
}

const day = (d: string | Date): number => {
  const t = new Date(d)
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart <= bEnd && aEnd >= bStart

/** คืนสถานะความว่างของเครื่อง 1 ตัวสำหรับช่วง [bStart, bEnd] (ระดับวัน) จาก event ทั้งหมดของมัน */
export function maintStateForWindow(events: MaintEvent[], bStart: string | Date, bEnd: string | Date): { state: MaintState; ref?: MaintEvent } {
  const bS = day(bStart)
  const bE = day(bEnd)
  let tentative: MaintEvent | undefined

  for (const ev of events) {
    const s = day(ev.sentDate)
    if (ev.returnedDate) {
      // รับกลับแล้ว → ไม่ว่างเฉพาะช่วง [ส่ง, รับกลับ]
      if (overlaps(s, day(ev.returnedDate), bS, bE)) return { state: 'blocked', ref: ev }
    } else if (ev.expectedDate) {
      const exp = day(ev.expectedDate)
      if (overlaps(s, exp, bS, bE)) return { state: 'blocked', ref: ev }   // ยังอยู่ศูนย์ในช่วงนี้
      if (bS > exp) tentative = ev                                          // จองหลังกำหนดรับกลับ แต่ยังไม่ยืนยัน
    } else {
      // ส่งไปแล้วแต่ไม่มีกำหนดรับกลับ (เช่น BROKEN) → บล็อกตั้งแต่วันส่งเป็นต้นไป
      if (bE >= s) return { state: 'blocked', ref: ev }
    }
  }
  return tentative ? { state: 'tentative', ref: tentative } : { state: 'ok' }
}

/** where-clause หา event ที่อาจทับช่วงจอง (ยังไม่คืน หรือคืนหลังวันเริ่มจอง) — ใช้ลดข้อมูลที่ดึง */
export function overlappingEventWhere(bStart: Date, bEnd: Date) {
  return {
    sentDate: { lte: bEnd },
    OR: [{ returnedDate: null }, { returnedDate: { gte: bStart } }],
  }
}
