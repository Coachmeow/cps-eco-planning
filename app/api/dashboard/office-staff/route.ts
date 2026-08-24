import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// พนักงานที่อยู่ออฟฟิศ (เคลียร์งาน) ในวันที่กำหนด = active + inPlanner ที่ "ไม่มีแผนออกภาคสนาม (FIELD)"
// และ "ไม่ลา (LEAVE)" ในวันนั้น ; คนลาจะนับแยก (onLeave)
export async function GET(req: NextRequest) {
  const dk = req.nextUrl.searchParams.get('date') ?? toDateKey(new Date())
  const [y, m, d] = dk.split('-').map(Number)
  const day = new Date(y, m - 1, d)

  // แผนงานในวันนั้น (รวมวันลูกของงานหลายวัน) → แยกคนที่ออกสนาม / ลา
  const rows = await prisma.staffAssignment.findMany({
    where: { assignedDate: { gte: day, lte: day } },
    select: { employeeId: true, status: true },
  })
  const fieldSet = new Set<number>()
  const leaveSet = new Set<number>()
  for (const r of rows) {
    if (r.status === 'FIELD') fieldSet.add(r.employeeId)
    else if (r.status === 'LEAVE') leaveSet.add(r.employeeId)
  }

  const emps = await prisma.employee.findMany({
    where: { isActive: true, inPlanner: true },
    select: { id: true, nickname: true, fullName: true, phone: true, primaryTeam: { select: { code: true } } },
  })

  const office = emps
    .filter((e) => !fieldSet.has(e.id) && !leaveSet.has(e.id))
    .map((e) => ({ id: e.id, nick: e.nickname || e.fullName, team: e.primaryTeam.code, tel: e.phone }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.nick.localeCompare(b.nick, 'th'))

  const onLeave = emps.filter((e) => leaveSet.has(e.id)).length

  return NextResponse.json({ date: dk, office, onLeave, field: fieldSet.size })
}
