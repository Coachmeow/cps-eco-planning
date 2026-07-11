import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCems, forbidden } from '@/lib/auth'

// รายชื่อพนักงาน active (id/nickname/fullName) สำหรับเลือก "ผู้เบิก" ในฟอร์มเบิกอะไหล่ในระบบ
export async function GET() {
  if (!await requireCems()) return forbidden()
  const employees = await prisma.employee.findMany({
    where: { isActive: true }, select: { id: true, nickname: true, fullName: true },
    orderBy: [{ primaryTeam: { sortOrder: 'asc' } }, { fullName: 'asc' }],
  })
  return NextResponse.json(employees)
}
