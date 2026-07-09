import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { toDateKey } from '@/lib/dateKey'

// Export Excel แผนงานพนักงาน (ปฏิทินรายเดือน)
// ?year&month → 1 sheet: แถว = พนักงาน, คอลัมน์ = วันที่ 1..N, ช่อง = รหัสไซต์/สถานะ
// สถานะ (map ให้ตรงกับ CalendarCell): OFFICE=S, LEAVE=B, HOLIDAY=V, CAL=Cal, TRAINING=TR

const STATUS_LABEL: Record<string, string> = {
  OFFICE: 'S', LEAVE: 'B', HOLIDAY: 'V', CAL: 'Cal', TRAINING: 'TR',
}

// ลำดับทีมให้ตรงกับหน้าปฏิทิน
const TEAM_ORDER = ['ST', 'AMB', 'WP', 'WT', 'CEMS', 'LOG']

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0)
  const daysInMonth = endDate.getDate()

  // พนักงานที่อยู่ในการวางแผน (เรียงตามทีม → ชื่อ) = แถวของตาราง
  const employees = await prisma.employee.findMany({
    where: { isActive: true, inPlanner: true },
    include: { primaryTeam: true },
    orderBy: [{ primaryTeamId: 'asc' }, { subTeamOrder: 'asc' }, { fullName: 'asc' }],
  })
  employees.sort((a, b) => {
    const ia = TEAM_ORDER.indexOf(a.primaryTeam.code)
    const ib = TEAM_ORDER.indexOf(b.primaryTeam.code)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  const assignments = await prisma.staffAssignment.findMany({
    where: { assignedDate: { gte: startDate, lte: endDate } },
    include: {
      employee:    { include: { primaryTeam: true } },
      site:        true,
      serviceType: true,
    },
    orderBy: [{ employeeId: 'asc' }, { assignedDate: 'asc' }],
  })

  // index: employeeId → dateKey → assignments[]
  const byEmp = new Map<number, Map<string, typeof assignments>>()
  for (const a of assignments) {
    let dayMap = byEmp.get(a.employeeId)
    if (!dayMap) { dayMap = new Map(); byEmp.set(a.employeeId, dayMap) }
    const key = toDateKey(a.assignedDate)
    const arr = dayMap.get(key)
    if (arr) arr.push(a)
    else dayMap.set(key, [a] as typeof assignments)
  }

  // เนื้อหาในช่อง: FIELD → รหัสไซต์ (cross-team ต่อท้าย ×TEAM) ; อื่น ๆ → ตัวย่อสถานะ
  const cellText = (list: typeof assignments): string => {
    if (!list || list.length === 0) return ''
    return list.map(a => {
      if (a.status !== 'FIELD') return STATUS_LABEL[a.status] ?? a.status
      const code = a.site?.code ?? '—'
      return a.isCrossTeam ? `${code}×${a.serviceType?.code ?? '?'}` : code
    }).join(' / ')
  }

  // สร้างแถว (object ต่อพนักงาน) โดยคีย์คอลัมน์ = เลขวัน
  const rows = employees.map(emp => {
    const dayMap = byEmp.get(emp.id)
    const row: Record<string, string | number> = {
      'พนักงาน': emp.nickname ?? emp.fullName,
      'ทีม': emp.primaryTeam.code,
    }
    let fieldDays = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = toDateKey(new Date(year, month - 1, d))
      const list = dayMap?.get(key)
      row[String(d)] = cellText(list ?? ([] as unknown as typeof assignments))
      if (list) for (const a of list) if (a.status === 'FIELD' && !a.parentId) fieldDays += Number(a.estimatedDays)
    }
    row['รวมวันสนาม'] = fieldDays || ''
    return row
  })

  // header ชัดเจน แม้ไม่มีข้อมูล — สร้าง sheet จาก array-of-objects โดยกำหนดลำดับคอลัมน์เอง
  const header = ['พนักงาน', 'ทีม', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), 'รวมวันสนาม']
  const ws = XLSX.utils.json_to_sheet(rows, { header })
  ws['!cols'] = [
    { wch: 16 }, { wch: 6 },
    ...Array.from({ length: daysInMonth }, () => ({ wch: 7 })),
    { wch: 11 },
  ]

  const wb = XLSX.utils.book_new()
  const thaiMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  XLSX.utils.book_append_sheet(wb, ws, `${thaiMonths[month]} ${year + 543}`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const filename = `staff_${year}-${String(month).padStart(2, '0')}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
