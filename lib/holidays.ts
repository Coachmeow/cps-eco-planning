import { prisma } from './prisma'
import { toDateKey } from './dateKey'

// คืน Set ของ key "YYYY-MM-DD" ของวันหยุดพิเศษทั้งหมด (ใช้หักวันทำงานฝั่ง server)
export async function getHolidaySet(): Promise<Set<string>> {
  const hs = await prisma.holiday.findMany({ select: { date: true } })
  return new Set(hs.map(h => toDateKey(h.date.toISOString())))
}
