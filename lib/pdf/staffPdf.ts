// สร้าง PDF แผนงานพนักงาน หน้าตาเหมือนปฏิทินบนจอ (สีทีม + merge งานหลายวัน + cross-team)
// ทำฝั่ง client จาก state ที่หน้า StaffCalendar โหลดไว้แล้ว — ไม่มี API/DB
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CellDef, RowInput } from 'jspdf-autotable'
import { toDateKey } from '@/lib/dateKey'
import { SARABUN_REGULAR_B64, SARABUN_BOLD_B64 } from './sarabunFont'
import type { Employee, StaffAssignment, CalendarData, ConflictSet } from '@/lib/types'

type RGB = [number, number, number]

// สีต่อทีม (mirror teamCellClass tier 1 = เฉด -100 bg / -800 text ที่ปฏิทินใช้)
const TEAM_PDF: Record<string, { bg: RGB; text: RGB }> = {
  ST:   { bg: [219, 234, 254], text: [30, 64, 175] },   // blue-100 / blue-800
  AMB:  { bg: [204, 251, 241], text: [17, 94, 89] },     // teal-100 / teal-800
  WP:   { bg: [243, 232, 255], text: [107, 33, 168] },   // purple-100 / purple-800
  CEMS: { bg: [255, 237, 213], text: [154, 52, 18] },    // orange-100 / orange-800
  WT:   { bg: [207, 250, 254], text: [21, 94, 117] },    // cyan-100 / cyan-800
  LOG:  { bg: [243, 244, 246], text: [55, 65, 81] },     // gray-100 / gray-700
}

const STATUS_BG:   RGB = [241, 245, 249]  // slate-100
const STATUS_TEXT: RGB = [100, 116, 139]  // slate-500
const CONFLICT_BG: RGB = [254, 242, 242]  // red-50
const CONFLICT_TEXT: RGB = [185, 28, 28]  // red-700
const SUNDAY_BG:  RGB = [254, 242, 242]    // red-50
const HOLIDAY_BG: RGB = [245, 243, 255]    // violet-50
const WHITE: RGB = [255, 255, 255]
const HEADER_BG: RGB = [51, 65, 85]        // slate-700

const STATUS_LABEL: Record<string, string> = {
  OFFICE: 'S', LEAVE: 'B', HOLIDAY: 'V', CAL: 'Cal', TRAINING: 'TR',
}

const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thaiDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const DAYS_PER_BLOCK = 16   // แบ่งเดือนเป็นบล็อก ~16 วัน/หน้า ให้อ่านออกบน A4 แนวนอน

export interface ExportStaffPdfArgs {
  year: number
  month: number
  employees: Employee[]
  calendarData: CalendarData
  days: Date[]
  holidayMap: Map<string, string>
  conflicts: ConflictSet
}

// เนื้อหา + สีของ 1 ช่องวัน (คืน null ถ้าเป็นวันที่ถูก merge เข้าช่องก่อนหน้าแล้ว)
function buildDayCell(
  emp: Employee, dayMap: Map<string, StaffAssignment[]> | undefined,
  days: Date[], i: number, blockEnd: number, holidayMap: Map<string, string>,
  staffConflicts: Set<string>,
): { cell: CellDef; span: number } {
  const dateKey = toDateKey(days[i])
  const dayAssign = dayMap?.get(dateKey) ?? []

  // merge งานหลายวัน (parent FIELD estimatedDays>=2) — นับต่อเนื่องแต่ไม่เกินขอบบล็อก
  const parent = dayAssign.find(a => a.parentId == null && a.status === 'FIELD' && Number(a.estimatedDays) >= 2)
  let span = 1
  if (parent) {
    while (i + span < blockEnd) {
      const next = dayMap?.get(toDateKey(days[i + span])) ?? []
      if (!next.some(a => a.parentId === parent.id)) break
      span++
    }
  }

  // conflict = วันใดในช่วง merge มี conflict
  let isConflict = false
  for (let k = 0; k < span; k++) {
    if (staffConflicts.has(`${emp.id}-${toDateKey(days[i + k])}`)) { isConflict = true; break }
  }

  const dow = days[i].getDay()
  const isHol = holidayMap.has(dateKey)

  // ช่องว่าง → สีตามวันอาทิตย์/วันหยุด
  if (dayAssign.length === 0) {
    const bg: RGB = isHol ? HOLIDAY_BG : dow === 0 ? SUNDAY_BG : WHITE
    return { cell: { content: '', colSpan: span, styles: { fillColor: bg } }, span }
  }

  const primary = dayAssign.find(a => !a.isCrossTeam)
  const crossTeam = dayAssign.filter(a => a.isCrossTeam)
  const display = primary ?? crossTeam[0]

  // ข้อความในช่อง
  let text = ''
  if (display) {
    text = display.status !== 'FIELD'
      ? (STATUS_LABEL[display.status] ?? display.status)
      : (display.site?.code ?? '—')
    if (span > 1) text += ` (${Number(display.estimatedDays)} วัน)`
  }
  for (const a of crossTeam) {
    if (primary && a.site?.code !== primary.site?.code && a.site?.code) text += ` ${a.site.code}`
    text += ` ×${a.serviceType?.code ?? '?'}`
  }

  // สี
  let bg: RGB = WHITE, txt: RGB = [51, 65, 85]
  if (isConflict) { bg = CONFLICT_BG; txt = CONFLICT_TEXT }
  else if (display?.status === 'FIELD') {
    const teamCode = (dayAssign.find(a => a.status === 'FIELD')?.serviceType?.code) ?? emp.primaryTeam.code
    const c = TEAM_PDF[teamCode] ?? TEAM_PDF.ST
    bg = c.bg; txt = c.text
  } else {
    bg = STATUS_BG; txt = STATUS_TEXT
  }

  return { cell: { content: text.trim(), colSpan: span, styles: { fillColor: bg, textColor: txt } }, span }
}

export function exportStaffPdf(args: ExportStaffPdfArgs): void {
  const { year, month, employees, calendarData, days, holidayMap, conflicts } = args
  const staffConflicts = conflicts.staffConflicts

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  // ลงทะเบียนฟอนต์ไทย
  doc.addFileToVFS('Sarabun-Regular.ttf', SARABUN_REGULAR_B64)
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal')
  doc.addFileToVFS('Sarabun-Bold.ttf', SARABUN_BOLD_B64)
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold')
  doc.setFont('Sarabun', 'normal')

  const pageW = doc.internal.pageSize.getWidth()

  // คำนวณรวมวันสนามต่อคน (ทั้งเดือน)
  const fieldDaysOf = (empId: number): number => {
    const dayMap = calendarData.get(empId)
    if (!dayMap) return 0
    let sum = 0
    for (const list of dayMap.values())
      for (const a of list)
        if (a.status === 'FIELD' && !a.parentId) sum += Number(a.estimatedDays)
    return sum
  }

  // แบ่งวันเป็นบล็อก
  const blocks: [number, number][] = []
  for (let s = 0; s < days.length; s += DAYS_PER_BLOCK) blocks.push([s, Math.min(s + DAYS_PER_BLOCK, days.length)])

  blocks.forEach(([blockStart, blockEnd], bi) => {
    if (bi > 0) doc.addPage()

    // หัวกระดาษ
    doc.setFont('Sarabun', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 41, 59)
    doc.text(`แผนงานพนักงาน — ${thaiMonths[month]} ${year + 543}`, 8, 10)
    doc.setFont('Sarabun', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139)
    doc.text(`วันที่ ${blockStart + 1}–${blockEnd} · หน้า ${bi + 1}/${blocks.length}`, 8, 15)

    // head: พนักงาน / ทีม / วันที่... / (รวม เฉพาะบล็อกสุดท้าย)
    const dayHead: CellDef[] = []
    for (let i = blockStart; i < blockEnd; i++) {
      const dow = days[i].getDay()
      const isHol = holidayMap.has(toDateKey(days[i]))
      const headText: RGB = (isHol || dow === 0) ? [220, 38, 38] : WHITE
      dayHead.push({ content: `${days[i].getDate()}\n${isHol ? 'ห' : thaiDays[dow]}`, styles: { textColor: headText } })
    }
    const isLast = bi === blocks.length - 1
    const head: RowInput[] = [[
      { content: 'พนักงาน' }, { content: 'ทีม' },
      ...dayHead,
      ...(isLast ? [{ content: 'รวม\nสนาม' } as CellDef] : []),
    ]]

    // body
    const body: RowInput[] = employees.map(emp => {
      const dayMap = calendarData.get(emp.id)
      const row: CellDef[] = [
        { content: `${emp.nickname ?? emp.fullName.split(' ')[0]}${emp.isSubLeader ? ' *' : ''}`,
          styles: { halign: 'left', fontStyle: emp.isSubLeader ? 'bold' : 'normal' } },
        { content: `${emp.primaryTeam.code}${emp.subTeam ? `\n${emp.subTeam.name}` : ''}`,
          styles: { fontSize: 5.5 } },
      ]
      let i = blockStart
      while (i < blockEnd) {
        const { cell, span } = buildDayCell(emp, dayMap, days, i, blockEnd, holidayMap, staffConflicts)
        row.push(cell)
        i += span
      }
      if (isLast) {
        const fd = fieldDaysOf(emp.id)
        row.push({ content: fd > 0 ? String(fd) : '—', styles: { fontStyle: 'bold', textColor: [4, 120, 87] } })
      }
      return row
    })

    const dayColWidth = (pageW - 8 - 8 - 24 - 12 - (isLast ? 10 : 0)) / (blockEnd - blockStart)
    const dayColStyles: Record<number, { cellWidth: number }> = {}
    for (let c = 0; c < (blockEnd - blockStart); c++) dayColStyles[2 + c] = { cellWidth: dayColWidth }

    autoTable(doc, {
      head, body,
      startY: 18,
      margin: { left: 8, right: 8, top: 18 },
      theme: 'grid',
      styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 6, cellPadding: 0.7, halign: 'center', valign: 'middle', overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: HEADER_BG, textColor: 255, fontSize: 6, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 24, halign: 'left' },
        1: { cellWidth: 12 },
        ...dayColStyles,
        ...(isLast ? { [2 + (blockEnd - blockStart)]: { cellWidth: 10 } } : {}),
      },
    })
  })

  doc.save(`staff_${year}-${String(month).padStart(2, '0')}.pdf`)
}
