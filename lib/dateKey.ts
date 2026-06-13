// แปลงวันเป็น key "YYYY-MM-DD" แบบ timezone-safe
//  - string (ISO จาก DB เช่น "2026-06-01T00:00:00.000Z") → ตัด 10 ตัวแรก = วันที่ที่เก็บไว้จริง
//  - Date object (เช่น เซลล์ปฏิทินที่เป็นเที่ยงคืนเวลาท้องถิ่น) → ใช้ปี/เดือน/วันตามเวลาท้องถิ่น
//    (ห้ามใช้ toISOString เพราะจะเลื่อนเป็น UTC ทำให้วันเพี้ยนใน timezone +7)
export function toDateKey(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 10)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
