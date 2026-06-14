import { toDateKey } from './dateKey'

// วันทำงาน = จันทร์–เสาร์ (หยุดเฉพาะวันอาทิตย์) หักวันหยุดพิเศษที่ส่งเข้ามา
// holidays = Set ของ key "YYYY-MM-DD"
export function countWorkdays(year: number, month: number, holidays?: Set<string>): number {
  const total = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= total; d++) {
    const date = new Date(year, month - 1, d)
    if (date.getDay() === 0) continue                 // อาทิตย์ = หยุดประจำสัปดาห์
    if (holidays && holidays.has(toDateKey(date))) continue  // วันหยุดพิเศษ
    count++
  }
  return count
}

export function calcUtil(assignedDays: number, workdays: number): number {
  if (workdays === 0) return 0
  return Math.round((assignedDays / workdays) * 100)
}
