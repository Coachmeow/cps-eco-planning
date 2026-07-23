// helper ร่วมของ PDF ปฏิทิน (staff/equipment/vehicle) — ฟอนต์ไทย + สีทีม + ตารางหมายเหตุ
import type { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RowInput } from 'jspdf-autotable'
import { SARABUN_REGULAR_B64, SARABUN_BOLD_B64 } from './sarabunFont'

export type RGB = [number, number, number]

// สีต่อทีม (mirror teamCellClass tier 2 = เฉด -200 bg / ตัวหนังสือดำ)
export const TEAM_PDF: Record<string, { bg: RGB; text: RGB }> = {
  ST:   { bg: [191, 219, 254], text: [0, 0, 0] },
  AMB:  { bg: [153, 246, 228], text: [0, 0, 0] },
  WP:   { bg: [233, 213, 255], text: [0, 0, 0] },
  CEMS: { bg: [254, 215, 170], text: [0, 0, 0] },
  WT:   { bg: [165, 243, 252], text: [0, 0, 0] },
  LOG:  { bg: [229, 231, 235], text: [0, 0, 0] },
}
export const teamPdf = (code: string) => TEAM_PDF[code] ?? TEAM_PDF.ST

// สีช่วงส่งซ่อม/Cal ในตาราง
export const MAINT_PDF: Record<'REPAIR' | 'CALIBRATION', { bg: RGB; text: RGB; label: string }> = {
  REPAIR:      { bg: [254, 226, 226], text: [185, 28, 28], label: 'ส่งซ่อม' },   // red-100 / red-700
  CALIBRATION: { bg: [243, 232, 255], text: [126, 34, 206], label: 'ส่งแคล' },   // purple-100 / purple-700
}

export const WHITE: RGB = [255, 255, 255]
export const SUNDAY_BG: RGB = [254, 242, 242]
export const HOLIDAY_BG: RGB = [245, 243, 255]
export const CONFLICT_BG: RGB = [254, 242, 242]
export const CONFLICT_TEXT: RGB = [185, 28, 28]
export const HEADER_BG: RGB = [51, 65, 85]

export const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const thaiDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export function registerSarabun(doc: jsPDF) {
  doc.addFileToVFS('Sarabun-Regular.ttf', SARABUN_REGULAR_B64)
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal')
  doc.addFileToVFS('Sarabun-Bold.ttf', SARABUN_BOLD_B64)
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold')
  doc.setFont('Sarabun', 'normal')
}

// หน้า "หมายเหตุงาน" ท้าย PDF (คอลัมน์กำหนดเอง) — ขึ้นหน้าใหม่ A3 แนวนอน
export function addNotesPage(doc: jsPDF, title: string, head: string[], rows: RowInput[], colWidths: number[], pageW: number) {
  if (rows.length === 0) return
  doc.addPage('a3', 'landscape')
  doc.setFont('Sarabun', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 41, 59)
  doc.text(title, 8, 10)
  const columnStyles: Record<number, { cellWidth: number }> = {}
  colWidths.forEach((w, i) => { columnStyles[i] = { cellWidth: i === colWidths.length - 1 ? pageW - 16 - colWidths.slice(0, -1).reduce((s, x) => s + x, 0) : w } })
  autoTable(doc, {
    startY: 14, margin: { left: 8, right: 8 }, theme: 'grid',
    head: [head], body: rows,
    styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 9, cellPadding: 1.5, valign: 'top', overflow: 'linebreak', lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: HEADER_BG, textColor: 255, fontSize: 9 },
    columnStyles,
  })
}
